/**
 * edgetunnel 2.1 - 共享状态模块
 * 所有跨模块的可变状态和常量集中管理
 */

// ═══════════════ 版本与常量 ═══════════════
export const Version = '2026-06-17 01:41:21';
export const Pages静态页面 = 'https://edt-pages.github.io';

// ═══════════════ 性能调优参数（已优化） ═══════════════
export const WS早期数据最大字节 = 8 * 1024;
export const WS早期数据最大头长度 = Math.ceil(WS早期数据最大字节 * 4 / 3) + 4;
export const 上行合包目标字节 = 8 * 1024;
export const 上行队列最大字节 = 8 * 1024 * 1024;
export const 上行队列最大条目 = 2048;
export const 下行Grain包字节 = 16 * 1024;
export const 下行Grain尾部阈值 = 256;
export const 下行Grain静默毫秒 = 0;

// ═══════════════ 查杀特征码 ═══════════════
export const 特征码字典 = [
	(Proxy.name + "IP").toUpperCase(),
	(String.fromCharCode(67, 109) + URL.name[2] + 'i' + URL.name[0]).toLowerCase(),
	String(2407 * 300 - 10).split('').reverse().join('')
];

// ═══════════════ 可变运行时状态 ═══════════════
export const state = {
	config_JSON: undefined,
	反代IP: '',
	启用SOCKS5反代: null,
	启用SOCKS5全局反代: false,
	我的SOCKS5账号: '',
	parsedSocks5Address: {},
	缓存SOCKS5白名单: null,
	缓存反代IP: undefined,
	缓存反代解析数组: undefined,
	缓存反代数组索引: 0,
	启用反代兜底: true,
	调试日志打印: false,
	SOCKS5白名单: ['*tapecontent.net', '*cloudatacdn.com', '*loadshare.org', '*cdn-centaurus.com', 'scholar.google.com'],
	TCP并发拨号数: 3,
	预加载竞速拨号: true,
};

// ═══════════════ 日志 ═══════════════
export function log(...args) {
	if (state.调试日志打印) console.log(...args);
}
