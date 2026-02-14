# Aeron Management Center

Web-based monitoring and administration dashboard for [Aeron Cluster](https://aeron.io/). Think Hazelcast Management Center, but for Aeron.

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
./gradlew build
docker compose -f docker/docker-compose.full-system.yml up --build
```

Open **http://localhost:8080**.

## Tech Stack

| | |
|-|-|
| **Agent** | Java 17, Aeron 1.46.5, gRPC, SBE (optional: GraalVM native image) |
| **Server** | Spring Boot, gRPC, STOMP WebSocket |
| **UI** | React, TypeScript, Tailwind CSS, Zustand, Recharts |

## License

[AGPL-3.0](LICENSE)
