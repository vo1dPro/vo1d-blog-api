# vo1d-blog-api

独立 NestJS 博客后端，提供 `/` 公共内容与管理员 REST（Representational State Transfer，表述性状态转移）接口。前端仓库只用于显式导入，不属于运行时依赖；本项目不创建后台页面。

接口直接使用 `/articles`、`/games`、`/auth/login`、`/admin/...`，不设 API 或版本前缀。适合独立后端域名；若未来同域同时部署前端，需要反向代理明确分流这些路径。现有本地配置使用 **3100** 端口，Swagger 为 [http://localhost:3100/docs](http://localhost:3100/docs)。Cookie 路径为 `/`，旧地址不再提供兼容路由，更新客户端基础地址后重新登录。

Steam 多账号自动同步已接入 games，同一 App ID 的时长按分钟合计，保留博客的手工评分、评论、封面与排序。配置和新管理员接口见 [Steam 接入文档](docs/steam-integration.md)；密钥只读环境变量，不进入 OpenAPI 或客户端。

## 运行要求与版本决定

已锁定 Node.js **24.20.0 LTS**（Long-Term Support，长期支持）、pnpm **10.23.0**、NestJS **12.0.1**（默认 Express）、Prisma ORM（Object-Relational Mapping，对象关系映射）**7.10.0**、PostgreSQL **18.4**、TypeScript **6.0.3 strict**、Vitest **4.1.11** 和 Supertest。精确依赖及传递版本见 `package.json` / `pnpm-lock.yaml`。没有 Redis 或消息队列。

2026-09-03 核对官方文档及 npm registry 后作出以下决定：

- [NestJS 12 官方迁移说明](https://docs.nestjs.com/migration-guide)：新版本发布 ESM（ECMAScript Modules，标准 JavaScript 模块），项目使用 NodeNext 与显式 `.js` 导入，保留装饰器元数据。
- [Prisma 官方 7.10 文档](https://www.prisma.io/docs/orm/v7)：当时 `prisma` 的 `latest` 标签指向 **8.0.0-rc.12 预发布版本**，因此显式锁定 `prisma`、`@prisma/client`、`@prisma/adapter-pg` 为稳定的 **7.10.0**，不使用 `@latest` 初始化。
- [Prisma 配置参考](https://docs.prisma.io/docs/orm/reference/prisma-config-reference)：连接地址在 `prisma.config.ts`，schema 只声明 provider；生成器使用 `prisma-client` 和显式输出目录 `src/generated/prisma`；应用以 `new PrismaClient({ adapter: new PrismaPg(...) })` 连接 PostgreSQL。不要复制 Prisma 6 的 `datasourceUrl` 配置。CLI（Command Line Interface，命令行工具）和运行时各自读取 `DATABASE_URL`。
- [Prisma 迁移部署](https://docs.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)：生产使用 `prisma migrate deploy`，不使用 `db push` 或自动重置。初始结构迁移由当前 CLI 的 `migrate diff --from-empty --to-schema ... --script` 生成，第二份 SQL 增加真实 CHECK 约束。
- TypeScript 7 已发布，但当前 `typescript-eslint` 兼容范围为 `<6.1`，故选择兼容稳定线 6.0.3。`@nestjs/throttler` 6.5.0 只声明兼容至 NestJS 11，未引入；登录限流使用 PostgreSQL 原子 UPSERT，跨应用实例一致。
- Vitest 使用 SWC（Speedy Web Compiler，高速编译器）保留 Nest 依赖注入所需的装饰器元数据；普通 esbuild 转译无法提供这些元数据。
- [Node.js 官方 24 发布记录](https://nodejs.org/en/download/archive/v24)；本地 `.node-version` 与 Docker 镜像锁定同一补丁版本。

新增依赖均服务于已确认功能：Argon2id 密码哈希、Sharp 图片重编码、S3 存储客户端、Marked 与 sanitize-html 安全正文、class-validator 请求校验、Zod 环境与导入数据校验。禁止提交生成代码、密钥或密码。

2026-09-05 安全审计发现 Prisma 的传递依赖告警，因此在 `pnpm-workspace.yaml` 中仅覆盖 `@prisma/config>deepmerge-ts=8.0.0` 和 `prisma>mysql2=3.23.1`，未更换 Prisma 主版本。前者修复[循环引用递归漏洞](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)，后者修复[认证降级](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr)及[压缩包资源耗尽](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3)。本项目只使用 PostgreSQL；覆盖后仍需回归 Prisma 生成、迁移和测试。使用官方源审计：`pnpm audit --prod --registry=https://registry.npmjs.org`，镜像源可能不提供审计端点。

## 当前三项目日常启动

上传仓库与正式上线见 [发布准备说明](../vo1d-blog-admin/docs/release-guide.md)。请单独迁移数据库和媒体数据，不要把源码仓库当成完整的网站备份。

本机 API 使用 3100。已有数据库、媒体和管理员时，在本目录运行 `docker compose --profile app up -d`，随后分别在后台和博客目录运行 `pnpm dev`、`pnpm dev --host localhost --port 5173 --strictPort`。全部使用 Node.js 24，同时核对 `node --version` 与 `pnpm exec node --version`。完整职责、启动顺序与验收见 [联动说明](../vo1d-blog-admin/docs/full-integration.md)。

## 首次初始化（新环境，Windows PowerShell）

以下导入和管理员创建仅用于新环境；本机日常启动不要重跑。首次生成环境默认端口是 3000，本机三项目约定为 3100。

在 `D:\Code_Project\vo1d-blog-api` 执行，先确保 `node --version` 是 24.20.0，Docker Desktop Linux 引擎已启动：

```powershell
corepack enable
corepack prepare pnpm@10.23.0 --activate
pnpm install --frozen-lockfile
pnpm setup:local
docker compose up -d postgres minio minio-init
pnpm prisma:migrate:deploy
pnpm import:frontend -- --source "D:\Code_Project\vo1d-blog"
pnpm import:icons -- --source "D:\Code_Project\vo1d-blog"
pnpm admin:create
pnpm build
pnpm start
```

`setup:local` 只在 `.env` 不存在时生成随机本地数据库、对象存储密码和 IP 哈希密钥；不会覆盖已有配置，不会创建管理员。`.env.example` 供手工配置，仅有占位值和非敏感默认选项。生成的本地地址只用于本地开发，不适用于生产。

本机若默认仍是 Node 20，应安装或切换到 Node 24。开发过程中另在被忽略的 `tmp/runtime` 中校验 SHA-256 后下载了便携 Node 24；它不是交付依赖。不要使用 `engine-strict=false` 作为正常运行方案。

地址：

- API：[健康检查](http://localhost:3000/health)，[文章列表](http://localhost:3000/articles)。
- Swagger：[交互文档](http://localhost:3000/docs)，[OpenAPI JSON](http://localhost:3000/docs-json)。
- MinIO 控制台：[本地控制台](http://localhost:9001)，凭据来自本地 `.env` 的 `MINIO_ROOT_USER / MINIO_ROOT_PASSWORD`。
- 媒体：[本地 bucket](http://localhost:9000/vo1d-media) 下的对象 URL；不允许匿名写入。
- PostgreSQL：仅绑定 loopback 的 5433 端口。数据库 `vo1d_blog` 与隔离测试库 `vo1d_blog_test` 各自独立。

开发热重载用 `pnpm start:dev`。完整容器应用用 `docker compose --profile app up -d --build api`；不要同时占用 3000 端口运行本机服务。数据库迁移需要在应用发布前完成。Compose 的 `api` 服务用于本地集成，`.env` 的 `NODE_ENV=development` 让 HTTP 本地 Cookie 可用；生产须设 `NODE_ENV=production`。

若 3000 已被其他项目占用，可在当前 PowerShell 设置 `$env:PORT='3100'` 再启动 Compose，容器内部端口仍固定 3000。此时访问 `http://localhost:3100/docs`，运行冒烟验证前设置 `$env:SMOKE_API_BASE_URL='http://localhost:3100/'`；Swagger 写操作需要把 `http://localhost:3100` 加入 `FRONTEND_ORIGINS`。本机服务则直接读取 `PORT` 监听对应端口。

`docker compose stop` 保留数据库与媒体卷；不要运行 `down -v`，除非明确打算删除全部本地数据。生产备份必须同时覆盖 PostgreSQL 与对象存储。

## 数据导入

```powershell
# 只验证源数据、数量和路径，无外部写入
pnpm import:frontend -- --source "D:\Code_Project\vo1d-blog" --check
# 执行可重复导入
pnpm import:frontend -- --source "D:\Code_Project\vo1d-blog"
```

脚本使用 TypeScript AST（Abstract Syntax Tree，抽象语法树）读取实际数组和独立的 src/data/site-profile.ts 迁移文案（兼容旧组件提取），不执行前端代码。先验证所有路径并解码所有图片，遇到缺失/损坏文件会列出清单并停止。明确处理以下文件名映射：

| 声明名称                         | Windows 实际名称                                     |
| -------------------------------- | ---------------------------------------------------- |
| `NieRAutomata™.jpg`              | `NieRAutomata#U2122.jpg`                             |
| `Titanfall® 2.jpg`               | `Titanfall#U00ae 2.jpg`                              |
| `Wallpaper Engine：壁纸引擎.jpg` | `Wallpaper Engine#Uff1a#U58c1#U7eb8#U5f15#U64ce.jpg` |
| `界外狂潮.jpg`                   | `#U754c#U5916#U72c2#U6f6e.jpg`                       |
| `三伏.jpg`                       | `#U4e09#U4f0f.jpg`                                   |
| `烟火.jpg`                       | `#U70df#U706b.jpg`                                   |

文章、书籍、游戏、照片保留原整数 ID；分类、技能和社交链接按源数组位置分配稳定 ID。导入结束修正自增序列。文章封面固定按 `src/lib/blog.ts` 的原始 thumbnails 顺序绑定 ID 1～6；忽略存在索引错位的运行时封面选择函数。`content` 段落转换为 Markdown，`<code>` 内容解码并转换为行内代码。

预期数量：文章 6、分类 6、标签 11、书籍 3、游戏 47、照片 10、技能 24、社交链接 3。媒体 76 = 博客封面 6 + 书封 3 + 游戏封面 47 + 照片展示图 10 + 原有缩略图 10。`all` 保留为兼容聚合分类，无文章引用；`category=all` 表示全部文章。该基础导入不包含图标。技能与社交图标使用独立的 `pnpm import:icons -- --source "D:\Code_Project\vo1d-blog"` 补充迁移，增加 34 个媒体对象（完整基线 110）。页脚手势与两个 3D 模型仍保留前端。

源游戏的 0 评分/时长原样保存，未出现的 platform 为 null；只转换约定占位值，不猜测真实游戏信息。`sourceName=xx`、`sourceUrl=#`、评论“暂无评价”转为 null。`likeLevel` 保持 0～5。

重复执行会更新相同 ID 的业务文字，并复用已关联媒体，先通过 S3 HEAD 确认对象存在。它是迁移工具，**会刷新同 ID 的后台编辑内容**；不建议生产上线后继续当作同步任务。已有图片不会因再次导入而更换；更换图片用后台上传接口。导入采用数据库 advisory lock 防止两个导入同时执行；请在维护窗口运行，避免后台同时间编辑这些记录。失败时事务回滚并补偿清理已上传对象；清理失败会输出需人工重试的对象键。

## 管理员和安全部署

`pnpm admin:create` 从交互终端读取邮箱与隐藏密码（8～32 字符），两次输入各按一次 Enter，确认一致后会显示保存提示。已有邮箱需输入 `RESET` 后重置密码、激活账号并撤销全部旧会话。seed 没有默认密码，也没有访客身份模型。

登录生成 32 字节随机 Token，仅 HttpOnly Cookie 保存原值，数据库只保存 SHA-256。生产 Cookie 使用 Secure、HttpOnly、SameSite=Lax、host-only、`/` 路径；退出立即删除会话并清 Cookie。登录按 IP 与规范化邮箱独立计数，默认每 60 秒 5 次尝试，之后阻断 300 秒；包括成功尝试，攻击者不能靠更换邮箱或并发请求绕过单一桶。过期会话访问时删除，长期不用的会话与旧限流桶可用 `pnpm maintenance:prune` 清理。

生产示例来源是 `https://example.com,https://admin.example.com`，API 建议 `https://api.example.com`。三个域名需 HTTPS，Admin 和 API 需同一站点以满足 SameSite=Lax；`FRONTEND_ORIGINS` 用精确 Origin，写请求缺失或不匹配即 403。Swagger Try it out 写操作还需要把 Swagger 自己的精确 Origin 加入允许来源。不要开放任意来源。

反向代理终止 TLS（Transport Layer Security，传输层安全），限制请求体并转发至内部 API。只有明确部署在一个可信、覆盖转发头的代理后才设置 `TRUST_PROXY=true`；直接暴露服务保持 false。数据库连接池默认上限 10、连接等待 5 秒；生产 DB 应限制网络访问和最小权限，迁移用户和运行用户可分离。

生产 R2/S3 配置：`S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE`；CDN 地址通过 `MEDIA_PUBLIC_BASE_URL` 设置，数据库无需改 URL。使用只允许该 bucket 必要读写的凭据；MinIO 根凭据仅限本地。CDN/object storage 必须允许前端读取图像所需的精确 CORS 来源，尤其游戏封面取色会读取 canvas 像素。

图片会检查扩展名、MIME 和魔数并用 Sharp 重编码；数据库无二进制。删除媒体前检查所有业务引用，外键 RESTRICT 防止并发建立引用时误删。数据库删除成功后若对象删除失败，会返回 500 并记录孤立对象键；管理员按日志重试对象存储清理。PostgreSQL 与 S3 没有跨系统事务，必须保留日志并处理这种补偿失败。

本版不提供任意 URL 预览代理、访客注册、评论、持久化点赞/收藏、统计、订阅。后台 UI（User Interface，用户界面）由独立 vo1d-blog-admin 提供且已接通；博客全部目标模块也已接通。[前端接入文档](docs/frontend-integration.md) 与 [API 契约](docs/api-contract.md) 说明现有客户端契约。

## 测试与验收

在后端根目录执行：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

端到端测试必须先启动 Compose PostgreSQL/MinIO，并设置 `TEST_DATABASE_URL`。测试明确拒绝没有 `test` 名称分段的数据库、拒绝 production 模式、绝不回退至开发 `DATABASE_URL`；只清理隔离测试库及其媒体。测试覆盖认证、限流、发布隔离、过滤分页、冲突、真实 CHECK 约束、媒体重编码/引用删除、安全正文和 Swagger。导入集成测试读取 `FRONTEND_SOURCE_PATH`，未设置时读取相邻的 `../vo1d-blog`；持续集成须提供这份只读导入源。

```powershell
curl.exe -i http://localhost:3000/health
curl.exe -i "http://localhost:3000/articles?page=1&pageSize=6"
curl.exe -i http://localhost:3000/admin/articles
```

第三条未登录应返回 401。验证登录时从交互终端安全输入凭据，通过允许的 Origin 与 Cookie 容器请求，不把密码写入仓库或命令历史。`pnpm verify:smoke` 使用随机临时管理员通过真实 HTTP（Hypertext Transfer Protocol，超文本传输协议）验证登录/退出/公共端点，结束删除该临时用户并撤销会话，不输出密码。

## 项目文件

- `src/bootstrap.ts`：Express、安全中间件、CORS、验证、Swagger，供服务与测试共享。
- `src/{config,database,auth,...}`：按业务拆分的 Module、Controller、Service、DTO；Controller 不直接查询数据库。
- `prisma/schema.prisma`、`prisma/migrations/`：模型、索引、外键与可审查 SQL。
- `scripts/`：本地配置、交互管理员、只读解析/幂等导入、维护、HTTP 验证。
- `test/` 与 `src/**/*.spec.ts`：PostgreSQL 端到端及单元测试。
- `Dockerfile`：多阶段构建、运行阶段非 root；Compose 提供本地持久卷与健康检查。
- `docs/`：接口与前端集成契约、最终实测记录。
