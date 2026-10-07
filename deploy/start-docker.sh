#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

docker compose version >/dev/null
docker info >/dev/null
docker compose build

# 首次切换时将旧 pnpm 数据复制到空数据卷；已有容器数据不覆盖。
if [ -d data/db ]; then
  docker compose run --rm --no-deps --user root \
    -v "$PWD/data:/seed:ro" game sh -eu -c '
      if [ -e /app/data/db ]; then
        echo "Docker 数据库已存在，保留现有数据。"
      elif [ -n "$(find /app/data -mindepth 1 -maxdepth 1 -print -quit)" ]; then
        echo "数据卷非空，停止迁移，避免覆盖。" >&2
        exit 1
      else
        cp -a /seed/. /app/data/
        chown -R node:node /app/data
        echo "已将 pnpm 数据迁移到 Docker 数据卷。"
      fi
    '
fi

docker compose up -d
docker compose ps
