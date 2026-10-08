#!/bin/bash
# Production startup script for AI Council Backend
# Usage: ./start.sh [dev|prod]
#   dev  - development mode with auto-reload (default)
#   prod - production mode with multiple workers

set -euo pipefail

MODE="${1:-dev}"

# Default configuration
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
WORKERS="${WORKERS:-4}"
LOG_LEVEL="${LOG_LEVEL:-info}"

case "$MODE" in
    prod)
        echo "Starting AI Council Backend in PRODUCTION mode..."
        echo "Host: $HOST, Port: $PORT, Workers: $WORKERS"
        exec uvicorn main:app \
            --host "$HOST" \
            --port "$PORT" \
            --workers "$WORKERS" \
            --log-level "$LOG_LEVEL" \
            --access-log \
            --no-use-colors
        ;;
    dev|*)
        echo "Starting AI Council Backend in DEVELOPMENT mode..."
        echo "Host: $HOST, Port: $PORT"
        exec uvicorn main:app \
            --host "$HOST" \
            --port "$PORT" \
            --reload \
            --log-level "debug" \
            --access-log
        ;;
esac