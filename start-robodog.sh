#!/usr/bin/env bash
# One-click start for macOS/Linux. ROBODOG_SIMULATION=true ./start-robodog.sh for fake data.
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node.js 20+ from https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install
[ -d shared/dist ] || npm run build -w shared
ROBODOG_SIMULATION="${ROBODOG_SIMULATION:-false}" npm run dev -w server &
npm run dev -w web -- --host &
sleep 6
echo "Dashboard: http://localhost:5173  |  Phone Settings > Server URL: http://$(hostname -I 2>/dev/null | awk '{print $1}' || ipconfig getifaddr en0):8080"
wait
