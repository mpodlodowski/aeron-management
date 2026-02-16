#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLUSTER_NAME="aeron-demo"

echo "=== Aeron Management Center — Kubernetes Demo ==="
echo ""

# Check prerequisites
for cmd in kind kubectl docker; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "ERROR: '$cmd' is required but not installed."
        exit 1
    fi
done

# Build management JARs
echo "--- Building management JARs ---"
"$PROJECT_DIR/gradlew" -p "$PROJECT_DIR" :agent:shadowJar :server:bootJar --quiet

# Build Docker images
echo "--- Building Docker images ---"
docker build -t aeron-cluster-demo:local "$SCRIPT_DIR/cluster-image/"
docker build -t aeron-management-agent:local -f "$PROJECT_DIR/docker/Dockerfile.agent" "$PROJECT_DIR"
docker build -t aeron-management-server:local -f "$PROJECT_DIR/docker/Dockerfile.server" "$PROJECT_DIR"

# Create kind cluster (delete if exists)
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
    echo "--- Deleting existing kind cluster ---"
    kind delete cluster --name "$CLUSTER_NAME"
fi
echo "--- Creating kind cluster ---"
kind create cluster --name "$CLUSTER_NAME" --config "$SCRIPT_DIR/kind-config.yaml"

# Load images into kind
echo "--- Loading images into kind ---"
kind load docker-image aeron-cluster-demo:local --name "$CLUSTER_NAME"
kind load docker-image aeron-management-agent:local --name "$CLUSTER_NAME"
kind load docker-image aeron-management-server:local --name "$CLUSTER_NAME"

# Apply manifests
echo "--- Deploying to Kubernetes ---"
kubectl apply -f "$SCRIPT_DIR/manifests/"

# Wait for pods
echo "--- Waiting for pods to be ready ---"
kubectl -n aeron-demo wait --for=condition=Ready pod -l app=management-server --timeout=120s
kubectl -n aeron-demo wait --for=condition=Ready pod -l app=aeron-cluster --timeout=120s

echo ""
echo "=== Aeron Management Center is running ==="
echo ""
echo "  UI:  http://localhost:8080"
echo ""
echo "  Useful commands:"
echo "    kubectl -n aeron-demo get pods"
echo "    kubectl -n aeron-demo logs node-0 -c cluster-node"
echo "    kubectl -n aeron-demo logs node-0 -c agent"
echo ""
echo "  Tear down:  $SCRIPT_DIR/teardown.sh"
