/**
 * edgetunnel 2.1 - 工具函数模块
 * 编码、传输配置、路径生成等通用工具
 */

/**
 * 带秘钥的 Base64 编码 (XOR + Base64)
 */
export function base64SecretEncode(plaintext, secret) {
	const encoder = new TextEncoder();
	const data = encoder.encode(plaintext);
	const key = encoder.encode(secret);
	const mixed = new Uint8Array(data.length);
	for (let i = 0; i < data.length; i++) {
		mixed[i] = data[i] ^ key[i % key.length];
	}
	let binary = '';
	for (let i = 0; i < mixed.length; i++) {
		binary += String.fromCharCode(mixed[i]);
	}
	return btoa(binary);
}

/**
 * 带秘钥的 Base64 解码
 */
export function base64SecretDecode(encoded, secret) {
	const binary = atob(encoded);
	const mixed = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		mixed[i] = binary.charCodeAt(i);
	}
	const encoder = new TextEncoder();
	const key = encoder.encode(secret);
	const data = new Uint8Array(mixed.length);
	for (let i = 0; i < mixed.length; i++) {
		data[i] = mixed[i] ^ key[i % key.length];
	}
	const decoder = new TextDecoder();
	return decoder.decode(data);
}

/**
 * 获取传输协议配置
 */
export function 获取传输协议配置(配置 = {}) {
	const 是gRPC = 配置.传输协议 === 'grpc';
	return {
		type: 是gRPC ? (配置.gRPC模式 === 'multi' ? 'grpc&mode=multi' : 'grpc&mode=gun') : (配置.传输协议 === 'xhttp' ? 'xhttp&mode=stream-one' : 'ws'),
		路径字段名: 是gRPC ? 'serviceName' : 'path',
		域名字段名: 是gRPC ? 'authority' : 'host'
	};
}

/**
 * 获取传输路径参数值
 */
export function 获取传输路径参数值(配置 = {}, 节点路径 = '/', 作为优选订阅生成器 = false, 随机路径Fn) {
	const 路径值 = 作为优选订阅生成器 ? '/' : (配置.随机路径 && 随机路径Fn ? 随机路径Fn(节点路径) : 节点路径);
	if (配置.传输协议 !== 'grpc') return 路径值;
	return 路径值.split('?')[0] || '/';
}

/**
 * 随机路径生成（从200+常见目录名随机组合）
 */
export function 随机路径(完整节点路径 = "/") {
	const 常用路径目录 = ["about", "account", "acg", "act", "activity", "ad", "ads", "ajax", "album", "albums", "anime", "api", "app", "apps", "archive", "archives", "article", "articles", "ask", "auth", "avatar", "bbs", "bd", "blog", "blogs", "book", "books", "bt", "buy", "cart", "category", "categories", "cb", "channel", "channels", "chat", "china", "city", "class", "classify", "clip", "clips", "club", "cn", "code", "collect", "collection", "comic", "comics", "community", "company", "config", "contact", "content", "course", "courses", "cp", "data", "detail", "details", "dh", "directory", "discount", "discuss", "dl", "dload", "doc", "docs", "document", "documents", "doujin", "download", "downloads", "drama", "edu", "en", "ep", "episode", "episodes", "event", "events", "f", "faq", "favorite", "favourites", "favs", "feedback", "file", "files", "film", "films", "forum", "forums", "friend", "friends", "game", "games", "gif", "go", "group", "groups", "help", "home", "hot", "htm", "html", "image", "images", "img", "index", "info", "intro", "item", "items", "ja", "jp", "jump", "knowledge", "lang", "lesson", "lessons", "lib", "library", "link", "links", "list", "live", "lives", "m", "mag", "magnet", "mall", "manhua", "map", "member", "members", "menu", "messages", "mobile", "movie", "movies", "music", "my", "new", "news", "note", "novel", "novels", "online", "order", "out", "outbound", "p", "page", "pages", "pay", "payment", "pdf", "photo", "photos", "pic", "pics", "picture", "pictures", "play", "player", "playlist", "post", "posts", "product", "products", "program", "programs", "project", "qa", "question", "rank", "ranking", "read", "readme", "redirect", "reg", "register", "res", "resource", "retrieve", "sale", "search", "season", "seasons", "section", "seller", "series", "service", "services", "setting", "settings", "share", "shop", "show", "shows", "site", "soft", "source", "special", "sport", "sports", "static", "status", "store", "stream", "sub", "support", "tag", "tags", "task", "tech", "temp", "test", "text", "theme", "ticket", "time", "tool", "tools", "top", "topic", "topics", "trade", "trial", "tv", "type", "update", "upload", "url", "user", "users", "v", "video", "videos", "view", "vip", "w", "wallpaper", "watch", "web", "wiki", "work", "world", "www", "z", "zone"];
	const 随机数 = Math.floor(Math.random() * 3 + 1);
	const 随机路径Str = 常用路径目录.sort(() => 0.5 - Math.random()).slice(0, 随机数).join('/');
	if (完整节点路径 === "/") return `/${随机路径Str}`;
	else return `/${随机路径Str + 完整节点路径.replace('/?', '?')}`;
}

