# vo1d-blog-api

vo1d 个人博客的后端：NestJS + Prisma + PostgreSQL，图片存 MinIO / S3。提供访客端的公开内容接口和后台的管理接口，本身不含页面。博客（`vo1d-blog`）和管理后台（`vo1d-blog-admin`）在同级目录，三个项目各自独立。

## 接口概览

接口直接挂在根路径，没有 `/api` 或版本前缀。本机端口是 **3100**（容器内部为 3000）。

| 路径                                                                       | 说明                               |
| -------------------------------------------------------------------------- | ---------------------------------- |
| `/site-profile`、`/social-links`、`/skills`、`/books`、`/games`、`/photos` | 公开内容，列表分页，每页最多 50 条 |
| `/creations`、`/creations/layout`                                          | 创作动态及其分类、布局             |
| `/games/playing`                                                           | 当前 Steam 游玩状态                |
| `/media/:id/content`                                                       | 存在数据库里的图标                 |
| `/auth/*`、`/admin/*`                                                      | 登录和管理接口，需要会话 Cookie    |
| `/health`、`/docs`、`/docs-json`                                           | 健康检查、Swagger、OpenAPI JSON    |

完整契约以运行中的 [Swagger](http://localhost:3100/docs) 为准。创作动态的导入、删除和展示规则见博客仓库的 [CREATIONS.md](../vo1d-blog/CREATIONS.md)；图标和多 Steam 账号的规则见后台仓库的 [图标与 Steam 说明](../vo1d-blog-admin/docs/icons-multi-steam.md)。

公开列表响应带 `ETag` 和 `Cache-Control: public, max-age=60, stale-while-revalidate=300`，支持条件请求返回 304；博客每次请求都重新验证，所以刷新即可看到后台的修改。`/creations`、`/games/playing`、`/health` 和所有管理接口固定 `no-store`。

文章、分类、标签的接口已经移除。对应的数据库表和历史数据仍保留，`prisma/schema.prisma` 里的相关模型只为保留这些数据，没有接口读写它们。

## 日常启动

已有数据库、媒体和管理员时，在本目录执行：

```powershell
docker compose --profile app up -d
```

改了后端源码后加 `--build api`。然后分别在后台和博客目录运行 `pnpm dev`（端口 5174 和 5173）。

- API：[健康检查](http://localhost:3100/health)、[Swagger](http://localhost:3100/docs)
- PostgreSQL：只绑定本机 5433；内容库 `vo1d_blog`，测试库 `vo1d_blog_test`
- MinIO：9000（对象）、9001（控制台），凭据在本地 `.env`

要用热重载开发后端时，先停掉占用 3100 的 `api` 容器（保留 PostgreSQL 和 MinIO），再运行 `pnpm start:dev`。不要让两个后端同时占用 3100。

`docker compose stop` 会保留数据卷。**不要运行 `docker compose down -v`**，那会删除全部本地内容和图片。

## 新环境初始化

需要 Node.js 24.20.0、pnpm 10.23.0 和已启动的 Docker。

```powershell
corepack enable
corepack prepare pnpm@10.23.0 --activate
pnpm install --frozen-lockfile
pnpm setup:local
docker compose up -d postgres minio minio-init
pnpm prisma:migrate:deploy
pnpm admin:create
pnpm build
pnpm start
```

- `setup:local` 只在 `.env` 不存在时生成随机的本地数据库、存储密码和 IP 哈希密钥，不会覆盖已有配置。手工配置参照 `.env.example`。
- `admin:create` 在交互终端读取邮箱和隐藏密码（8–32 字符）。已有邮箱需输入 `RESET` 才会重置密码并撤销旧会话。没有默认账号。
- 仓库不含内容导入脚本。迁移到新机器时，单独备份和恢复 PostgreSQL 与 MinIO 两个数据卷；只有源码不等于完整的网站备份。

## 脚本

| 命令                              | 用途                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| `pnpm setup:local`                | 生成本地 `.env`                                                |
| `pnpm admin:create`               | 创建或重置管理员                                               |
| `pnpm maintenance:prune`          | 清理过期会话和旧的登录限流记录                                 |
| `pnpm migrate:icons [-- --check]` | 把技能、社交链接引用的图标从对象存储迁入数据库                 |
| `pnpm verify:smoke`               | 用临时管理员通过真实 HTTP 验证登录、退出和公开接口，结束后清理 |

## 实现要点

**认证**：登录生成 32 字节随机令牌，原值只存在 HttpOnly Cookie 里，数据库只存 SHA-256。生产环境 Cookie 为 Secure、HttpOnly、SameSite=Lax、host-only。登录按 IP 和邮箱分别限流，默认 60 秒 5 次，超出后阻断 300 秒，计数存在 PostgreSQL。

**来源校验**：`FRONTEND_ORIGINS` 是精确来源列表，写请求的 Origin 缺失或不匹配返回 403。Swagger 里要执行写操作，需要把 Swagger 自己的来源也加进去。

**媒体**：上传时校验扩展名、MIME 和文件头，并用 Sharp 重编码为 WebP。普通图片存对象存储；图标的二进制存在 `media_contents` 表，通过 `/media/:id/content` 读取。删除媒体前检查业务引用，仍被引用时返回 409。PostgreSQL 和对象存储之间没有跨系统事务：数据库删除成功而对象删除失败时返回 500，并在日志里记录需要人工清理的对象键。

**Steam**：支持多个账号，同一 App ID 的时长按分钟合计后取整小时。同步只更新时长快照，不覆盖评分、评论、封面和排序。密钥只从环境变量读取。

**创作动态**：从 X 链接手动导入，校验真实作者；删除后留下标记，阻止同一条再次导入。没有自动同步。

## 版本约束

精确版本见 `package.json` 和 `pnpm-lock.yaml`，以下几项是有意锁定的：

- **Prisma 7.10.0**：选定时 `latest` 标签指向 8.0 的预发布版，所以显式锁在稳定线。连接地址在 `prisma.config.ts`，生成的客户端输出到 `src/generated/prisma`，运行时通过 `PrismaPg` 适配器连接。
- **TypeScript 6.0.3**：`typescript-eslint` 目前只兼容到 `<6.1`。
- **NestJS 12**：ESM 发布，项目使用 NodeNext 和显式 `.js` 导入。Vitest 通过 SWC 编译以保留依赖注入需要的装饰器元数据。
- `pnpm-workspace.yaml` 里覆盖了两个 Prisma 传递依赖（`deepmerge-ts`、`mysql2`）以修复安全告警，没有更换 Prisma 主版本。审计用官方源：`pnpm audit --prod --registry=https://registry.npmjs.org`。
- 没有 Redis 或消息队列。未引入 `@nestjs/throttler`，因为它尚未声明兼容 NestJS 12。

## 测试

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

`pnpm test:e2e` 需要先启动 Compose 的 PostgreSQL 和 MinIO，并设置 `TEST_DATABASE_URL`。测试拒绝连接名称里不含 `test` 的数据库，也拒绝在 production 模式运行，只清理测试库和它的媒体。

## 部署

生产环境的 Compose、Nginx 配置和步骤见 [deploy/README.md](deploy/README.md)，上传仓库和首次上线的整体流程见后台仓库的 [发布准备说明](../vo1d-blog-admin/docs/release-guide.md)。要点：

- 生产只用 `prisma migrate deploy`，不用 `db push` 或重置。
- 设置 `NODE_ENV=production`；只有部署在一个会覆盖转发头的可信反向代理后面时才设 `TRUST_PROXY=true`。
- 对象存储用只能读写媒体 bucket 的凭据，CDN 地址通过 `MEDIA_PUBLIC_BASE_URL` 配置。图片服务要允许博客来源的 CORS，游戏封面取色需要读取像素。
- 备份必须同时覆盖 PostgreSQL 和对象存储。

## 目录

- `src/bootstrap.ts`：Express、安全中间件、CORS、校验和 Swagger，服务与测试共用。
- `src/<业务>/`：按业务拆分的 Module、Controller、Service、DTO。
- `prisma/`：数据模型和迁移 SQL。
- `scripts/`：本地配置、管理员、维护和冒烟验证脚本。
- `test/`、`src/**/*.spec.ts`：端到端和单元测试。
- `deploy/`：生产部署配置和说明。
