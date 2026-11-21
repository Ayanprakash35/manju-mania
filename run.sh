#!/bin/bash
# Start the walkthrough: serves this folder and opens it in your browser.
#   ./run.sh                 play
#   ./run.sh convert <obj>   rebuild public/building.glb from a new Shapr3D OBJ export
cd "$(dirname "$0")"
if [ "$1" = "convert" ]; then node tools/convert.mjs "$2" public/building.glb; exit; fi
[ -d node_modules/three ] || npm install --no-audit --no-fund
PORT=${PORT:-8080}
# If an older copy of this game's server is still holding the port, stop it.
for pid in $(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null); do
  if [ "$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | tail -1)" = "n$PWD" ]; then kill "$pid"; sleep 0.5
  else echo "Port $PORT is used by another program. Try: PORT=8090 ./run.sh"; exit 1; fi
done
(sleep 1; open "http://localhost:$PORT") &
echo "Building walkthrough at http://localhost:$PORT  (Ctrl+C to stop)"
exec python3 tools/serve.py "$PORT"
