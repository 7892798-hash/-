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
| `AUTH_CODE` | 原脚本授权流程得到的 code 或完整回跳链接；或者使用下一项 |
| `REFRESH_TOKEN` | 原脚本已有的刷新令牌；与 AUTH_CODE 二选一，不能用抓包的 Bearer 访问令牌代替 |
| `NOTIFY` | 建议先填 `true`，本机通知会报告错误与各类任务结果 |

签入、阅读需要 OAuth 授权；只有 Cookie 尚不能执行这两类任务。先验证网页活动/搜索时，可暂设 `TASK_SIGN=false`、`TASK_READ=false`；授权后再改回 `true`。其他任务开关 `TASK_PROMOS`、`TASK_SEARCH` 默认 true。

原脚本获取授权的入口和重授权步骤见 [积分安装说明](REWARDS.md)（仓库版见 REWARDS.md）。凭据填在手机 Env，不要写进 GitHub 文件。

保存后在 schedule 条目手动运行一轮，查看 Egern 本机结果通知；每轮每类最多处理一次，之后按 20 分钟计划继续，不会立即刷完所有任务。iOS 后台执行时机仍由 Egern 和系统运行条件决定。

“无运行记录”表示小组件当前存储中没有该任务记录。worker 成功运行后仍无记录，可能是两个入口的存储未共享；以 worker 的本机通知和服务端进度为准。只刷新小组件不会触发任务。

默认地区锁会在非 CN 或无法确认地区时停止执行。出现“登录跳转”时也不会继续；需要依据实际错误排查，不能把没有执行记录等同于任务已完成。

手机额度为“额度未知”时，不会强行提交手机搜索。脚本会优先使用网页完整额度；缺失时采用 dashboard API 的完整额度，真实的 `0 / 0` 保留为零。
