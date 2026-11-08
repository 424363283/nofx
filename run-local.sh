#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .local-run
case "${1:-start}" in
  start)
    for service in backend frontend radar; do
      pidfile=".local-run/$service.pid"
      if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
        echo "$service already running"
        continue
      fi
      if [ "$service" = radar ]; then go build -o .local-run/market-radar ./cmd/market-radar; fi
      python3 - "$service" <<'START'
import subprocess, sys
from pathlib import Path
service = sys.argv[1]
command = ['./guanlan'] if service == 'backend' else (['./.local-run/market-radar'] if service == 'radar' else ['./node_modules/.bin/vite', '--host', '127.0.0.1', '--port', '3001', '--strictPort'])
with Path(f'.local-run/{service}.log').open('ab') as log:
    proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True, cwd='web' if service == 'frontend' else '.')
Path(f'.local-run/{service}.pid').write_text(str(proc.pid) + '\n')
print(f'{service} started (PID {proc.pid})')
START
    done
    echo "Open http://127.0.0.1:3001"
    ;;
  stop)
    for service in radar frontend backend; do
      pidfile=".local-run/$service.pid"
      if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile")
        command=$(ps -p "$pid" -o command= 2>/dev/null || true)
        if [[ "$command" == *guanlan* || "$command" == *vite* || "$command" == *market-radar* ]]; then kill "$pid" 2>/dev/null || true; fi
        rm "$pidfile"
      fi
    done
    ;;
  status)
    curl --fail --silent http://127.0.0.1:8081/api/health
    echo
    curl --fail --silent --output /dev/null --write-out 'Frontend HTTP %{http_code}\n' http://127.0.0.1:3001
    curl --fail --silent --output /dev/null --write-out 'Radar HTTP %{http_code}\n' http://127.0.0.1:8082/api/market/radar
    ;;
  *) echo "Usage: $0 [start|stop|status]"; exit 1 ;;
esac
