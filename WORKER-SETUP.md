# 启用积分定时任务

查询小组件是 generic；Cookie 获取模块是 http_request。两者都不会执行签入、阅读、活动或搜索，执行入口必须是 schedule。

在 Egern 脚本列表新增以下脚本（若已存在同名 worker，编辑原条目，避免重复）：

| 项目 | 填写内容 |
|---|---|
| 名称 | `ms-rewards-worker` |
| 类型 | `schedule` |
| 脚本 URL | `https://raw.githubusercontent.com/7892798-hash/-/main/micsoft.js` |
| Cron | `*/20 * * * *` |
| 超时 | `180` 秒 |
| 启用 | 开启；配置中的 `disabled` 应为 `false` |

在这个 **worker 自己的 Env** 配置：

| Key | Value |
|---|---|
| `ACCOUNT_ID` | 与小组件一致，如 `personal` |
| `REWARDS_COOKIE` | Rewards 获取通知复制的完整值 |
| `BING_COOKIE` | Bing 获取通知复制的完整值 |
| `AUTH_CODE` | 配套 Auth v1 通知复制的 code，或原脚本授权流程的完整回跳链接；或者使用下一项 |
| `REFRESH_TOKEN` | 原脚本已有的刷新令牌；与 AUTH_CODE 二选一，不能用抓包的 Bearer 访问令牌代替 |
| `NOTIFY` | 建议先填 `true`，本机通知会报告错误与各类任务结果 |

签入、阅读需要 OAuth 授权；只有 Cookie 尚不能执行这两类任务。先验证网页活动/搜索时，可暂设 `TASK_SIGN=false`、`TASK_READ=false`；授权后再改回 `true`。其他任务开关 `TASK_PROMOS`、`TASK_SEARCH` 默认 true。

原脚本获取授权的入口和重授权步骤见 [积分安装说明](README.md)（仓库版见 REWARDS.md）。凭据填在手机 Env，不要写进 GitHub 文件。

手机自动捕获授权码的步骤见 [Cookie 与授权码获取说明](COOKIE-CAPTURE.md) 的 Auth v1 部分。必须更新 JS 和模块、使用带专用 state 标记的授权链接；复制到本 worker 的 AUTH_CODE 后在 3 分钟内运行。

保存后在 schedule 条目手动运行一轮，查看 Egern 本机结果通知；每轮每类最多处理一次，之后按 20 分钟计划继续，不会立即刷完所有任务。iOS 后台执行时机仍由 Egern 和系统运行条件决定。

“无运行记录”表示小组件当前存储中没有该任务记录。worker 成功运行后仍无记录，可能是两个入口的存储未共享；以 worker 的本机通知和服务端进度为准。只刷新小组件不会触发任务。

默认地区锁会在非 CN 或无法确认地区时停止执行。Worker v5 支持 www.bing.com 与 cn.bing.com 之间同路径的 HTTPS GET 地区跳转，以及同站 GET 跳转，最多跟随 3 次。后续 Bing 请求使用本轮确认的站点；提交请求发生跳转时不会自动重发。

旧版把所有 HTTP 3xx 都提示为“登录跳转：请更新 Cookie 后重试”，这不足以证明 Cookie 失效。v5 的错误会列出请求接口、HTTP 状态和目标主机；真实登录/验证跳转会注明对应 REWARDS_COOKIE、BING_COOKIE 或 OAuth 授权。HTTP 403 也可能是网络或网页验证要求，不能仅据此认定 Cookie 过期。

更新时将新版 micsoft.js 上传覆盖 GitHub 同名文件，再在 Egern 更新远程脚本缓存，手动运行原有 worker 一轮。通知标题含 Worker v5 才表示加载了新版；模块订阅地址与现有 Env 无需更换。若仍失败，提供新版完整错误文字即可，不要发送 Cookie 或 Token。此修复经过模拟测试，仍需手机验证。

手机额度为“额度未知”时，不会强行提交手机搜索。脚本会优先使用网页完整额度；缺失时采用 dashboard API 的完整额度，真实的 `0 / 0` 保留为零。

Worker v7 在已有 App 查询中记录通用搜索进度，网页缺少手机额度时可显示“App 搜索（上次记录）”，这不是新增的独立手机额度。活动 404 的当前 action 取值、重试限制与更新步骤见积分安装说明的第 6 节；不能把阅读进度当作搜索额度。v7 通知标题含 Worker v7。

最新 Worker v8 已从用户 Edge 的真实成功请求更新 reportActivity 标识和路由头，见积分安装说明第 7 节。更新 micsoft.js 后，如果 Env 中存在旧 EARN_ACTION_ID，请删除或改成 `707e6eb15bdfdd5fba193f0a77e934f7018faf87ce`，否则 Env 会继续覆盖新版默认值。保留现有 OAuth、Cookie 和 ACCOUNT_ID。
