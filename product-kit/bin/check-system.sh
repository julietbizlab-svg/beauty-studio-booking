#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

command -v node >/dev/null 2>&1 || { echo "錯誤：找不到 Node.js（需要 20 以上）"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "錯誤：找不到 npm"; exit 1; }

NODE_MAJOR=$(node -p "Number(process.versions.node.split('.')[0])")
[ "$NODE_MAJOR" -ge 20 ] || { echo "錯誤：Node.js 需要 20 以上"; exit 1; }

[ -f "$ROOT_DIR/backend/package-lock.json" ] || { echo "錯誤：缺少 backend/package-lock.json"; exit 1; }
[ -f "$ROOT_DIR/backend/wrangler.toml" ] || { echo "錯誤：缺少 backend/wrangler.toml"; exit 1; }
[ ! -f "$ROOT_DIR/backend/.dev.vars" ] || echo "提醒：偵測到本機 .dev.vars；打包工具會自動排除。"

echo "Node.js：$(node --version)"
echo "npm：$(npm --version)"
echo "本機環境基本檢查通過。"

