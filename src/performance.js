///////////////////////////////////////////////////////////////////////performance.js — 性能优化：上行合包队列 / 下行Grain分包器 / 流桥接///////////////////////////////////////////////
import { log, 上行合包目标字节, 上行队列最大字节, 上行队列最大条目, 下行Grain包字节, 下行Grain尾部阈值, 下行Grain静默毫秒 } from './state.js';
import { 数据转Uint8Array, closeSocketQuietly, WebSocket发送并等待 } from './utils.js';

export function 创建上行写入队列({ 获取写入器, 释放写入器, 重试连接, 关闭连接, 名称 = '上行队列' }) {
	let chunks = [];
	let head = 0;
	let queuedBytes = 0;
	let draining = false;
	let closed = false;
	let bundleBuffer = null;
	let idleResolvers = [];
	let activeCompletions = null;

	const settleCompletions = (completions, err = null) => {
		if (!completions) return;
		for (const completion of completions) {
			if (err) completion.reject(err);
			else completion.resolve();
		}
	};

	const rejectQueued = (err) => {
		for (let i = head; i < chunks.length; i++) {
			const item = chunks[i];
			if (item?.completions) settleCompletions(item.completions, err);
		}
	};

	const compact = () => {
		if (head > 32 && head * 2 >= chunks.length) {
			chunks = chunks.slice(head);
			head = 0;
		}
	};

	const resolveIdle = () => {
		if (queuedBytes || draining || !idleResolvers.length) return;
		const resolvers = idleResolvers;
		idleResolvers = [];
		for (const resolve of resolvers) resolve();
	};

	const clear = (err = null) => {
		const closeErr = err || (closed ? new Error(`${名称}: queue closed`) : null);
		if (closeErr) {
			rejectQueued(closeErr);
			settleCompletions(activeCompletions, closeErr);
			activeCompletions = null;
		}
		chunks = [];
		head = 0;
		queuedBytes = 0;
		resolveIdle();
	};

	const shift = () => {
		if (head >= chunks.length) return null;
		const item = chunks[head];
		chunks[head++] = undefined;
		queuedBytes -= item.chunk.byteLength;
		compact();
		return item;
	};

	const bundle = () => {
		const first = shift();
		if (!first) return null;
		if (head >= chunks.length || first.chunk.byteLength >= 上行合包目标字节) return first;

		let byteLength = first.chunk.byteLength;
		let end = head;
		let allowRetry = first.allowRetry;
		let completions = first.completions || null;
		while (end < chunks.length) {
			const next = chunks[end];
			const nextLength = byteLength + next.chunk.byteLength;
			if (nextLength > 上行合包目标字节) break;
			byteLength = nextLength;
			allowRetry = allowRetry && next.allowRetry;
			if (next.completions) completions = completions ? completions.concat(next.completions) : next.completions;
			end++;
		}
		if (end === head) return first;

		const output = (bundleBuffer ||= new Uint8Array(上行合包目标字节));
		output.set(first.chunk);
		let offset = first.chunk.byteLength;
		while (head < end) {
			const next = chunks[head];
			chunks[head++] = undefined;
			queuedBytes -= next.chunk.byteLength;
			output.set(next.chunk, offset);
			offset += next.chunk.byteLength;
		}
		compact();
		return { chunk: output.subarray(0, byteLength), allowRetry, completions };
	};

	const drain = async () => {
		if (draining || closed) return;
		draining = true;
		try {
			for (; ;) {
				if (closed) break;
				const item = bundle();
				if (!item) break;
				let writer = 获取写入器();
				if (!writer) throw new Error(`${名称}: remote writer unavailable`);
				const completions = item.completions || null;
				activeCompletions = completions;
				try {
					try {
						await writer.write(item.chunk);
					} catch (err) {
						释放写入器?.();
						if (!item.allowRetry || typeof 重试连接 !== 'function') throw err;
						await 重试连接();
						writer = 获取写入器();
						if (!writer) throw err;
						await writer.write(item.chunk);
					}
					settleCompletions(completions);
				} catch (err) {
					settleCompletions(completions, err);
					throw err;
				} finally {
					if (activeCompletions === completions) activeCompletions = null;
				}
			}
		} catch (err) {
			closed = true;
			clear(err);
			log(`[${名称}] 写入失败: ${err?.message || err}`);
			try { 关闭连接?.(err) } catch (_) { }
		} finally {
			draining = false;
			if (!closed && head < chunks.length) queueMicrotask(drain);
			else resolveIdle();
		}
	};

	const enqueue = (data, allowRetry = true, waitForFlush = false) => {
		if (closed) return false;
		// 首包解析阶段 socket 可能尚未建立；返回 false 交给上层继续走协议解析路径。
		if (!获取写入器()) return false;
		const chunk = 数据转Uint8Array(data);
		if (!chunk.byteLength) return true;
		const nextBytes = queuedBytes + chunk.byteLength;
		const nextItems = chunks.length - head + 1;
		if (nextBytes > 上行队列最大字节 || nextItems > 上行队列最大条目) {
			closed = true;
			const err = Object.assign(new Error(`${名称}: upload queue overflow (${nextBytes}B/${nextItems})`), { isQueueOverflow: true });
			clear(err);
			log(`[${名称}] 队列超限，关闭连接`);
			try { 关闭连接?.(err) } catch (_) { }
			throw err;
		}
		let completionPromise = null;
		let completions = null;
		if (waitForFlush) {
			completions = [];
			completionPromise = new Promise((resolve, reject) => completions.push({ resolve, reject }));
		}
		chunks.push({ chunk, allowRetry, completions });
		queuedBytes = nextBytes;
		if (!draining) queueMicrotask(drain);
		return waitForFlush ? completionPromise.then(() => true) : true;
	};

	return {
		写入(data, allowRetry = true) {
			return enqueue(data, allowRetry, false);
		},
		写入并等待(data, allowRetry = true) {
			return enqueue(data, allowRetry, true);
		},
		async 等待空() {
			if (!queuedBytes && !draining) return;
			await new Promise(resolve => idleResolvers.push(resolve));
		},
		清空() {
			closed = true;
			clear();
		}
	};
}

