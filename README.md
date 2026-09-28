# Microsoft Rewards · Egern

积分查询小组件、四类定时任务，以及配套 Cookie 获取模块。`micsoft.js` 保留原仓库脚本地址，现已增加 request 获取入口。

## 远程地址

- [Cookie 获取模块订阅](https://raw.githubusercontent.com/7892798-hash/-/main/rewards-cookie-capture.module.yaml)
- [积分脚本](https://raw.githubusercontent.com/7892798-hash/-/main/micsoft.js)
- [查询与定时任务配置片段](https://raw.githubusercontent.com/7892798-hash/-/main/rewards-config-snippet.yaml)（需合并，不要替换整个代理配置）

在 Egern 当前配置的模块列表添加上述模块订阅。已有积分小组件和定时任务，将脚本 URL 设置为上述积分脚本地址并更新缓存；本模块只新增 Cookie 获取入口，不重复注册你的定时任务。

获取模块、小组件、定时任务的 `ACCOUNT_ID` 统一为 `personal`（或统一使用自己的标识），`REWARDS_COOKIE` / `BING_COOKIE` Env 留空才能读取自动获取值。签入、阅读另需原有 OAuth 授权。

首次使用需安装并信任 Egern 证书，模块仅为 `rewards.bing.com` 与 `www.bing.com` 添加 MITM 主机名。保持 Egern 运行，在 Safari 登录同一微软账户，确认网页显示账户信息后再打开：

- [获取 Rewards Cookie](https://rewards.bing.com/earn?egern_capture=1)
- [获取 Bing Cookie](https://www.bing.com/?egern_capture=1)

保存通知仅表示凭据写入本地，随后运行小组件核对余额。普通浏览不保存 Cookie；请求继续正常加载。Cookie 不写入仓库、不出现在脚本日志或通知中，仅保存在手机 Egern，并由积分脚本发往对应微软域名。

## 使用说明

- [Cookie 模块安装与排查](COOKIE-CAPTURE.md)
- [积分小组件与定时任务配置](REWARDS.md)
- [来源说明](THIRD_PARTY_NOTICES.md)

本地模拟验证：38 项测试通过，其中 8 项为 Cookie 获取和模块路由新增覆盖。尚未实测 iPhone 的 HTTPS 拦截、跨脚本存储共享、后台调度及实际到账。官方未明确保证跨脚本 storage 共享；若已保存仍提示缺少 Cookie，先检查版本与 ACCOUNT_ID，必要时退回 Env 手填。

原脚本来源为 [ScriptCat #5979](https://scriptcat.org/zh-CN/script-show-page/5979)，作者 zxwbn01 / zxwbn@foxmail.com，迁移基于 v3.6.90。源文件未声明许可证，本仓库保留署名，不将迁移代码重新标为 MIT。
