# AWS Ubuntu 部署

部署对象：`13.196.6.118`，项目根目录 `/home/ubuntu/projects`。
三个项目独立部署，不修改业务代码。后端环境文件在服务器生成，不能复制本地开发凭据。

## 当前核实状态（2026-09-10）

三个服务器仓库已从各自 `origin/main` 快进拉取，当前上线版本：

| 项目 | 提交 |
| --- | --- |
| vo1d-blog | `4de7fd7` |
| vo1d-blog-admin | `5875fd0` |
| vo1d-blog-api | `d2c8023` |

服务器生产 `.env`、Nginx、证书及 `deploy/compose.production.yml` 中的运行镜像配置保留；没有额外修改业务代码。
已从本地 PostgreSQL 导出一致性快照，恢复到临时数据库并核对全部 18 张表的记录数及内容校验值，再切换正式库。
MinIO 全部 112 个对象已复制且逐个比对文件哈希。35 张数据库图标随数据库迁移，不需要重新导入。
管理员记录和密码哈希保持一致；3 个 Steam 账号的服务端配置已迁移，本机代理地址未复制到服务器。

- Docker 29 / Compose 5.5.1、Nginx、Node.js 24.20.0、pnpm 10.23.0 已安装。
- 三个域名 A 记录均指向服务器。`sing-box` 为 inactive / disabled。
- 已备份并配置服务器 `.env`，权限 600；凭据随机生成且未输出。
- PostgreSQL、MinIO 均已健康运行；两个 MinIO 初始化服务退出码为 0。
- 主站、后台生产构建通过，静态文件已安装到下方 Nginx 根目录，服务器内部请求返回 200。
- 系统卷已从 8 GiB 扩至 20 GiB，已执行 `growpart /dev/nvme0n1 1` 和 `resize2fs /dev/nvme0n1p1`；根分区约 19 GB，保留此次回退文件后仍有约 11 GB 可用。
- API 运行镜像使用服务器源码快照构建成功；扩容后解包与启动成功，API、PostgreSQL、MinIO 均为 healthy，API 重启次数为 0。
- 公网 `https://api.vo1d.bot.cd/health` 返回 200，响应为 `status: ok` / `database: up`；后台来源及携带 Cookie 所需跨源响应头正确。
- 服务器上的 `prisma generate` 和全部 5 个迁移已完成，`prisma migrate status` 确认结构已是最新状态。
- 首次 Certbot HTTP 验证失败：证书机构连接公网 80 端口超时。
- 用户提供的证书与私钥已核验匹配并安装，覆盖主域和通配域，由 Let's Encrypt 签发。
- 当前 `nginx.conf` 已启用；公网主站/后台 HTTPS 返回 200，HTTP 返回 301 跳转 HTTPS。
- 已验证 MinIO 独立应用账号上传、HTTPS 图片读取、图片字节一致及主站跨源读取响应头；临时验证对象已删除。
- 增加了 `/swapfile.vo1d`（512 MiB，权限 600）并写入 `/etc/fstab`，当前已启用。
- 已清理服务器两个前端的 `node_modules`，源码、锁文件和静态产物保留；由于包文件与 pnpm 缓存硬链接，实际仅释放少量空间。后端依赖保留。
- 证书到期：2026-12-08 18:27:46（Asia/Hong_Kong）。外部平台证书没有接入本机 Certbot 自动续期。

生产库数据：1 个站点资料、6 篇文章、3 本书、47 个游戏、10 张照片、23 项技能、4 个社交链接、112 条媒体记录、1 个管理员。
上线后再次核对 13 张稳定业务表的记录数及内容校验值，通过；自增序列检查通过。
全部 112 条媒体记录对应的公网 HTTPS 地址均返回 200，内容哈希和跨源读取响应头通过检查。
真实 Chrome 浏览器验证：主站显示资料、技能和文章，所有捕获到的主站 API 请求返回 200，没有页面 JavaScript 异常；后台正确跳转到登录页，未登录 `/auth/me` 返回预期 401。
管理员密码哈希已确认原样保留；没有读取明文密码，实际密码登录及登录后的写入操作未运行。
本地验证记录：工作区 `.integration-work/aws-20260910/production-verification.json` 和 `browser-verification.json`；截图同目录 `blog-production.png`、`admin-production.png`。

## 此次发布备份与回退位置

- 服务器备份目录：`/home/ubuntu/projects/vo1d-blog-api/backups/release-20260910/`，目录权限 700，内含发布前环境配置、部署配置、数据库备份、源数据快照和验证记录。
- 旧数据库：`vo1d_blog_before_20260910`，保留发布前的空库；当前正式数据库名仍为 `vo1d_blog`。
- 旧 API 镜像：`vo1d-blog-api:before-20260910`；当前提交对应镜像为 `vo1d-blog-api:release-d2c8023`，同时标记为 `vo1d-blog-api:production`。
- 旧静态目录：`/var/www/vo1d-blog-before-20260910`、`/var/www/vo1d-blog-admin-before-20260910`。
- 本地导出快照：工作区 `.integration-work/aws-20260910/source.dump`、`snapshot-manifest.json` 和 `objects/`。

若需要回退数据库，先备份切换后的当前生产库，防止丢失上线后的后台编辑。不要直接再次用本地全量数据覆盖生产库。
本次导出时短暂停止本地 API，导出结束后已恢复，本地数据和容器卷均保留。

## 文件与配置约定

