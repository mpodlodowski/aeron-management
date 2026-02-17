#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/examples/docker/docker-compose.native.yml"

export CLUSTER_IMAGE="${CLUSTER_IMAGE:-}"
export SERVER_IMAGE="${SERVER_IMAGE:-}"
export AGENT_NATIVE_IMAGE="${AGENT_NATIVE_IMAGE:-}"

cleanup() {
  echo "Tearing down Docker Compose..."
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

if [ -z "$CLUSTER_IMAGE" ] || [ -z "$SERVER_IMAGE" ] || [ -z "$AGENT_NATIVE_IMAGE" ]; then
  echo "Building images from source..."
  # Build one representative service per unique image to avoid parallel buildx conflicts
  docker compose -f "$COMPOSE_FILE" build node0 management-server agent-0
fi

echo "Starting full-system (native agents)..."
docker compose -f "$COMPOSE_FILE" up -d

export SERVER_URL="http://localhost:8080"
"$SCRIPT_DIR/../e2e-test.sh"
