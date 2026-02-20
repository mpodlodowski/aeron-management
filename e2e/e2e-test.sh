#!/usr/bin/env bash
set -euo pipefail

# E2E test script for Aeron Management Center.
# Platform-agnostic: tests via REST API only.
# Requires: curl, jq
# Usage: SERVER_URL=http://localhost:8080 ./e2e-test.sh

SERVER_URL="${SERVER_URL:?SERVER_URL env var required (e.g. http://localhost:8080)}"
CLUSTER_ID="${CLUSTER_ID:-default}"
PASS=0
FAIL=0

log() { echo "[$(date +%H:%M:%S)] $*"; }

wait_for() {
  local description="$1" timeout="$2" check_cmd="$3"
  local elapsed=0
  log "WAIT: $description (timeout ${timeout}s)..."
  while ! eval "$check_cmd" >/dev/null 2>&1; do
    sleep 3
    elapsed=$((elapsed + 3))
    if [ "$elapsed" -ge "$timeout" ]; then
      log "FAIL: $description (timed out after ${timeout}s)"
      FAIL=$((FAIL + 1))
      return 1
    fi
  done
  log "PASS: $description (${elapsed}s)"
  PASS=$((PASS + 1))
}

assert() {
  local description="$1" check_cmd="$2"
  if eval "$check_cmd" >/dev/null 2>&1; then
    log "PASS: $description"
    PASS=$((PASS + 1))
  else
    log "FAIL: $description"
    FAIL=$((FAIL + 1))
    return 1
  fi
}

# --- Test sequence ---

# 1. Wait for server to respond
wait_for "Server responds" 60 \
  "curl -sf ${SERVER_URL}/api/clusters"

# 2. Wait for leader to be elected
wait_for "Leader elected" 90 \
  "curl -sf ${SERVER_URL}/api/clusters/${CLUSTER_ID} | jq -e '.leaderNodeId != null and .leaderNodeId >= 0'"

# 3. Wait for 3 cluster nodes reporting
wait_for "3 cluster nodes reporting" 60 \
  "[ \$(curl -sf ${SERVER_URL}/api/clusters/${CLUSTER_ID}/nodes | jq '[.[] | select(.agentMode != \"backup\")] | length') -ge 3 ]"

# 4. Wait for backup node reporting
wait_for "Backup node reporting" 90 \
  "curl -sf ${SERVER_URL}/api/clusters/${CLUSTER_ID}/nodes | jq -e '[.[] | select(.agentMode == \"backup\")] | length > 0'"

# 5. Assert metrics are flowing (commit position advancing)
assert "Metrics flowing (commit position > 0)" \
  "curl -sf ${SERVER_URL}/api/clusters/${CLUSTER_ID} | jq -e '.clusterStats.commitPosition > 0'"

# 6. Assert snapshot command works
assert "Snapshot command succeeds" \
  "curl -sf -X POST ${SERVER_URL}/api/clusters/${CLUSTER_ID}/snapshot | jq -e '.success == true'"

# --- Summary ---
echo ""
log "========================================="
log "Results: ${PASS} passed, ${FAIL} failed"
log "========================================="

[ "$FAIL" -eq 0 ] || exit 1
