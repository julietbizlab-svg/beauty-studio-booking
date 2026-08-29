#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

"$ROOT_DIR/product-kit/bin/check-system.sh"
cd "$ROOT_DIR/backend"
npm ci
npm test

echo "本機安裝與測試完成。"
echo "此指令沒有部署、沒有寫入遠端 D1，也沒有設定任何 secret。"