- `production.env.example`：生产配置模板。填入服务器 `.env` 前先备份，已有真实凭据必须保留。
- `compose.production.yml`：与原 Compose 文件合并使用，提供迁移镜像、MinIO 独立应用账号初始化及 API 生产设置。
- `init-minio-app.sh`：只授予配置桶的读写和列举权限。重新执行会按当前环境变量更新专用账号和策略；不要用于同名的其他系统账号。
- `nginx.conf`：主站/后台静态服务、API 反向代理、MinIO 图片读取，以及 HTTPS 跳转。

所有以下命令在服务器执行。后端工作目录：

```bash
cd /home/ubuntu/projects/vo1d-blog-api
dc() { docker compose -f docker-compose.yml -f deploy/compose.production.yml "$@"; }
dc --profile app --profile ops config -q
```

只用 `config -q` 校验，避免输出带凭据的完整合并配置。
Compose 容器中的数据库地址是 `postgres:5432`，宿主机迁移工具使用 `.env` 中的 `127.0.0.1:5433`。
API 在容器内监听 3000，宿主机仅绑定 `127.0.0.1:3100`。
MinIO 的容器端点是 `http://minio:9000`，浏览器媒体地址为 `https://api.vo1d.bot.cd/objects`。
如果更换 `S3_BUCKET=vo1d-media`，须同步修改 Nginx `/objects/` 的上游桶路径。

## 初始化与启动

```bash
dc up -d postgres minio minio-init minio-app-init
dc ps -a
```

生产只使用已有迁移文件执行 `prisma migrate deploy`，不用 `migrate dev`、`db push` 或 `migrate reset`。
`pnpm build` 已包含 `prisma generate && nest build`；运行镜像只包含运行依赖、编译产物和 package.json。
迁移镜像来自 Dockerfile 的 `migration` 阶段，不应尝试在精简运行镜像内调用 Prisma CLI。

资源充足的构建环境可以运行：

```bash
dc build migrate api
dc run --rm migrate
dc run --rm migrate pnpm prisma:migrate:status
dc --profile app up -d --no-build api
```

这台服务器约 909 MiB 内存，系统卷现为 20 GiB，配置 512 MiB 交换空间；不宜同时构建多个项目。
本次在本机使用服务器原始源码构建 `vo1d-blog-api:production`，将镜像直接传入服务器 Docker，避免保存额外 tar 副本。
服务器已有 Node 24 与依赖，因此可以使用宿主机执行迁移，再启动已加载镜像：

```bash
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm prisma:migrate:status
dc --profile app up -d --no-build api
curl -fsS http://127.0.0.1:3100/health
```

生成结构不等于导入博客内容。现有数据库、媒体与管理员迁移需另行核对，不能运行全量 `import:frontend` 替代现有数据迁移。
只有选择全新空库且需要创建新管理员时，才在交互式 SSH 终端运行 `pnpm admin:create`；密码隐藏输入，不写入文档或命令行。

## 静态站点

```bash
cd /home/ubuntu/projects/vo1d-blog
pnpm install --frozen-lockfile
VITE_API_BASE_URL=https://api.vo1d.bot.cd pnpm build
cd /home/ubuntu/projects/vo1d-blog-admin
pnpm install --frozen-lockfile
VITE_API_BASE_URL=https://api.vo1d.bot.cd pnpm build
```

发布 `dist/` 内的文件到 `/var/www/vo1d-blog/` 和 `/var/www/vo1d-blog-admin/`。
构建环境变量写入编译结果，每次重新构建都需要设置。不要将源码目录或 `.env` 作为 Nginx 静态根目录。

## 证书与网络

AWS 安全组入站需开放 TCP 80 和 443，来源 `0.0.0.0/0`；SSH 保留用户原有来源规则。
数据库 5433、MinIO 9000/9001、API 3100 均保留回环绑定。

证书安装路径：

```text
/etc/nginx/ssl/vo1d.bot.cd/fullchain.pem  root:root 644
/etc/nginx/ssl/vo1d.bot.cd/privkey.pem    root:root 600
```

安全传输用户提供的证书文件，放入上述路径后再启用最终配置：

```bash
sudo install -m 644 deploy/nginx.conf /etc/nginx/sites-available/vo1d-blog
# 本次已创建该链接，后续更新无需重复执行 ln。
sudo nginx -t && sudo systemctl reload nginx
```

域名平台续期后仍需将新证书和匹配私钥部署到服务器，并通过 `nginx -t` 后 reload。
已安装 Certbot 不代表外部平台下载的证书会自动更新，不能把 `certbot renew --dry-run` 的空配置结果当作续期成功。

## 验收

```bash
curl -fsS https://api.vo1d.bot.cd/health
curl -I https://vo1d.bot.cd
curl -I https://admin.vo1d.bot.cd/articles/123
curl -I http://vo1d.bot.cd
dc --profile app ps -a
pnpm prisma:migrate:status
df -h /
free -m
```

已验收主站内容加载、公开接口、媒体读取及跨源响应；管理员实际密码登录/退出、后台上传/编辑仍需使用原账号验收。
`/health` 只检查数据库连通性，不证明图片、登录、迁移表或业务内容已完整就绪。
备份要同时覆盖 PostgreSQL 和 MinIO。禁止用 `docker compose down -v` 排障。

参考：[Prisma migrate deploy](https://docs.prisma.io/docs/cli/migrate/deploy)、[Nginx 代理配置](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)、[Certbot Nginx 指南](https://certbot.eff.org/instructions?os=snap&ws=nginx)。
