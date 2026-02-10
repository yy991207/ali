#!/usr/bin/env bash
set -euo pipefail

# 进入脚本所在目录的上级（项目根目录）
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# 必须先激活 deepagent，再进行后续服务启动
if command -v conda >/dev/null 2>&1; then
  # shellcheck disable=SC1091
  source "$(conda info --base)/etc/profile.d/conda.sh"
  conda activate deepagent
else
  echo "未找到 conda，请先安装并初始化 conda"
  exit 1
fi

ENV_NAME="mark"
PY_VERSION="3.11"

# 检查是否存在 mark 环境（用 JSON 避免解析误差）
COND_ENV_JSON="$(conda env list --json 2>/dev/null || echo '{}')"
export COND_ENV_JSON
ENV_EXISTS="$(python - <<'PY'
import json, os
raw = os.environ.get("COND_ENV_JSON", "{}")
try:
    data = json.loads(raw)
except Exception:
    data = {}
names = [os.path.basename(p) for p in data.get("envs", [])]
print("1" if "mark" in names else "0")
PY
)"

if [[ "$ENV_EXISTS" != "1" ]]; then
  echo "创建 conda 环境：$ENV_NAME (python=$PY_VERSION)"
  conda create -y -n "$ENV_NAME" "python=$PY_VERSION"
else
  # 校验 python 版本，不一致则修正版本
  ENV_PY_VERSION="$(conda run -n "$ENV_NAME" python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")"
  if [[ "$ENV_PY_VERSION" != "$PY_VERSION" ]]; then
    echo "环境 $ENV_NAME 的 Python 版本为 $ENV_PY_VERSION，修正为 $PY_VERSION"
    conda install -y -n "$ENV_NAME" "python=$PY_VERSION"
  fi
fi

# 安装后端依赖
conda run -n "$ENV_NAME" python -m pip install -r server/requirements.txt

# 安装前端依赖（如未安装）
if [[ ! -d "node_modules" ]]; then
  npm install
fi

echo "启动后端服务：http://localhost:8000"
conda run -n "$ENV_NAME" uvicorn server.main:app --reload --port 8000 &
BACKEND_PID=$!

echo "等待后端启动..."
BACKEND_READY=0
for _ in {1..30}; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "后端启动失败，请检查日志"
    exit 1
  fi
  if command -v curl >/dev/null 2>&1; then
    if curl -s http://localhost:8000/api/marks >/dev/null 2>&1; then
      BACKEND_READY=1
      break
    fi
  else
    if python - <<'PY'
import socket, sys
s = socket.socket()
s.settimeout(0.2)
try:
    s.connect(("127.0.0.1", 8000))
    sys.exit(0)
except Exception:
    sys.exit(1)
finally:
    s.close()
PY
    then
      BACKEND_READY=1
      break
    fi
  fi
  sleep 0.3
done

if [[ "$BACKEND_READY" != "1" ]]; then
  echo "后端未就绪，请确认 8000 端口可用"
  exit 1
fi

echo "启动前端服务：Vite dev server"
npm run dev &
FRONTEND_PID=$!

cleanup() {
  echo "停止服务"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

# 持续等待两个服务
wait