/**
 * 替换星号为随机字符
 */
export function 替换星号为随机字符(内容) {
	if (typeof 内容 !== 'string' || !内容.includes('*')) return 内容;
	const 字符集 = 'abcdefghijklmnopqrstuvwxyz0123456789';
	return 内容.replace(/\*/g, () => {
		let s = '';
		for (let i = 0; i < Math.floor(Math.random() * 14) + 3; i++) s += 字符集[Math.floor(Math.random() * 字符集.length)];
		return s;
	});
}

/**
 * 整理字符串为数组（逗号/换行分隔）
 */
export async function 整理成数组(内容) {
	var 替换后的内容 = 内容.replace(/[\t"'\r\n]+/g, ',').replace(/,+/g, ',');
	if (替换后的内容.charAt(0) == ',') 替换后的内容 = 替换后的内容.slice(1);
	if (替换后的内容.charAt(替换后的内容.length - 1) == ',') 替换后的内容 = 替换后的内容.slice(0, 替换后的内容.length - 1);
	return 替换后的内容.split(',');
}

/**
 * 判断是否为 IP 地址
 */
export function isIPHostname(hostname) {
	if (!hostname) return false;
	if (hostname.startsWith('[') && hostname.endsWith(']')) return true;
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/**
 * 判断是否为 IPv4
 */
export function isIPv4(str) {
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(str);
}

/**
 * 数据转 Uint8Array
 */
export function 数据转Uint8Array(data) {
	if (data instanceof Uint8Array) return data;
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	if (typeof data === 'string') return new TextEncoder().encode(data);
	return new Uint8Array(data);
}

/**
 * 有效数据长度
 */
export function 有效数据长度(data) {
	if (!data) return 0;
	if (data instanceof Uint8Array || data instanceof ArrayBuffer) return data.byteLength || data.length || 0;
	if (typeof data === 'string') return data.length;
	return 0;
}

/**
 * 安静关闭 socket
 */
export function closeSocketQuietly(socket) {
	try { socket?.close?.() } catch (e) { }
}

/**
 * WebSocket 发送并等待
 */
export async function WebSocket发送并等待(ws, data) {
	return new Promise((resolve, reject) => {
		if (ws.readyState !== WebSocket.OPEN) return reject(new Error('WS not open'));
		ws.send(data);
		resolve();
	});
}

/**
 * 拼接多个字节数据
 */
export function 拼接字节数据(...chunks) {
	const arrays = chunks.map(c => 数据转Uint8Array(c));
	const totalLength = arrays.reduce((sum, a) => sum + a.byteLength, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const arr of arrays) {
		result.set(arr, offset);
		offset += arr.byteLength;
	}
	return result;
}

/**
 * 去除 IPv6 方括号
 */
export function stripIPv6Brackets(hostname) {
	if (hostname && hostname.startsWith('[') && hostname.endsWith(']')) {
		return hostname.slice(1, -1);
	}
	return hostname;
}

/**
 * 创建请求TCP连接器（Cloudflare Workers connect API）
 */
export function 创建请求TCP连接器(request) {
	if (request && typeof request.cf?.connect === 'function') {
		return (options) => request.cf.connect(options);
	}
	return (options) => connect(options);
}
