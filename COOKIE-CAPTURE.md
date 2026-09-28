# 微软积分 Cookie 与授权码获取模块

配套文件：`rewards-cookie-capture.module.yaml` 和新版 `microsoft-rewards.js`。模块使用同一个 JS 文件的 request 入口；原来的小组件、定时任务也必须使用新版文件。整个操作在自己的 iPhone 上完成。

## Auth v1：登录后点通知复制 AUTH_CODE

你需要的是登录后的回跳链接中的 `code`，不是授权入口中的 `client_id`、`redirect_uri`、`response_type` 或 `scope`。

1. 将本包 `micsoft.js` 和 `rewards-cookie-capture.module.yaml` 上传覆盖 GitHub 同名文件。在 Egern 更新原模块订阅和远程 JS 缓存，不要重复添加模块。
2. 确认模块已启用、Egern 代理运行、证书已信任。本版新增 `login.live.com` 到 MITM 主机列表，该主机 HTTPS 会由本机 Egern 解密；脚本仅匹配下面链接对应的授权回跳，不读取登录表单。
3. 用 Safari 打开[配套微软授权链接](https://login.live.com/oauth20_authorize.srf?client_id=0000000040170455&redirect_uri=https%3A%2F%2Flogin.live.com%2Foauth20_desktop.srf&response_type=code&scope=service%3A%3Aprod.rewardsplatform.microsoft.com%3A%3AMBI_SSL&state=egern_rewards_auth_v1)，登录与 Rewards Cookie 相同的账户。务必使用本链接；旧链接没有捕获标记，不触发通知。
4. 回跳后收到 `Microsoft Rewards · Auth v1`，点按通知复制，再到 `ms-rewards-worker` 自己的 Env → `AUTH_CODE` 粘贴。首次授权时 `REFRESH_TOKEN` 留空，保存并在 3 分钟内手动运行 worker。
5. 如果是在替换旧授权，清空 Env 的旧 `REFRESH_TOKEN`，并把 `AUTH_REVISION` 加一；例如 `1` 改为 `2`。确认兑换成功后可以清空 AUTH_CODE，保留 AUTH_REVISION，后续 worker 使用自己存储的刷新令牌。

捕获脚本不主动请求 token、不保存授权码、不改动任务记录；通知正文也不展示授权码，仅复制动作携带完整值。无需捕获入口与 worker 共享存储。登录取消、回跳缺少 code、重复 code 或格式异常时不会提供复制动作。此标记只是限定捕获范围，不用于自动登录或 CSRF 验证。

若无通知，检查是否使用本节带 `state=egern_rewards_auth_v1` 的链接、模块是否出现 `ms-rewards-auth-capture` 规则及 `login.live.com` 解密主机。若地址栏已经出现 code，可直接把完整回跳链接填入 worker；不要发到聊天里。脚本不能代替本人登录。授权捕获不解决网页活动 HTTP 404 或搜索额度未知的问题。

手动配置时新增 `http_request`，名称 `ms-rewards-auth-capture`，引用同一新版 JS，超时 5 秒、不需要请求体；匹配表达式：

```text
^https://login\.live\.com/oauth20_desktop\.srf\?(?:[^&#]*&)*state=egern_rewards_auth_v1(?:&[^#]*)?$
```

获取完成后可以禁用该捕获规则；若其他功能不需要 login.live.com 解密，也可移除仅为本功能添加的该主机。不要更换现有证书。手机原生捕获与通知复制仍待实测。

## v3：点按通知复制到 Env

捕获成功后，通知标题为 `Microsoft Rewards · Cookie v3`，正文会注明 `REWARDS_COOKIE` 或 `BING_COOKIE`。点按该条通知，由 Egern 将完整 Cookie 值复制到剪贴板，再到对应脚本的 Env 同名字段粘贴。复制内容只有值，不含 `Cookie:` 前缀。

- Rewards 通知复制的值：填入小组件和定时任务的 `REWARDS_COOKIE`。
- Bing 通知复制的值：填入定时任务的 `BING_COOKIE`。

先复制并粘贴 Rewards，再处理 Bing，避免剪贴板被后一次复制覆盖。手填值优先于保存值；若有模块级同名 Env，它优先于脚本级，需要同步更新。即使本地存储保存失败，有效捕获仍会给出复制动作；缺少或格式异常的 Cookie 不提供复制动作。点按复制后运行小组件验证登录状态。

此路径无需跨脚本共享 Cookie 存储。正文不展开长 Cookie，完整值由通知的 clipboard 动作携带。原生通知动作尚待 iPhone 实测；若没有看到 v3 标题，先更新 JS 并刷新 Egern 的脚本缓存。

## 1. 更新脚本和添加模块

1. Egern → 工具 → 脚本，更新本地 `microsoft-rewards.js` 为本包版本。确认 `ms-rewards-widget`、`ms-rewards-worker` 均引用这个本地文件。
2. 将 `rewards-cookie-capture.module.yaml` 保存到 Egern 可读取的本地文件位置，在当前配置的模块列表添加这个本地模块。Egern 支持本地模块路径；不同版本文件选择界面可能不同。如果找不到本地模块入口，用下面的“手动配置”。
3. 获取模块、小组件、定时任务的 `ACCOUNT_ID` 必须一致。附带配置均使用 `personal`；未使用附带配置的旧脚本若留空，则实际使用 `default`，请显式统一。
4. 要采用自动获取值，将小组件、定时任务及其所属模块 Env 中的 `REWARDS_COOKIE`、`BING_COOKIE` 留空或删除。**非空手填值优先**，旧手填值不会被自动替换。

模块级 Env 优先于脚本级 Env。账户标识只是本地存储标签，不会自动核验两个网站及 OAuth 是否属于同一微软账户。

## 2. 配置手机证书

若已配置并信任 Egern 自己生成的证书，可复用。否则在 Egern → 工具 → 证书 → 生成新证书 → 安装新证书；按照系统提示安装描述文件，并在 iOS 设置 → 通用 → 关于本机 → 证书信任设置中启用该根证书的完全信任。

保持 Egern 代理运行，让 Safari 请求经过 Egern。Cookie 功能使用 `rewards.bing.com` 和 `www.bing.com`，本版授权码捕获另使用 `login.live.com`，这些域名的 HTTPS 内容会由本机 Egern 解密。保留现有 CA 配置，无需开启全域名解密或全局 HTTP 抓包。已有排除规则不能排除需要捕获的域名。

## 3. 登录后打开这两个链接

先在 Safari 打开 [Rewards](https://rewards.bing.com/earn) 并完成登录，确认能看到积分余额；再打开 [Bing](https://www.bing.com/) 确认是同一账户。**随后在 Safari 中分别打开：**

- [获取 Rewards Cookie](https://rewards.bing.com/earn?egern_capture=1)
- [获取 Bing Cookie](https://www.bing.com/?egern_capture=1)

链接可以收藏。以后 Cookie 过期，重新登录后再打开即可。为了兼容浏览器缓存，可在链接后加 `&t=任意新数字` 再访问。

模块只在这些专用链接的 GET 请求发送前读取 Cookie，请求继续正常加载，不替换页面、不额外调用微软接口。通知“本地已保存”只表示保存完成，**不代表登录有效或积分到账**。随后运行小组件查询，确认余额正确；再启用原定时任务。

v3 不再假设登录 Cookie 的名称，只检查请求头格式，并兼容分段 Cookie 请求头。通知标题包含 Cookie v3；保存后由积分查询判断是否有效。格式正确的匿名 Cookie 也可能被保存并覆盖该域名旧值，因此请在确认已登录的同一 Safari 标签页打开获取链接；不要把保存成功当作登录成功。

## 4. 手动配置（无需模块导入入口）

在 Egern 脚本列表新增 **http_request**：

| 字段 | 值 |
|---|---|
| 名称 | `ms-rewards-cookie-capture` |
| 本地脚本 | `microsoft-rewards.js`（新版） |
| 超时 | `5` 秒 |
| 请求体 | 不需要 |
| Env | `ACCOUNT_ID=personal`，与原脚本一致 |

匹配表达式粘贴：

```text
^https://(?:rewards\.bing\.com/(?:earn)?|www\.bing\.com/)\?egern_capture=1(?:&[^#]*)?$
```

在当前配置的 MITM 主机名列表中追加 `rewards.bing.com`、`www.bing.com`，不要覆盖已有主机名或证书。模块导入与手动配置二选一，避免重复注册。

## 5. 常见情况

- **没有通知：**允许 Egern 通知；检查请求是否经过 Egern、证书信任、模块是否启用、JS 本地文件路径以及匹配表达式。可更换上述 `t` 参数重新访问。不要为排查把登录域名扩大到通配符。
- **仍提示“未识别到有效格式的登录 Cookie”：**这是旧版提示，更新仓库 JS 后还需刷新 Egern 的脚本缓存。新版通知标题含 Cookie v3。空请求头会提示“本次请求未携带 Cookie”；格式不合法或超过 32 KB 会单独提示，均保留原凭据。
- **已保存，但仍显示“缺少 REWARDS_COOKIE”：**检查三个入口都引用新版 JS、`ACCOUNT_ID` 相同。官方文档没有明确说明跨脚本存储隔离范围；本模块依赖这些入口能访问同一 `ctx.storage`。若当前 Egern 版本隔离了存储，自动读取将无法工作，需退回 Env 手填并反馈 Egern 版本和错误文字。
- **仍提示登录过期：**检查是否还有模块级或脚本级的旧手填 Cookie，然后重新登录并获取。保存成功不检查服务器登录状态。
- **签入/阅读提示缺少授权：**使用本文 Auth v1 配套授权链接，点通知复制到 worker 的 AUTH_CODE；Cookie 不能代替 OAuth 授权。
- **换账户：**同步更换三个入口的 `ACCOUNT_ID` 并重新获取两种 Cookie，另行配置该账户的 OAuth；不要把不同账户混在同一标识下。获取新 Cookie 不清除当天任务记录，避免重复执行未知结果的任务。
- **不再需要获取：**禁用此模块（或手动添加的 request 脚本），已保存 Cookie 仍供原脚本使用；禁用不会删除凭据。模块未提供清除存储界面。若是手动追加的 MITM 域名，可移除仅为本功能添加且其他模块不再使用的条目。

通知正文和脚本日志不展示 Cookie 内容；按用户要求，完整值包含在本机通知的复制动作中，点按后进入剪贴板，不上传到第三方；原积分脚本使用时仅发往对应微软域名。Egern 自身存储、系统备份和用户另行开启的抓包记录不受脚本控制，含凭据的备份不要分享。

## 验证边界与文档依据

新增测试覆盖：请求透传、捕获后查询、Bing 搜索身份 Cookie、域名与方法限制、缺失/异常输入不覆盖、未知 Cookie 名称、分段请求头、匿名凭据需服务端验证、存储及通知失败、手填优先、账户隔离、旧余额缓存失效及任务记录保留。使用本地模拟 ctx，无真实微软凭据；iPhone 的 MITM 拦截、存储共享与后台调度尚未实机验证。

- [Egern JavaScript API：Request、Headers、Storage、返回值](https://egernapp.com/zh-CN/docs/javascript-api/)
- [Egern 模块格式、本地路径和 Env](https://egernapp.com/zh-CN/docs/configuration/modules/)
- [Egern 脚本配置](https://egernapp.com/zh-CN/docs/configuration/scriptings/)
- [Egern 配置示例：MITM 主机名](https://egernapp.com/docs/configuration/example/)
- [Egern 证书安装入口](https://egernapp.com/zh-CN/docs/example/http-traffic-sniffer/)
