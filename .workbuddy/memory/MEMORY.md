# MxPage 项目长期记忆

## SaaS 改造第一阶段（2026-07-04 完成）
用户决策：从「不改路由、只加登录和次数扣费」开始；i18n 与支付留第二阶段。

### 选型（用户确认）
- 认证：自建轻量 = bcryptjs 哈希 + jose JWT + httpOnly cookie（未用 Better Auth）
- Key 模式：两者支持——用户在 `/settings/my-keys` 配自有 key 则用之且不扣费；否则用平台 key 扣费
- 额度：注册送 20，每次 AI 调用扣 1，调用失败自动退还

### 数据模型（prisma/schema.prisma，迁移 20260704000001_sa_auth）
- 新增 `User`(email,passwordHash,credits=20,role) / `CreditTransaction`(delta,balanceAfter,reason,projectId,taskType) / `UserProviderConfig`(userId,name,baseUrl,apiKeyEncrypted,isActive)
- `Project` 加 `userId`（可空，onDelete: SetNull 兜底旧数据）
- 自定义迁移器 `scripts/apply-prisma-migrations.cjs`（node:sqlite），手写 migration.sql

### 关键架构
- `middleware.ts`：除 `/login` `/register` `/api/auth/*` 外全拦截；未登录→跳登录页，API→401 JSON
- `lib/auth/`: password.ts(bcrypt) · jwt.ts(jose 签验,Edge 安全) · session.ts(getCurrentUser/requireUser)
- `lib/credits/service.ts`: chargeCredits(事务扣减+记录,不足抛 HttpError 402) / refundCredits
- `lib/credits/guard.ts`: `withCreditGuard`(同步) / `withCreditGuardAsync`(异步任务) 包裹 AI route
  - 用户自有 key → runWithProviderCredentials 注入，不扣费
  - 平台 key → getPlatformActiveCredentials 解密 DB ProviderConfig，扣 1 次，失败退还
- 已接入 10 个 AI route：generate/regenerate/edit/translate-page/analyze/plan-sections/xiaohongshu(generate,plan,edit)/batch-create
- `lib/utils/http-error.ts`: HttpError 类；handleRouteError 已识别它（401/402 等）

### ⚠️ 重要坑（务必记住）
- `provider-service.getProviderAdapter` 的 apiKey 只从 `getRequestProviderCredentials()`(AsyncLocalStorage) 取，**不读 DB apiKeyEncrypted**。所以扣费 guard 必须主动把 DB key 解密后用 runWithProviderCredentials 注入。
- 旧版 `saveProviderConfig` 存 `encryptSecret("")`（key 只留浏览器 localStorage，不进 DB）。SaaS 后已改为存 `encryptSecret(input.apiKey)`，平台 key 才能从 DB 解密。
- `ProviderCredentialFetchBridge` 给所有 /api/ 请求注入 localStorage 旧 key 头；扣费 guard **不再读请求头 key**，避免用户用旧 key 仍被扣费。
- listProjects/createProject 加可选 userId 参数（向后兼容 batch-create 内部调用）；登录用户看 `userId=me OR userId=null`。

### 环境变量（.env，env.ts 已 zod 登记）
AUTH_SECRET / AUTH_COOKIE_NAME=mxpage_session / AUTH_TOKEN_TTL_DAYS=7 / REGISTER_BONUS_CREDITS=20

### 第二阶段（2026-07-04 完成）

#### 权限加固
- `getProjectDetail`/`updateProject` 加 userId 参数；非所有者（且非 null 旧数据）抛 403；`/api/projects/[id]` 全部加 requireUser
- `session.ts` 加 `requireAdmin`；`/api/providers` 的 POST/PATCH 限管理员；GET 限登录用户
- `/api/auth/bootstrap-admin` POST：系统无管理员时第一个登录用户可自举为 admin（一次性）

#### 异步任务失败退费
- `withCreditGuardAsync` 的 handler 签名改为 `(credentials, ctx)`，ctx = { userId, chargedCredits, taskType, projectId }
- `workflow-task-service` 的 `runBatchCreateTask`/`runTranslatePageTask`/`runXiaohongshuGenerateTask` 接 ctx，在 failTask 前调 `refundTaskOnFailure`
- 任务被取消也退费；handler 同步部分失败仍由 guard 退还
- `retryWorkflowTask` 不重复扣费（原任务已扣），ctx=undefined

