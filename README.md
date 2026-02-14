# Aeron Management Center

A web-based management and monitoring tool for Aeron Cluster, inspired by Hazelcast Management Center. Provides real-time cluster health visualization, counter metrics, archive recordings, and admin commands through a React dashboard.

## Architecture

```
+------------------+     WebSocket/REST      +------------------+
|   React UI       | <--------------------> |  Spring Boot     |
|   (Dashboard)    |                         |  Server          |
+------------------+                         +--------+---------+
                                                      |
                                              gRPC (bidirectional)
                                                      |
                    +------------------+------------------+
                    |                  |                  |
              +-----+-----+    +------+----+    +--------+--+
              |  Agent 0  |    |  Agent 1  |    |  Agent 2  |
              |  (sidecar)|    |  (sidecar)|    |  (sidecar)|
              +-----+-----+    +------+----+    +--------+--+
                    |                  |                  |
              +-----+-----+    +------+----+    +--------+--+
              |  Node 0   |    |  Node 1   |    |  Node 2   |
              |  (Aeron)  |    |  (Aeron)  |    |  (Aeron)  |
              +-----------+    +-----------+    +------------+
```

**Modules:**

| Module   | Description |
|----------|-------------|
| `common` | Protobuf/gRPC service definitions shared between agent and server |
| `agent`  | Lightweight sidecar that reads CnC counters, archive recordings, and executes admin commands (ClusterTool). Connects to server via gRPC bidirectional streaming |
| `server` | Spring Boot application that aggregates agent metrics and serves the REST/WebSocket API for the UI |
| `ui`     | React + TypeScript dashboard with real-time cluster visualization |

## Prerequisites

- Java 17+
- Node.js 20+ (for UI development)
- Docker & Docker Compose
- Access to `REMOVED` registry (for cluster images)

## Quick Start (Full System)

Build the management components and start the full system (3-node cluster + backup + management):

```bash
# Build all modules
./gradlew build

# Start the full system
docker compose -f docker/docker-compose.full-system.yml up --build
```

This starts:
- **3 Aeron cluster nodes** (node0, node1, node2) — Raft consensus cluster
- **Aeron backup** — cluster backup client
- **Aeron snapshot** — periodic snapshot service
- **Management server** — accessible at http://localhost:8080
- **3 management agents** — one per cluster node, sharing IPC namespace for CnC file access

## Development

### Build

```bash
# Build everything (Java modules + UI)
./gradlew build

# Build specific modules
./gradlew :agent:shadowJar    # Agent fat JAR
./gradlew :server:bootJar     # Server Spring Boot JAR
./gradlew :ui:npm_run_build   # UI production bundle
```

### Run Management Components Only

If the cluster is already running and volumes are available:

```bash
docker compose -f docker/docker-compose.management.yml up --build
```

### Run Server Locally

```bash
./gradlew :server:bootRun
```

Server will be available at http://localhost:8080 with gRPC on port 8081.

### Run Agent Locally

```bash
MANAGEMENT_SERVER_HOST=localhost \
MANAGEMENT_SERVER_PORT=8081 \
AERON_DIR=/dev/shm \
CLUSTER_DIR=/path/to/aeron-cluster/cluster \
AGENT_NODE_ID=0 \
./gradlew :agent:run
```

### UI Development

```bash
cd ui
npm install
npm run dev     # Vite dev server at http://localhost:5173
```

## Agent Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MANAGEMENT_SERVER_HOST` | `localhost` | gRPC server hostname |
| `MANAGEMENT_SERVER_PORT` | `8081` | gRPC server port |
| `AERON_DIR` | `/dev/shm/aeron` | Path to Aeron media driver directory (CnC file) |
| `CLUSTER_DIR` | `aeron-cluster/cluster` | Path to cluster consensus directory |
| `AGENT_NODE_ID` | `0` | Node ID this agent monitors |
| `AGENT_MODE` | `cluster` | Agent mode: `cluster` or `backup` |
| `METRICS_INTERVAL_MS` | `1000` | Metrics collection interval in milliseconds |

## Admin Commands

The management center exposes ClusterTool operations through the UI:

| Command | Description |
|---------|-------------|
| Snapshot | Trigger a cluster snapshot |
| Suspend | Suspend cluster processing |
| Resume | Resume suspended cluster |
| Shutdown | Graceful cluster node shutdown |

## How Agent-Node IPC Works

Each management agent runs as a sidecar container sharing the IPC namespace (`ipc: service:nodeX`) with its cluster node. This gives the agent read access to `/dev/shm` where the Aeron CnC (Command and Control) file resides. The agent uses `CountersReader` to read all Aeron counters and extract cluster-specific metrics (node role, commit position, election state, client count).

The cluster data directory is shared via a Docker named volume mounted read-only in the agent, allowing ClusterTool admin commands to operate on the consensus log.
