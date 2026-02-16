# Aeron Management Center

Web-based monitoring and administration dashboard for [Aeron Cluster](https://aeron.io/).

## What It Does

- **Live cluster overview** — node roles, commit positions, elections, traffic rates, all updating in real time
- **Cluster state awareness** — see at a glance if the cluster is active, suspended, snapshotting, or shutting down
- **One-click admin** — Snapshot, Suspend, Resume, Shutdown directly from the dashboard, automatically routed to the leader
- **Archive browser** — paginated recordings table with type filtering, per-recording actions (verify, invalidate), and bulk operations (compact, delete orphaned segments)
- **Disk forecasting** — growth rate tracking with time-to-full predictions per node
- **Backup node monitoring** — dedicated view for ClusterBackup agents
- **Native image agents** — optional GraalVM native compilation for ~20MB sidecar footprint

## Architecture

```
  React UI  <--- WebSocket/REST --->  Spring Boot Server  <--- gRPC --->  Agent sidecars
                                                                              |
                                                                         Aeron Nodes
```

Each agent is a lightweight sidecar sharing IPC with its Aeron node. It reads CnC counters and the archive catalog directly, streams metrics to the server over gRPC, and executes ClusterTool/ArchiveTool commands on demand.

## Quick Start

```bash
docker compose -f examples/docker/docker-compose.full-system.yml up --build
```

Open **http://localhost:8080**.

## Tech Stack

| | |
|-|-|
| **Agent** | Java 17, Aeron 1.50.1, gRPC, Protobuf (optional: GraalVM native image) |
| **Server** | Spring Boot 3, gRPC, STOMP WebSocket |
| **UI** | React 18, TypeScript, Tailwind CSS, Zustand, Recharts |
| **CI/CD** | GitHub Actions, Docker Buildx, ghcr.io |

## Configuration

### Agent

| Variable | Default | Description |
|----------|---------|-------------|
| `MANAGEMENT_SERVER_HOST` | `localhost` | Management server hostname |
| `MANAGEMENT_SERVER_PORT` | `8081` | Management server gRPC port |
| `CLUSTER_DIR` | `aeron-cluster/cluster` | Path to the cluster directory (contains `cluster-mark.dat`) |
| `METRICS_INTERVAL_MS` | `1000` | Metrics collection interval in ms |
| `AGENT_ID` | Random UUID prefix | Unique identifier for this agent |
| `CNC_FAILURE_TIMEOUT_MS` | `2000` | Timeout before exiting when CnC file is inaccessible |
| `AGENT_NODE_ID` | Auto-discovered | Override node ID from cluster-mark.dat |
| `AERON_DIR` | Auto-discovered | Override Aeron directory from cluster-mark.dat |
| `AGENT_MODE` | Auto-discovered | Override agent mode (`cluster` or `backup`) |

The agent exposes a health endpoint on port `7070`.

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8080` | HTTP port for UI and REST API |
| `GRPC_SERVER_PORT` | `8081` | gRPC port for agent connections |
| `MANAGEMENT_METRICS_HISTORY_SECONDS` | `300` | Rolling metrics window duration (seconds) |

## License

[AGPL-3.0](LICENSE)
