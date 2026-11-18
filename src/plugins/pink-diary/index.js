// 宿主半边已收编到 dsh-xilian-core（F3.6，2026-11-18）。
// 本插件现在只提供浏览器端面板：client.js 仍然注册 sidebar.panellist + main 两个槽位，
// 数据来自 core 注册的 /xu-diary/*（entries / delete / health，契约未变，页面无需修改）。
// diaryDir 现在由 core 的 runtimeConfig 解析（改配置后点「重载配置」即生效）。

/** Package name doubles as the plugin row name and the client module id. */
export const name = 'xu-pink-diary'

/**
 * 路由由 dsh-xilian-core 提供。这里保留一个空的 apply，让插件仍能正常激活
 * （它的价值全在 client.js 上）。
 */
export function apply() {}
