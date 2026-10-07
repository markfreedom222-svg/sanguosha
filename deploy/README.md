# 服务器部署

## 从现有 pnpm 服务切换到 Docker

先停止原来的 pnpm/Node 游戏进程，再操作，确保数据库没有被使用且 9527 端口空闲。服务器安装 Docker Engine 与 Compose 插件后运行：

```sh
cd /opt/sanguosha
git pull --ff-only
sudo systemctl enable --now docker
bash deploy/start-docker.sh
```

脚本构建镜像；首次切换且项目存在 `data/db` 时，将旧 `data/` 复制到空 Docker 数据卷，保留原数据文件。已有 Docker 数据库不会被覆盖。随后以后台方式启动。两项服务已设置 `restart: unless-stopped`，进程退出后自动重启，Docker 服务启动后也会恢复运行（主动停止的容器除外）。

访问 `http://服务器公网IP:9527`，查看状态和日志：

```sh
docker compose ps
docker compose logs --tail=100 -f game web
```

如果停止问题来自程序错误，Docker 会尝试重启，但仍需根据日志修复错误。关闭 SSH 不会停止容器。

## 直接用 pnpm 启动

服务器需要 Node.js 24 和 pnpm。你的仓库已克隆到 `/opt/sanguosha` 时，先停止原来的进程，再执行：

```sh
cd /opt/sanguosha
git pull --ff-only
pnpm install --frozen-lockfile
pnpm resources:install
pnpm dev
```

默认监听 `0.0.0.0:9527`，访问 `http://服务器公网IP:9527`。服务器防火墙和云安全组需允许所有来源访问 TCP 9527。若系统设置过 PORT/HOST，可显式使用 `pnpm dev --host 0.0.0.0 --port 9527`。

资源安装会下载固定版本的武将图片、卡牌图片、音效和背景音乐，下载成功后保留在本地，普通代码更新不必重新安装资源。数据仍保存在项目的 `data/` 中。`pnpm dev` 在前台运行，关闭终端会结束进程；需要关闭 SSH 后继续运行可用 tmux 管理终端会话。

## 推荐：Docker Compose

服务器需 Linux、Docker Engine、Docker Compose 插件，并能访问 npm、GitHub API 与 raw.githubusercontent.com。

将仓库克隆到一个新目录后，在仓库根目录运行：

```sh
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:9527/api/auth/me
```

Docker 构建自动运行 `pnpm resources:install`，从固定的上游提交下载并校验图片、音效及背景音乐，再构建页面。因此 GitHub 仓库无需包含被忽略的 `public/packs`，资源出处和许可见 [资源说明](../docs/resources-local.md)。Git 拉取包含本次代码修改；本机账号和对局数据不会上传。

默认监听所有 IPv4 网卡 `0.0.0.0:9527`，允许公网访问。服务器防火墙及云安全组需允许所有来源（`0.0.0.0/0`）访问 TCP 9527，浏览器访问 `http://服务器公网IP:9527`。有域名时，将服务器现有 HTTPS 反向代理指向本机 `127.0.0.1:9527`，API 的 SSE 连接需要关闭代理缓冲并设置较长读取超时。容器内 Nginx 已配置这些选项。站点需部署在域名根路径。

默认已可通过 IP 和端口访问。如果之前在项目 `.env` 中设置过其他端口或本机监听地址，请更新为：

```dotenv
SGS_BIND_ADDRESS=0.0.0.0
SGS_HTTP_PORT=9527
```

再运行 `docker compose up -d`，并在服务器防火墙/云安全组开放选择的端口。

数据存储在 `game-data` 持久化卷，首次启动会建立新数据库。更新时执行：

```sh
git pull --ff-only
docker compose up -d --build
docker compose logs --tail=100 game
```

保留单个游戏后端实例。不要使用 `docker compose down -v`，它会删除数据库卷。备份需暂停游戏服务后完整备份数据卷，完成后再启动。

验证顺序：首页与资源检查页、注册/登录、创建房间、选将、出牌的实时同步、音乐和音效、重启后的账号/房间数据保留。

参考：[Docker 健康检查与启动顺序](https://docs.docker.com/compose/how-tos/startup-order/)、[Nginx 代理缓冲配置](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering)。
