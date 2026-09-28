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

v3 捕获通知可直接点按，复制完整 Cookie，再粘贴到 Env：Rewards 值填写小组件和定时任务的 `REWARDS_COOKIE`，Bing 值填写定时任务的 `BING_COOKIE`。即使本地保存失败，也能通过复制动作手动填写。保存或复制成功不代表登录有效，随后运行小组件核对余额。

普通浏览不保存 Cookie；请求继续正常加载。Cookie 不写入仓库或脚本日志，通知正文不展开凭据，完整值由通知的剪贴板动作携带，点按后复制；原积分请求只发往对应微软域名。

## 使用说明

- [Cookie 模块安装与排查](COOKIE-CAPTURE.md)
- [积分小组件与定时任务配置](REWARDS.md)
- [来源说明](THIRD_PARTY_NOTICES.md)

Cookie v3 保留格式校验和分段 Cookie 支持，新增点按通知复制。更新后通知标题包含 `Cookie v3`，若仍显示旧提示请刷新 Egern 的脚本缓存。

本地模拟验证：46 项测试通过，其中 16 项覆盖 Cookie 获取、复制、Env 手填与模块路由。通知点按复制的原生行为仍待 iPhone 实测；后台调度及实际到账尚未实测。截图中的缺少凭据提示尚不足以确认跨脚本存储隔离的具体原因，手动复制填入 Env 的路径不依赖该共享行为。

原脚本来源为 [ScriptCat #5979](https://scriptcat.org/zh-CN/script-show-page/5979)，作者 zxwbn01 / zxwbn@foxmail.com，迁移基于 v3.6.90。源文件未声明许可证，本仓库保留署名，不将迁移代码重新标为 MIT。
