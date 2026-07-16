#!/usr/bin/env bash
# Builds the Windows desktop-app bundle: a portable Node runtime + the built
# Next.js standalone server + launcher scripts, zipped up for download.
#
# Required env vars (not read from .env on purpose — pass them explicitly so
# nothing personal ends up cached in a build script):
#   DATABASE_URL, NEXTAUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, SETUP_TOKEN
#
# Usage:
#   DATABASE_URL=... NEXTAUTH_SECRET=... ADMIN_EMAIL=... ADMIN_PASSWORD=... SETUP_TOKEN=... \
#     ./scripts/package-windows.sh /path/to/output-dir

set -euo pipefail

for v in DATABASE_URL NEXTAUTH_SECRET ADMIN_EMAIL ADMIN_PASSWORD SETUP_TOKEN; do
  if [ -z "${!v:-}" ]; then
    echo "Missing required env var: $v" >&2
    exit 1
  fi
done

OUT_DIR="${1:?Usage: $0 <output-dir>}"
NODE_VERSION="v24.18.0"
PORT=47831

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "== Building Next.js standalone bundle =="
cd "$ROOT"
rm -rf .next public/sw.js public/workbox-*.js
DATABASE_URL="$DATABASE_URL" NEXTAUTH_SECRET="$NEXTAUTH_SECRET" npx next build
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next/static
cp -r .next/static/* .next/standalone/.next/static/

echo "== Assembling package =="
PKG="$WORK/Ledger"
mkdir -p "$PKG/node" "$PKG/tools"
cp -r .next/standalone "$PKG/app"
# Windows-only shipping bundle: drop the native engine for whatever platform built it.
find "$PKG/app/node_modules/.prisma/client" -iname "libquery_engine-*" -delete 2>/dev/null || true

if [ ! -f "$WORK/node-win.zip" ]; then
  curl -sS -o "$WORK/node-win.zip" "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip"
fi
unzip -q "$WORK/node-win.zip" -d "$WORK/node-win"
cp "$WORK"/node-win/node-*-win-x64/node.exe "$PKG/node/node.exe"

(cd "$ROOT" && node -e "
const mod = require('png-to-ico');
const pngToIco = typeof mod === 'function' ? mod : mod.default;
pngToIco(['public/icons/icon-192.png', 'public/icons/icon-512.png'])
  .then(buf => require('fs').writeFileSync('$PKG/icon.ico', buf));
")

cp "$ROOT/scripts/windows-bundle/wait-for-server.js" "$PKG/tools/wait-for-server.js"
cp "$ROOT/scripts/windows-bundle/call-setup.js" "$PKG/tools/call-setup.js"
cp "$ROOT/scripts/windows-bundle/port-in-use.js" "$PKG/tools/port-in-use.js"
cp "$ROOT/scripts/windows-bundle/README.txt" "$PKG/README.txt"

sed \
  -e "s#__DATABASE_URL__#${DATABASE_URL}#" \
  -e "s#__NEXTAUTH_SECRET__#${NEXTAUTH_SECRET}#" \
  -e "s#__ADMIN_EMAIL__#${ADMIN_EMAIL}#" \
  -e "s#__ADMIN_PASSWORD__#${ADMIN_PASSWORD}#" \
  -e "s#__SETUP_TOKEN__#${SETUP_TOKEN}#" \
  -e "s#__PORT__#${PORT}#g" \
  "$ROOT/scripts/windows-bundle/Start Ledger.bat.template" > "$PKG/Start Ledger.bat"
cp "$ROOT/scripts/windows-bundle/Stop Ledger.bat" "$PKG/Stop Ledger.bat"
cp "$ROOT/scripts/windows-bundle/Create Desktop Shortcut.bat" "$PKG/Create Desktop Shortcut.bat"

for f in "$PKG/Start Ledger.bat" "$PKG/Stop Ledger.bat" "$PKG/Create Desktop Shortcut.bat"; do
  sed -i 's/$/\r/' "$f"
done

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/Ledger-Windows.zip"
(cd "$WORK" && zip -rq -X "$OUT_DIR/Ledger-Windows.zip" Ledger)

echo "== Done: $OUT_DIR/Ledger-Windows.zip =="
