#!/bin/bash
# 將 customer-ui 與 owner-admin 同步到 docs（GitHub Pages 用）
set -e
cd "$(dirname "$0")/.."

rm -rf docs
mkdir -p docs/owner

cp -R customer-ui/. docs/
cp -R owner-admin/. docs/owner/

echo "✓ docs/ 已同步完成"
echo "  客人端：https://<username>.github.io/beauty-studio-booking/"
echo "  業主端：https://<username>.github.io/beauty-studio-booking/owner/"