export function 创建下行Grain发送器(webSocket, headerData = null) {
	const packetCap = 下行Grain包字节;
	const tailBytes = 下行Grain尾部阈值;
	const lowWaterBytes = Math.max(4096, tailBytes << 3);
	let header = headerData;
	let pendingBuffer = new Uint8Array(packetCap);
	let pendingBytes = 0;
	let flushTimer = null;
	let microtaskQueued = false;
	let generation = 0;
	let scheduledGeneration = 0;
	let waitRounds = 0;
	let flushPromise = null;

	const 发送原始块 = async (chunk) => {
		if (webSocket.readyState !== WebSocket.OPEN) throw new Error('ws.readyState is not open');
		await WebSocket发送并等待(webSocket, chunk);
	};

	const 附加响应头 = (chunk) => {
		if (!header) return chunk;
		const merged = new Uint8Array(header.length + chunk.byteLength);
		merged.set(header, 0);
		merged.set(chunk, header.length);
		header = null;
		return merged;
	};

	const flush = async () => {
		while (flushPromise) await flushPromise;
		if (flushTimer) clearTimeout(flushTimer);
		flushTimer = null;
		microtaskQueued = false;
		if (!pendingBytes) return;
		const output = pendingBuffer.subarray(0, pendingBytes).slice();
		pendingBuffer = new Uint8Array(packetCap);
		pendingBytes = 0;
		waitRounds = 0;
		flushPromise = 发送原始块(output).finally(() => { flushPromise = null });
		return flushPromise;
	};

	const scheduleFlush = () => {
		if (flushTimer || microtaskQueued) return;
		microtaskQueued = true;
		scheduledGeneration = generation;
		queueMicrotask(() => {
			microtaskQueued = false;
			if (!pendingBytes || flushTimer) return;
			if (packetCap - pendingBytes < tailBytes) {
				flush().catch(() => closeSocketQuietly(webSocket));
				return;
			}
			flushTimer = setTimeout(() => {
				flushTimer = null;
				if (!pendingBytes) return;
				if (packetCap - pendingBytes < tailBytes) {
					flush().catch(() => closeSocketQuietly(webSocket));
					return;
				}
				if (waitRounds < 2 && (generation !== scheduledGeneration || pendingBytes < lowWaterBytes)) {
					waitRounds++;
					scheduledGeneration = generation;
					scheduleFlush();
					return;
				}
				flush().catch(() => closeSocketQuietly(webSocket));
			}, Math.max(下行Grain静默毫秒, 1));
		});
	};

	return {
		async 直接发送(data) {
			let chunk = 数据转Uint8Array(data);
			if (!chunk.byteLength) return;
			chunk = 附加响应头(chunk);
			await 发送原始块(chunk);
		},
		async 发送(data) {
			let chunk = 数据转Uint8Array(data);
			if (!chunk.byteLength) return;
			chunk = 附加响应头(chunk);
			let offset = 0;
			const totalBytes = chunk.byteLength;
			while (offset < totalBytes) {
				if (!pendingBytes && totalBytes - offset >= packetCap) {
					const sendBytes = Math.min(packetCap, totalBytes - offset);
					const view = offset || sendBytes !== totalBytes ? chunk.subarray(offset, offset + sendBytes) : chunk;
					await 发送原始块(view);
					offset += sendBytes;
					continue;
				}
				const copyBytes = Math.min(packetCap - pendingBytes, totalBytes - offset);
				pendingBuffer.set(chunk.subarray(offset, offset + copyBytes), pendingBytes);
				pendingBytes += copyBytes;
				offset += copyBytes;
				generation++;
				if (pendingBytes === packetCap || packetCap - pendingBytes < tailBytes) await flush();
				else scheduleFlush();
			}
		},
		flush
	};
}

