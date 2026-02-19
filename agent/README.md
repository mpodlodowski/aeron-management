# Aeron Management Agent

Lightweight sidecar that runs alongside each Aeron node. It reads CnC counters and the archive catalog via shared memory, streams metrics to the management server over gRPC, and executes ClusterTool/ArchiveTool commands on demand.

Optionally compiled to a GraalVM native image for ~20 MB footprint and instant startup.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AERON_MANAGEMENT_AGENT_SERVER_HOST` | `localhost` | Management server hostname |
| `AERON_MANAGEMENT_AGENT_SERVER_PORT` | `8081` | Management server gRPC port |
| `AERON_MANAGEMENT_AGENT_CLUSTER_DIR` | `aeron-cluster/cluster` | Path to the cluster directory (contains `cluster-mark.dat`) |
| `AERON_MANAGEMENT_AGENT_METRICS_INTERVAL_MS` | `1000` | Metrics collection interval in ms |
| `AERON_MANAGEMENT_AGENT_ID` | Random UUID prefix | Unique identifier for this agent |
| `AERON_MANAGEMENT_AGENT_CNC_FAILURE_TIMEOUT_MS` | `2000` | Timeout before exiting when CnC file is inaccessible |
| `AERON_MANAGEMENT_AGENT_NODE_ID` | Auto-discovered | Override node ID from cluster-mark.dat |
| `AERON_MANAGEMENT_AGENT_AERON_DIR` | Auto-discovered | Override Aeron directory from cluster-mark.dat |
| `AERON_MANAGEMENT_AGENT_MODE` | Auto-discovered | Override agent mode (`cluster` or `backup`) |

## Health Endpoint

The agent exposes a health check on port `7070`.
