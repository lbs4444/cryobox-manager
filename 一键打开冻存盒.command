#!/bin/zsh

set -u

PROJECT_DIR="${0:A:h}"
NODE_DIR="/Users/liubosen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
NODE="$NODE_DIR/node"
URL="http://localhost:3000"
LOG_FILE="$PROJECT_DIR/.cryobox-server.log"
PID_FILE="$PROJECT_DIR/.cryobox-server.pid"

cd "$PROJECT_DIR" || exit 1

if [[ ! -x "$NODE" ]]; then
  echo "未找到运行环境：$NODE"
  echo "请在 Codex 中重新打开本项目后再试。"
  read "?按回车键关闭…"
  exit 1
fi

if ! /usr/bin/curl -fsS "$URL" >/dev/null 2>&1; then
  echo "正在启动冻存盒管理系统…"
  PATH="$NODE_DIR:/usr/bin:/bin" /usr/bin/nohup "$NODE" node_modules/next/dist/bin/next dev \
    >"$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  echo "$SERVER_PID" >"$PID_FILE"
  disown "$SERVER_PID" 2>/dev/null || true

  READY=0
  for _ in {1..30}; do
    if /usr/bin/curl -fsS "$URL" >/dev/null 2>&1; then
      READY=1
      break
    fi
    /bin/sleep 1
  done

  if [[ "$READY" -ne 1 ]]; then
    echo "启动失败。日志位置：$LOG_FILE"
    read "?按回车键关闭…"
    exit 1
  fi
else
  echo "系统已经在运行。"
fi

echo "正在打开：$URL"
if [[ "${CRYOBOX_NO_OPEN:-0}" != "1" ]]; then
  /usr/bin/open "$URL"
fi

echo "完成，可以关闭此窗口。"
/bin/sleep 2
