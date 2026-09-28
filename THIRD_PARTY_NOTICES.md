# 来源说明

Microsoft Rewards 迁移基于 [ScriptCat #5979：微软积分商城签到（积分进度查询优化版）](https://scriptcat.org/zh-CN/script-show-page/5979)，下载版本 v3.6.90，作者 zxwbn01 / zxwbn@foxmail.com。

原文件 SHA-256：`ABE4FCC957700A531BBC8BA593944618A1BFB43270E8E6893F9255DBA8A53A88`。

源文件未声明许可证。保留原作者署名与来源，不以 MIT 或其他许可证重新授权其代码。

迁移改动：用 Egern ctx 替换浏览器 GM API；增加积分小组件；定时任务每轮分批执行并按服务端回执确认；保留 OAuth 续期和四类任务；移除外部群机器人推送及浏览器 Cookie 删除行为。配套获取模块只读取用户主动打开的指定链接请求头，凭据保存在 Egern 本地，不嵌入发布文件。
