# Microsoft Rewards · Loon v1

从当前 Egern v11 迁移，保留签到、阅读、活动、搜索及每日完成后停止联网；没有小组件，也没有 12:00 / 18:00 的小组件刷新任务。原 Egern 文件继续保留。

使用新版 Script 语法，需要 **Loon 3.5.1 (983) 或更新版本**。按官方 [Script](https://nsloon.app/docs/Script/script_v2/)、[Rewrite](https://nsloon.app/docs/Rewrite/rewrite_v2/) 和 [Plugin](https://nsloon.app/docs/Plugin/) 文档适配；凭据获取使用 Request Script，不需要添加 Rewrite 修改网页内容。

## 上传与订阅

将本目录的下列 **4 个文件**上传到 `7892798-hash/-` 仓库 `main` 分支根目录，保留文件名：

- `Microsoft-Rewards.plugin`
- `ms-rewards-loon-worker.js`
- `ms-rewards-loon-query.js`
- `ms-rewards-loon-capture.js`

建议一并上传本说明 `LOON-README.md`。这是独立 Loon 文件，不用覆盖 Egern 的 `micsoft.js` 或 YAML 模块。

**本包仅在本地生成，尚未由本次迁移上传。** 上述四个文件全部上传后，在 Loon 的插件入口添加：

```text
https://raw.githubusercontent.com/7892798-hash/-/main/Microsoft-Rewards.plugin
```

订阅 `.plugin` 即可，其中会引用三份 JS。上传至其他仓库或目录时，先同步修改插件中全部脚本地址及说明页地址，再上传。后续升级需更新远程插件和脚本缓存；不能只更新插件而继续用旧 JS 缓存。

## 首次配置

1. 在插件参数中保持 `ACCOUNT_ID=personal`。它只是本地账户分组名，不用到微软网站获取。
2. `自动任务` 默认关闭，先填写凭据。Egern 与 Loon 不共享本地存储，需要在 Loon 捕获一次或手动填入仍有效的 Cookie。
3. 获取凭据时保持 `凭据捕获` 开启，并启用 Loon 的 HTTPS 解密、安装并信任其证书；允许通知。插件只添加 Rewards、www.bing.com 和 login.live.com 三个域名。仅手动填凭据时不需要为脚本联网额外开解密。
4. 按下节获取两个 Cookie 和 OAuth 授权。所有凭据仅留在手机参数或 Loon 本地存储，**不要填入待上传的文件**。
5. 临时打开 `任务结果通知`，手动运行通用脚本 **微软积分 · 执行一轮**。再运行 **微软积分 · 查询进度**核对余额与记录。
6. 确认后开启 `自动任务`，按需关闭 `任务结果通知` 和 `凭据捕获`。同一个微软账户迁移到 Loon 后，请停用 Egern 的自动 worker，避免两边重复提交及刷新令牌竞争。

## Cookie 获取

在同一个 Safari 浏览器登录相应账户，然后依次打开：

- [获取 Rewards Cookie](https://rewards.bing.com/earn?loon_capture=1)
- [获取 Bing Cookie](https://www.bing.com/?loon_capture=1)

出现通知表示脚本读到了请求 Cookie；不代表微软已验证该 Cookie。通知会说明是否成功保存。

成功保存后，`REWARDS_COOKIE` / `BING_COOKIE` 参数可以留空，任务会读取对应 ACCOUNT_ID 下的本地值。也可以**点按通知复制**完整 Cookie 后手填。手填值优先，因此旧参数未清空时，重新捕获的新 Cookie 不会覆盖它。

普通主页不带 `loon_capture=1`，不会弹出通知。若没有通知，核对插件/捕获开关、HTTPS 解密及证书信任、三个域名是否生效、通知权限；重新在浏览器打开专用链接，不要只在 Bing App 内打开主页。

## OAuth 授权

签到和阅读需要 OAuth。打开：

[微软 Rewards 授权并捕获 AUTH_CODE](https://login.live.com/oauth20_authorize.srf?client_id=0000000040170455&redirect_uri=https%3A%2F%2Flogin.live.com%2Foauth20_desktop.srf&response_type=code&scope=service%3A%3Aprod.rewardsplatform.microsoft.com%3A%3AMBI_SSL&state=loon_rewards_auth_v1)

完成登录/授权后，点按 Loon 通知复制授权码，填入插件 `AUTH_CODE`，尽快执行一轮。授权码一次性使用，不能照搬已被 Egern 消耗的旧码。成功换取令牌后，脚本本地保存续期令牌，后续自动续期；捕获阶段本身不换取令牌。

已有仍有效的 `REFRESH_TOKEN` 也可以直接填写，与 `AUTH_CODE` 二选一；有效的已存本地令牌优先。重新授权时，清空过期的 `REFRESH_TOKEN`，填新 `AUTH_CODE`，将 `AUTH_REVISION` 从 1 改成 2（以后继续递增），让旧本地令牌失效。

Cookie 中没有 AUTH_CODE 或 REFRESH_TOKEN；不要把遥测 ID、账户标识或普通 Cookie 值填入 OAuth 字段。

## 执行与省电

默认 `CRON=*/20 * * * *`，每 20 分钟执行一轮小批次。阅读、活动、搜索分多轮推进，避免长时间循环。计划时间受 Loon 与 iOS 调度影响，不保证精确到秒。

`POWER_SAVE` 默认开启：**所有启用的任务经服务端确认完成后，当天后续定时触发只检查本地状态，不发网络请求**。次日按 `TIMEZONE` 恢复。错误、未知额度、待确认提交不会被当成完成。定时器仍可能唤醒脚本，不等于取消系统调度或绝对零耗电。

- **执行一轮**：执行启用的任务，也遵守当天完成后的停止标记。
- **查询进度**：随时主动联网查询余额、搜索额度并显示最近任务记录；不提交任务、不交换 OAuth 令牌。记录带时间，不冒充本次任务结果。
- 若确需当天完成后重新核查任务，可临时关闭 `POWER_SAVE` 后执行一轮，再打开；已有任务回执仍保留，不会无条件重放已提交的动作。
- `TASK_SIGN / TASK_READ / TASK_PROMOS / TASK_SEARCH` 分别控制四类任务。关闭某类后，完成判定只看仍启用的任务。
- `LOCK_CN` 默认开启；`COUNTRY=cn`、`TIMEZONE=Asia/Shanghai`、`TIMEZONE_OFFSET=-480` 延续当前中国区设置。`POLICY` 留空沿用 Loon 默认请求策略。

手机额度缺失仍显示“额度未知”，不会拿 App 综合搜索额度冒充独立手机额度。网页活动 Action 可能随部署变化；只有确认 HTTP 404 后才按新的实测 `EARN_ACTION_ID` 更新，不自动猜测或重放不明提交。

## 验证范围与来源

本地模拟 Loon 原生 HTTP、存储、通知与 `$done` 回调，覆盖四类任务、只读查询、凭据捕获、每日停网、跨日恢复、异常与重定向。未使用真实 Cookie 发起测试；尚需 iPhone 上验证插件导入、系统通知复制、后台调度及实际任务结果。没有进行真实耗电测量。

运行源码测试：`node --test tests/loon.test.mjs tests/rewards.test.mjs tests/widgets.test.mjs`。重新构建：`node tools/build-loon.mjs`。生成脚本不依赖外部 npm 库或运行时模块下载。

来源：[ScriptCat #5979 v3.6.90](https://scriptcat.org/zh-CN/script-show-page/5979)，作者 zxwbn01 / zxwbn@foxmail.com；上游未声明许可证，本迁移保留署名，不重新标注 MIT。任务核心从本项目 `rewards/microsoft-rewards.js` 构建提取，Loon 平台适配位于 `loon/runtime.js`，不包含 Egern 小组件实现。