#### i18n 中英双语（无路由前缀）
- `lib/i18n/`: types.ts(Dictionary 类型) · dictionaries/{zh,en}.ts · store.ts(zustand persist + useTranslation)
- `components/layout/locale-switcher.tsx`: 顶栏语言切换器（中文/English）
- 已接入：AppShell 导航 + UserMenu + AuthForm + my-keys 页 + credits 页
- 类型在 types.ts 定义避免循环引用；zh/en 字典 import type Dictionary

#### Payjs 支付充值
- schema 加 `Order`(outTradeNo unique, payjsOrderId, status, qrcodeUrl, payUrl, paidAt) + `CreditTransaction.orderId`（迁移 20260704000002_payment）
- `lib/payments/payjs.ts`: MD5 签名 + createPayjsNativeOrder + verifyPayjsNotify + createRechargeOrder + handlePayjsNotify（事务+幂等）
- `/api/credits/recharge` POST 下单 · `/api/credits/payjs-notify` POST 回调（放行 middleware）· `/api/credits/orders` GET 列表 · `/api/credits/orders/[id]` GET 查询
- `/settings/credits` 充值页：套餐 + 自定义金额 + 二维码 + 3秒轮询支付状态 + 充值记录表
- env: PAYJS_MCHID / PAYJS_KEY / PAYJS_API_URL / PAYJS_NOTIFY_URL / CREDITS_PER_YUAN=5 / APP_BASE_URL
- UserMenu 改为链接到 /settings/credits（原 /settings/my-keys）

### ⚠️ 重要坑（第二阶段补充）
- Payjs 回调必须返回纯文本 "success"（小写无引号），否则会重试
- Payjs 签名：参数按 key 升序拼成 a=1&b=2，末尾加 &key=商户密钥，MD5 转大写
- Order.outTradeNo 生成规则：MX + 时间戳36进制 + 随机 + userId前8位，确保唯一
- i18n 字典类型定义在 types.ts，不要在 zh.ts 里 self-reference（会循环引用报错）
- 轮询支付状态用 setInterval 3秒，PAID 后 reload 页面刷新余额

### 第三阶段（2026-07-04 完成）

#### 后台管理系统
- schema 加 `SiteConfig`(key-value, category) 表（迁移 20260704000003_admin_siteconfig）
- `lib/site-config/service.ts`: get/getAll/set/setConfigs，敏感字段（smtp_pass/payjs_key）AES 加密存储，空字符串跳过更新
- `lib/email/service.ts`: nodemailer SMTP + sendWelcomeMail + testEmailConnection；注册流程异步发邮件（失败不阻塞）
- `lib/payments/payjs.ts` 改为 DB 优先：getConfigWithDefault 先查 SiteConfig 再 fallback env；isPayjsConfigured/verifyPayjsNotify 改异步；加 testPayjsConnection
- `/api/admin/users` GET列表/POST新增（requireAdmin）
- `/api/admin/users/[id]` PATCH（creditDelta 增量调整+role 改+name 改）/DELETE（禁止删自己/最后一个admin）
- `/api/admin/settings` GET/PATCH（分类保存 general/email/payjs 配置）
- `/api/admin/test-connection` POST（测试 email/payjs 连接）
- `/admin` 布局+重定向到 /admin/users
- `/admin/users` 用户管理页（表格+新增对话框+改额度+升级降级+删除）
- `/admin/settings` 系统配置页（站点信息+SMTP+Payjs+测试按钮）
- UserMenu 加「管理后台」入口（仅 admin 可见，Shield 图标）
- 安装 nodemailer + @types/nodemailer

#### ⚠️ 重要坑（第三阶段）
- nodemailer 只能在 Node.js runtime 用，不能在 Edge runtime（middleware）里 import
- Payjs 的 isPayjsConfigured/verifyPayjsNotify 签名从同步改异步，所有调用方需 await
- SiteConfig 敏感字段加密：setConfigs 遇到空字符串的敏感字段会跳过（保留原值），避免误清空
- admin 页面本身不靠 middleware 限admin（middleware 只查登录），权限由 /api/admin/* 的 requireAdmin 兜底
- 管理员不能降级/删除自己；系统至少保留一个 admin
