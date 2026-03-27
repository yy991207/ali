#!/usr/bin/env bash
set -euo pipefail

# 这里保留一个轻量启动脚本，但现在只需要前端，不再依赖 8000 本地服务。
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -d "node_modules" ]]; then
  npm install
fi

echo "启动前端服务：Vite dev server"
npm run dev