export async function connectStreams(remoteSocket, webSocket, headerData, retryFunc) {
	let header = headerData, hasData = false, reader, useBYOB = false;
	const BYOB单次读取上限 = 64 * 1024;
	const 下行发送器 = 创建下行Grain发送器(webSocket, header);
	header = null;

	try { reader = remoteSocket.readable.getReader({ mode: 'byob' }); useBYOB = true }
	catch (e) { reader = remoteSocket.readable.getReader() }

	try {
		if (!useBYOB) {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (!value || value.byteLength === 0) continue;
				hasData = true;
				await 下行发送器.发送(value);
			}
		} else {
			let readBuffer = new ArrayBuffer(BYOB单次读取上限);
			while (true) {
				const { done, value } = await reader.read(new Uint8Array(readBuffer, 0, BYOB单次读取上限));
				if (done) break;
				if (!value || value.byteLength === 0) continue;
				hasData = true;
				if (value.byteLength >= 下行Grain包字节) {
					await 下行发送器.flush();
					await 下行发送器.直接发送(value);
					readBuffer = new ArrayBuffer(BYOB单次读取上限);
				} else {
					await 下行发送器.发送(value);
					readBuffer = value.buffer.byteLength >= BYOB单次读取上限 ? value.buffer : new ArrayBuffer(BYOB单次读取上限);
				}
			}
		}
		await 下行发送器.flush();
	} catch (err) { closeSocketQuietly(webSocket) }
	finally { try { reader.cancel() } catch (e) { } try { reader.releaseLock() } catch (e) { } }
	if (!hasData && retryFunc) await retryFunc();
}

export function isSpeedTestSite(hostname) {
	const speedTestDomains = [atob('c3BlZWQuY2xvdWRmbGFyZS5jb20=')];
	if (speedTestDomains.includes(hostname)) {
		return true;
	}

	for (const domain of speedTestDomains) {
		if (hostname.endsWith('.' + domain) || hostname === domain) {
			return true;
		}
	}
	return false;
}
