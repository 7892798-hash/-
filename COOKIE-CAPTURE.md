# 微软积分 Cookie 自动获取模块

配套文件：`rewards-cookie-capture.module.yaml` 和新版 `micsoft.js`。模块使用同一个 JS 文件的 request 入口；原来的小组件、定时任务也必须使用新版文件。整个操作在自己的 iPhone 上完成。

## 远程订阅（推荐）

模块订阅：https://raw.githubusercontent.com/7892798-hash/-/main/rewards-cookie-capture.module.yaml

积分脚本：https://raw.githubusercontent.com/7892798-hash/-/main/micsoft.js

在模块列表添加远程订阅；已有小组件和定时任务改用上述脚本 URL 并更新缓存。然后统一下面说明中的 ACCOUNT_ID，完成证书配置。已用远程订阅时无需再添加本地模块。

## 1. 本地安装方式

1. Egern → 工具 → 脚本，更新本地 `micsoft.js` 为本包版本。确认 `ms-rewards-widget`、`ms-rewards-worker` 均引用这个本地文件。
2. 将 `rewards-cookie-capture.module.yaml` 保存到 Egern 可读取的本地文件位置，在当前配置的模块列表添加这个本地模块。Egern 支持本地模块路径；不同版本文件选择界面可能不同。如果找不到本地模块入口，用下面的“手动配置”。
3. 获取模块、小组件、定时任务的 `ACCOUNT_ID` 必须一致。附带配置均使用 `personal`；未使用附带配置的旧脚本若留空，则实际使用 `default`，请显式统一。
4. 要采用自动获取值，将小组件、定时任务及其所属模块 Env 中的 `REWARDS_COOKIE`、`BING_COOKIE` 留空或删除。**非空手填值优先**，旧手填值不会被自动替换。

模块级 Env 优先于脚本级 Env。账户标识只是本地存储标签，不会自动核验两个网站及 OAuth 是否属于同一微软账户。

## 2. 配置手机证书

若已配置并信任 Egern 自己生成的证书，可复用。否则在 Egern → 工具 → 证书 → 生成新证书 → 安装新证书；按照系统提示安装描述文件，并在 iOS 设置 → 通用 → 关于本机 → 证书信任设置中启用该根证书的完全信任。

保持 Egern 代理运行，让 Safari 请求经过 Egern。模块的 `mitm.hostnames` 只添加 `rewards.bing.com` 和 `www.bing.com`，这两个域名的 HTTPS 内容会由 Egern 解密。保留现有 CA 配置，无需开启全域名解密或全局 HTTP 抓包，也无需将微软登录域名加入解密列表。已有排除规则不能排除这两个域名。

## 3. 登录后打开这两个链接

先在 Safari 打开 [Rewards](https://rewards.bing.com/earn) 并完成登录，确认能看到积分余额；再打开 [Bing](https://www.bing.com/) 确认是同一账户。**随后在 Safari 中分别打开：**

- [获取 Rewards Cookie](https://rewards.bing.com/earn?egern_capture=1)
- [获取 Bing Cookie](https://www.bing.com/?egern_capture=1)

链接可以收藏。以后 Cookie 过期，重新登录后再打开即可。为了兼容浏览器缓存，可在链接后加 `&t=任意新数字` 再访问。

模块只在这些专用链接的 GET 请求发送前读取 Cookie，请求继续正常加载，不替换页面、不额外调用微软接口。通知“已保存到本机”只表示保存完成，**不代表登录有效或积分到账**。随后运行小组件查询，确认余额正确；再启用原定时任务。

Cookie 必须包含非空 `_U`、`MSPAuth` 或 `RPSSecAuth` 中至少一种已识别登录标记。若网页能正常显示账户但仍提示未识别，可能微软更换了 Cookie 名称，可退回原手填方式；无需发送 Cookie 内容给别人。

## 4. 手动配置（无需模块导入入口）

在 Egern 脚本列表新增 **http_request**：

| 字段 | 值 |
|---|---|
| 名称 | `ms-rewards-cookie-capture` |
| 本地脚本 | `micsoft.js`（新版） |
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
- **提示未识别登录 Cookie：**先完成登录再重新打开获取链接。匿名访问不会覆盖原来保存的凭据。
- **已保存，但仍显示“缺少 REWARDS_COOKIE”：**检查三个入口都引用新版 JS、`ACCOUNT_ID` 相同。官方文档没有明确说明跨脚本存储隔离范围；本模块依赖这些入口能访问同一 `ctx.storage`。若当前 Egern 版本隔离了存储，自动读取将无法工作，需退回 Env 手填并反馈 Egern 版本和错误文字。
- **仍提示登录过期：**检查是否还有模块级或脚本级的旧手填 Cookie，然后重新登录并获取。保存成功不检查服务器登录状态。
- **签入/阅读提示缺少授权：**Cookie 模块只处理网页 Cookie，原脚本的 `AUTH_CODE` / `REFRESH_TOKEN` OAuth 授权仍需单独配置。
- **换账户：**同步更换三个入口的 `ACCOUNT_ID` 并重新获取两种 Cookie，另行配置该账户的 OAuth；不要把不同账户混在同一标识下。获取新 Cookie 不清除当天任务记录，避免重复执行未知结果的任务。
- **不再需要获取：**禁用此模块（或手动添加的 request 脚本），已保存 Cookie 仍供原脚本使用；禁用不会删除凭据。模块未提供清除存储界面。若是手动追加的 MITM 域名，可移除仅为本功能添加且其他模块不再使用的条目。

本模块不记录或通知 Cookie 内容，不上传到第三方；原积分脚本使用时仅发往对应微软域名。Egern 自身存储、系统备份和用户另行开启的抓包记录不受脚本控制，含凭据的备份不要分享。

## 验证边界与文档依据

新增测试覆盖：请求透传、捕获后查询、Bing 搜索身份 Cookie、域名与方法限制、匿名/异常输入不覆盖、存储及通知失败、手填优先、账户隔离、旧余额缓存失效及任务记录保留。使用本地模拟 ctx，无真实微软凭据；iPhone 的 MITM 拦截、存储共享与后台调度尚未实机验证。

- [Egern JavaScript API：Request、Headers、Storage、返回值](https://egernapp.com/zh-CN/docs/javascript-api/)
- [Egern 模块格式、本地路径和 Env](https://egernapp.com/zh-CN/docs/configuration/modules/)
- [Egern 脚本配置](https://egernapp.com/zh-CN/docs/configuration/scriptings/)
- [Egern 配置示例：MITM 主机名](https://egernapp.com/docs/configuration/example/)
- [Egern 证书安装入口](https://egernapp.com/zh-CN/docs/example/http-traffic-sniffer/)
