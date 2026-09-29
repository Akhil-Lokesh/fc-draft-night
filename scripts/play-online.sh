#!/usr/bin/env bash
# Host a draft night for friends anywhere: builds the app, starts the game server (which serves the
# build + socket.io on one port), and opens a public https link with a Cloudflare quick tunnel.
#
# Voice chat for friends on mobile data / strict routers needs a TURN relay. Put its details in
# .env.turn at the repo root (not committed), e.g.:
#   TURN_URLS=turn:global.relay.metered.ca:80,turns:global.relay.metered.ca:443?transport=tcp
#   TURN_USERNAME=...
#   TURN_CREDENTIAL=...
#
# Usage: scripts/play-online.sh      (Ctrl+C stops everything)
set -euo pipefail
cd "$(dirname "$0")/.."

command -v cloudflared >/dev/null || { echo "Install cloudflared first: brew install cloudflared"; exit 1; }
[ -f .env.turn ] && { set -a; . ./.env.turn; set +a; echo "TURN relay: on"; } || echo "TURN relay: off (voice may fail for friends on mobile data — see .env.turn above)"

pnpm --filter ./packages/web exec vite build >/dev/null
echo "Built the web app."

( cd packages/server && PORT="${PORT:-8080}" exec npx tsx src/server.ts ) &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 2

echo "Starting the public link — share the https://….trycloudflare.com address it prints:"
cloudflared tunnel --no-autoupdate --url "http://localhost:${PORT:-8080}"
