#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
KIND_CONFIG="$ROOT_DIR/examples/k8s/kind-config.yaml"
MANIFESTS="$ROOT_DIR/examples/k8s/manifests"

CLUSTER_IMAGE="${CLUSTER_IMAGE:-aeron-cluster-demo:local}"
SERVER_IMAGE="${SERVER_IMAGE:-aeron-management-server:local}"
AGENT_IMAGE="${AGENT_IMAGE:-aeron-management-agent:local}"
KIND_CLUSTER_NAME="${KIND_CLUSTER_NAME:-e2e-jvm}"

cleanup() {
  echo "Deleting Kind cluster..."
  kind delete cluster --name "$KIND_CLUSTER_NAME" 2>/dev/null || true
}
trap cleanup EXIT

# Build cluster image if needed (it's never published, always built)
if ! docker image inspect "$CLUSTER_IMAGE" >/dev/null 2>&1; then
  echo "Building cluster image..."
  docker build -t "$CLUSTER_IMAGE" "$ROOT_DIR/examples/k8s/cluster-image"
fi

# Build management images if not pre-built
if ! docker image inspect "$SERVER_IMAGE" >/dev/null 2>&1; then
  echo "Building server image..."
  docker build -f "$ROOT_DIR/examples/docker/Dockerfile.server" -t "$SERVER_IMAGE" "$ROOT_DIR"
fi
if ! docker image inspect "$AGENT_IMAGE" >/dev/null 2>&1; then
  echo "Building agent image..."
  docker build -f "$ROOT_DIR/examples/docker/Dockerfile.agent" -t "$AGENT_IMAGE" "$ROOT_DIR"
fi

echo "Creating Kind cluster..."
kind create cluster --name "$KIND_CLUSTER_NAME" --config "$KIND_CONFIG" --wait 60s

echo "Loading images into Kind..."
kind load docker-image --name "$KIND_CLUSTER_NAME" \
  "$CLUSTER_IMAGE" "$SERVER_IMAGE" "$AGENT_IMAGE"

echo "Applying manifests..."
kubectl apply -f "$MANIFESTS/namespace.yaml"
kubectl apply -f "$MANIFESTS/headless-service.yaml"
kubectl apply -f "$MANIFESTS/management-server.yaml"
kubectl apply -f "$MANIFESTS/node-0.yaml"
kubectl apply -f "$MANIFESTS/node-1.yaml"
kubectl apply -f "$MANIFESTS/node-2.yaml"
kubectl apply -f "$MANIFESTS/backup.yaml"

echo "Waiting for pods to be ready..."
kubectl wait --for=condition=ready pods --all -n aeron-demo --timeout=120s || true

export SERVER_URL="http://localhost:8080"
"$SCRIPT_DIR/../e2e-test.sh"
