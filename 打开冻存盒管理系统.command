#!/bin/zsh

cd "$(dirname "$0")" || exit 1

LOG_FILE=".cryobox-local.log"
PID_FILE=".cryobox-local.pid"
PORT_FILE=".cryobox-local.port"

echo "冻存盒管理系统（本地版）"
echo "项目目录：$(pwd)"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js。"
  echo "请先安装 Node.js LTS：https://nodejs.org/"
  echo "安装后重新双击本文件。"
  echo ""
  read "REPLY?按回车键退出..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "首次运行：正在安装依赖。"
  echo "如果网络较慢，请等待；中国大陆网络可尝试使用 npm 镜像源。"
  echo ""
  if ! npm install --registry=https://registry.npmmirror.com; then
    echo ""
    echo "依赖安装失败。请检查网络后重试，或手动运行："
    echo "  npm install --registry=https://registry.npmmirror.com"
    echo ""
    read "REPLY?按回车键退出..."
    exit 1
  fi
fi

PORT=""
if [ -f "${PORT_FILE}" ]; then
  SAVED_PORT="$(cat "${PORT_FILE}")"
  if [[ "${SAVED_PORT}" == <-> ]] && curl -fsS "http://localhost:${SAVED_PORT}" >/dev/null 2>&1; then
    PORT="${SAVED_PORT}"
  fi
fi

if [ -z "${PORT}" ]; then
  for CANDIDATE in {3000..3010}; do
    if ! lsof -iTCP:"${CANDIDATE}" -sTCP:LISTEN >/dev/null 2>&1; then
      PORT="${CANDIDATE}"
      break
    fi
  done
fi

if [ -z "${PORT}" ]; then
  echo "启动失败：3000–3010 端口均被占用。"
  echo ""
  read "REPLY?按回车键退出..."
  exit 1
fi

URL="http://localhost:${PORT}"

if ! curl -fsS "${URL}" >/dev/null 2>&1; then
  echo "正在启动本地系统：${URL}"
  NEXT_PUBLIC_APP_MODE=local nohup npm run dev -- --hostname 127.0.0.1 --port "${PORT}" >"${LOG_FILE}" 2>&1 &
  SERVER_PID=$!
  echo "${SERVER_PID}" >"${PID_FILE}"
  echo "${PORT}" >"${PORT_FILE}"
  disown "${SERVER_PID}" 2>/dev/null || true

  READY=0
  for _ in {1..45}; do
    if curl -fsS "${URL}" >/dev/null 2>&1; then
      READY=1
      break
    fi
    sleep 1
  done

  if [ "${READY}" -ne 1 ]; then
    echo "启动失败。日志文件：${LOG_FILE}"
    echo ""
    read "REPLY?按回车键退出..."
    exit 1
  fi
else
  echo "系统已经在运行：${URL}"
fi

echo "正在打开浏览器：${URL}"
open "${URL}" >/dev/null 2>&1
echo "完成。可以关闭此窗口，系统会继续在后台运行。"
sleep 2
