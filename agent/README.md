# Aeron Management Agent

Lightweight sidecar that runs alongside each Aeron node. It reads CnC counters and the archive catalog via shared memory, streams metrics to the management server over gRPC, and executes ClusterTool/ArchiveTool commands on demand.

Optionally compiled to a GraalVM native image for ~20 MB footprint and instant startup.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AERON_MANAGEMENT_SERVER_HOST` | `localhost` | Management server hostname |
| `AERON_MANAGEMENT_SERVER_PORT` | `8081` | Management server gRPC port |
| `AERON_MANAGEMENT_AGENT_CLUSTER_DIR` | `user.home` | Cluster directory path, template, or base directory (see below) |
| `AERON_MANAGEMENT_AGENT_METRICS_INTERVAL_MS` | `1000` | Metrics collection interval in ms |
| `AERON_MANAGEMENT_AGENT_ID` | Random UUID prefix | Unique identifier for this agent |
| `AERON_MANAGEMENT_AGENT_CNC_FAILURE_TIMEOUT_MS` | `2000` | Timeout before exiting when CnC file is inaccessible |

Node ID, Aeron directory, and agent mode are auto-discovered from `cluster-mark.dat`.

### Cluster Directory Resolution

`AERON_MANAGEMENT_AGENT_CLUSTER_DIR` supports three modes:

**Explicit path** (contains `cluster-mark.dat`):
```
AERON_MANAGEMENT_AGENT_CLUSTER_DIR=/home/aeron/aeron-cluster/aeron-cluster-0/cluster
```

**Template** (uses `{node_id}` placeholder, resolved from `NODE_ID` env, `POD_NAME`, or `HOSTNAME` ordinal):
```
AERON_MANAGEMENT_AGENT_CLUSTER_DIR=/home/aeron/aeron-cluster/aeron-cluster-{node_id}/cluster
```

**Base directory** (scans for a single `cluster-mark.dat`):
```
AERON_MANAGEMENT_AGENT_CLUSTER_DIR=/home/aeron/aeron-cluster
```

## Health Endpoint

The agent exposes a health check on port `7070`.
