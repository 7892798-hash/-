# 微软积分：Egern 完整迁移版

**文件：`micsoft.js`。支持 generic 小组件、schedule 定时任务和配套 request Cookie 获取入口。**

想在手机上自动获取 Cookie，请先阅读 [Cookie 自动获取安装说明](COOKIE-CAPTURE.md)，安装配套模块并更新本 JS。使用自动获取时，下面的两项 Cookie Env 可留空；已有非空手填值仍优先。

基于你提供的 [ScriptCat #5979 v3.6.90](https://scriptcat.org/zh-CN/script-show-page/5979) 迁移。保留签入、阅读、活动、电脑/手机搜索四类任务；每轮最多各处理 1 次，结束后再次查询服务端进度。浏览器通知改为可选 Egern 本机通知。

## 1. 先安装查询小组件

Egern → 工具 → 脚本 → 添加 **generic**，名称 `ms-rewards-widget`，文件（可下载为本地，或使用 README 中的远程地址） `micsoft.js`。粘贴脚本全部内容。

在 Env 填入：

| 参数 | 用法 |
|---|---|
| `ACCOUNT_ID` | 自定义账户标识，如 `personal`；不填默认 `default` |
| `REWARDS_COOKIE` | 登录 `https://rewards.bing.com/` 后，发往该域名请求中的完整 Cookie 请求头值 |
| `TIMEZONE` | 默认 `Asia/Shanghai` |

原 PC 浏览器中，按 F12 → Network → 刷新 Rewards → 找到 `/earn` 或 `/api/getuserinfo` 请求 → Request Headers → 复制 Cookie **值**。不要复制 `Cookie:` 前缀，不要复制响应 `Set-Cookie`。把值直接存到手机 Egern Env。Safari 的登录状态不会因为 PC 已登录而自动出现在 Egern。

运行 generic 脚本，确认余额、电脑/手机额度与网页一致。进入分析 → 小组件画廊新增并关联脚本，再添加到 iPhone 主屏幕。小组件刷新**不会触发四类积分任务**。

## 2. 添加定时任务

新增 **schedule** 脚本 `ms-rewards-worker`，选择同一个文件（可下载为本地，或使用 README 中的远程地址） `micsoft.js`，cron 为 `*/20 * * * *`，超时 `180` 秒。配置片段见 `config-snippet.yaml`（打包后叫 `rewards-config-snippet.yaml`），只能合并对应字段，不要替换整个代理配置。

定时脚本 Env：

| 参数 | 默认 / 说明 |
|---|---|
| `ACCOUNT_ID` | 与小组件相同 |
| `REWARDS_COOKIE` | 与查询小组件相同 |
| `BING_COOKIE` | 同一微软账户登录 `https://www.bing.com/` 后，发往 www.bing.com 的完整 Cookie 值；从 Network 复制 |
| `AUTH_CODE` | 原作者授权流程所得的完整回跳链接或 code；首次交换后可以清空 |
| `REFRESH_TOKEN` | 可替代 AUTH_CODE；可用原脚本已有的 `Config.token`，后续轮换令牌保存在 Egern 本地 |
| `AUTH_REVISION` | 默认 `1`；重新授权时递增，用新凭据替换旧的本地 OAuth 状态 |
| `TASK_SIGN` / `TASK_READ` / `TASK_PROMOS` / `TASK_SEARCH` | 默认 `true`，可各自设为 `false` |
| `LOCK_CN` | 默认 `true`，地区非 CN 或无法确认则停止本轮任务 |
| `COUNTRY` | 默认 `cn`；关地区锁时自行填写实际账户地区 |
| `TIMEZONE` | 默认 `Asia/Shanghai`，用于每日状态重置 |
| `TIMEZONE_OFFSET` | 网页活动时区偏移，默认 `-480`（分钟） |
| `POLICY` | 可选，Egern 中已有策略名；所有微软请求使用该策略 |
| `SEARCH_TERMS` | 可选，用 `\|` 分隔自定义搜索词；默认使用本地词表 |
| `NOTIFY` | 默认 `false`，`true` 时通过 Egern 发本机结果通知 |
| `EARN_ACTION_ID` | 新版网页活动的 Next.js action 标识，默认沿用原脚本值 |

授权链接从 [原作者脚本页面](https://scriptcat.org/zh-CN/script-show-page/5979) 的“获取授权码”入口打开，登录同一账户，按作者说明及时复制回跳链接。凭据只填在你自己的设备，无需发到聊天里。

YAML 示例的定时任务初始 `disabled: true`。填好 Env、确认查询正确后在手机启用；在 schedule 的运行入口可手动执行一轮，再检查大尺寸小组件和 Rewards 网页。**手填 Cookie 的方式不需要 MITM；可选自动获取模块需要为两个指定域名配置解密和证书。**

## 3. 执行与数据语义

- 四个类别每轮最多各 1 次，无浏览器常驻循环；搜索间隔由 20 分钟 cron 决定，不再使用原脚本的随机秒级搜索循环。
- 签到仅在响应包含明确的积分回执字段时记为已确认；`0` 分回执也保留，不解释成新增积分。超时或无回执保存“待确认”，当日不盲目重发。
- 阅读只采用服务端返回的进度和上限，已满就停止；不沿用原脚本“已满但本地没记录仍强制阅读”的行为。
- 活动包含旧版 dashboard / ReportActivity 和新版 earn / next-action 两条路径。提交后重新查询，服务端显示完成才标为已确认。
- 搜索按实际剩余额度在电脑/手机之间选择，保留搜索及上报请求。连续 2 轮查询不增长则当日停止。不会把 HTTP 200 自动视为增加 3 分。
- “今日积分”显示来源接口的统计字段，无法取得时显示 `—`，不把不同任务的缓存值相加冒充精确日收入。额度 `0` 与未知值区分。
- 先记录请求状态再提交；本地存储损坏或不可写时不继续执行。租约用于尽量避免重复运行，但 ctx.storage 没有已文档化的原子锁，不保证跨进程严格互斥；避免同时手动运行多个 worker。
- `generic` 与 `schedule` 使用相同账户键。Egern 文档没有明确保证跨脚本存储域的具体实现，这部分需要在手机确认；如果任务详情没有同步，查询余额仍可独立显示。
- 为避免缓存串号，**更换微软账户时更换 ACCOUNT_ID**，并同步更新两种 Cookie 与 OAuth 凭据。不要用更换 ID 反复触发同一天的未知结果任务。
- OAuth 过期后，在 worker 中填入新的 `AUTH_CODE`，清空旧 `REFRESH_TOKEN`，把 `AUTH_REVISION` 从 `1` 改成 `2`（以后继续递增），再运行。成功后可清空 AUTH_CODE，保留 AUTH_REVISION。此操作保留当天的任务回执，不会因为重新授权而自动重复签到。

## 4. 与 PC 脚本不同的部分

保留四类任务的协议逻辑，改写执行与确认机制。没有迁移企业微信、钉钉、飞书、PushMe、Bark 群/外部推送；使用可选本机通知。未删除真实浏览器 Cookie，设备标识只修改当前搜索请求的 Cookie 副本。热词第三方 API 改成本地词表或自定义 `SEARCH_TERMS`。

源脚本的新版活动 action 标识绑定微软网页版本，可能随网页升级失效；可从本人浏览器真实完成该活动的网络请求中读取 `next-action` 请求头并更新 Env。HTML 结构、OAuth 客户端授权、任务接口或账户资格变化也可能导致部分任务不能运行。

## 5. 验证范围

已在 Node.js 模拟 Egern ctx，测试各任务请求、开关、续期、回执、地区锁、凭据跳转保护、存储失败、缓存与零额度等边界。未向真实微软账号发送积分任务请求，未验证 iOS 后台调度、共享存储、实际到账和原生排版。迁移代码可供手机验证，不能将模拟接口通过表述为“已实测全自动到账”。

源文件未声明许可证，迁移保留原作者署名与来源，不重新标为 MIT。
