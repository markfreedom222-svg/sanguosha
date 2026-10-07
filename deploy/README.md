# 服务器部署

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
