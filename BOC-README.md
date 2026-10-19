# 中国银行预选卡号 / 制卡进度 · Loon v1

功能迁移自 [ucuw/rules/boc.user.js](https://raw.githubusercontent.com/ucuw/rules/refs/heads/main/boc.user.js) 1.1.0。读取申请查询结果页面中的 `recordInfo.cardNo` 和 `recordInfo.mkcrdProgreSts`，显示预选卡号、制卡进度并提供复制按钮。

## 安装

需要 **Loon 3.5.1（983）或更新版本**。本次使用 [官方 Script v2 语法](https://nsloon.app/docs/Script/script_v2/) 和 [Response Script API](https://nsloon.app/docs/Script/script_api/)。

1. 将 `BOC-Card-Reader.plugin`、`boc-loon.js` 上传到你原先的 `7892798-hash/-` 仓库 `main` 分支根目录，建议同时上传本说明 `BOC-README.md`。文件已在本地构建；本次没有上传 GitHub。
2. 在 Loon 的插件页面添加以下订阅地址：

   ```text
   https://raw.githubusercontent.com/7892798-hash/-/main/BOC-Card-Reader.plugin
   ```

3. 启用插件与 HTTPS 解密，安装并信任 Loon 证书。插件只添加 `open.boc.cn` 一个解密域名。
4. 用 Safari 打开你原来使用的中行申请查询页面，路径为 `https://open.boc.cn/bankcard/cardReserve/…`。按照官方页面正常完成身份验证，进入申请查询结果页。
5. 读取到结果后，右下角会出现“制卡信息”浮窗。点“复制卡号”即可复制；点 × 收起后，可点“制卡信息”按钮展开。

没有 Cookie、OAuth、ACCOUNT_ID 或定时任务需要配置。安装前已经打开的页面需要重新加载；仅在单页应用内切换路由，不一定会重新下载 HTML，因此建议关闭旧标签页后重新打开查询链接。

如果要上传到本次脚本来源的 `ucuw/rules` 仓库，先把插件中的脚本地址改为 `https://raw.githubusercontent.com/ucuw/rules/main/boc-loon.js`，说明页地址同步修改，然后上传文件并使用该仓库的 `.plugin` 原始链接。原始 `boc.user.js` 是浏览器脚本，不能代替 `boc-loon.js`。

## 工作方式

原脚本需要访问网页 DOM 和 Vue 实例，Loon 脚本环境没有这些对象。因此本插件在指定页面的 HTML 响应中加入一段自包含的浏览器脚本，再在页面内读取原有数据。无需额外安装 Safari 用户脚本扩展，也不会为查询新建后台请求。

- 每秒检查可见页面中的结果数据；页面隐藏时暂停，回到页面后继续。
- 浮窗支持系统浅色/深色外观、安全区和窄屏；复制权限不可用时弹出手动复制框。
- 页面离开结果状态后清除浮窗中的旧信息；不修改 Vue 数据、申请状态或查询结果。
- 不保存登录凭据，不发送卡号到通知、外部服务或日志，不将卡号持久化。
- 如果 HTML 有 CSP，响应脚本只为内置读取脚本及其样式增加对应的 SHA-256 授权；保留页面其他限制，不整体移除 CSP。若页面本来允许内联执行，不额外添加会影响原有脚本的哈希。

状态映射与原脚本一致：00 待制卡；01 制卡中；02/05/07 流程异常；03 制卡完毕、已寄出到网点；04 待领卡；06 已领卡。其他状态按未知状态显示，不推测进度。只有状态没有卡号时仍显示进度，并禁用复制按钮。

## 没出现浮窗时

先确认已进入 **申请查询结果页**，而不是登录、验证码或填表页。然后检查 Loon 是否已下载 `boc-loon.js`、插件及 HTTPS 解密是否生效，并重新加载完整页面。如果有其他插件匹配同一 HTML 响应，Loon 只执行第一条命中的 Response Script，需调整冲突插件顺序。

如果网站已经不再提供 `.progress-result-wrap` 对应的 Vue `recordInfo`，本插件也无法凭空获得隐藏字段。当前行为沿用原脚本的数据来源，不猜测银行接口。若仍无结果，可提供不含卡号、身份证号、手机号或 Cookie 的错误文字及页面路径来定位。

## 来源与验证

下载日期：2026-10-19。原脚本 SHA-256：`14256AFEE7F93F37DAA740BA758839540DCD14AA33261ACEFCB3F2D0324DA608`，保存在项目 `research/boc/boc-1.1.0.user.js`。原脚本头未标明许可证；本迁移保留来源，不额外标注为 MIT。

构建命令：`node tools/build-boc-loon.mjs`。本地行为测试：`node --test tests/boc-loon.test.mjs`。浏览器验证：`node tools/verify-boc-browser.mjs`。

本地测试使用合成数据。当前环境未能取得中行公开入口 HTML，未访问真实账户；因此真实页面结构、Loon iPhone 解密/注入及复制交互仍需实机验证。
