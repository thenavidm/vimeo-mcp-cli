#!/usr/bin/env sh
# Build and run vimeo-mcp from source, for people who would rather not use npx.
set -eu

command -v node >/dev/null 2>&1 || { echo "Node 22 or newer is required."; exit 1; }

MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$MAJOR" -ge 22 ] || { echo "Node 22 or newer is required. Found $(node -v)."; exit 1; }

npm install
npm run build

echo ""
echo "Built. Point your MCP client at:"
echo "  node $(pwd)/dist/index.js"
echo ""
echo "Then check the setup:"
echo "  VIMEO_PAT=your_token node $(pwd)/dist/index.js doctor"
