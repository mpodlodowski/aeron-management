# Aeron Management Server

Spring Boot application that aggregates metrics from all agents, serves the React UI, and exposes a REST/WebSocket API.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8080` | HTTP port for UI and REST API (standard Spring Boot) |
| `AERON_MANAGEMENT_SERVER_HOST` | `0.0.0.0` | Bind address (also sets Spring `server.address`) |
| `AERON_MANAGEMENT_SERVER_PORT` | `8081` | gRPC port for agent connections |
| `AERON_MANAGEMENT_SERVER_METRICS_HISTORY_SECONDS` | `300` | Rolling metrics window duration (seconds) |

### Authentication

Authentication is disabled by default. To enable HTTP Basic auth:

| Variable | Default | Description |
|----------|---------|-------------|
| `AERON_MANAGEMENT_SERVER_AUTH_TYPE` | `none` | Auth type: `none` or `basic` |
| `AERON_MANAGEMENT_SERVER_AUTH_BASIC_USERNAME` | | Username (required when type is `basic`) |
| `AERON_MANAGEMENT_SERVER_AUTH_BASIC_PASSWORD` | | Password (required when type is `basic`) |

When `type=basic`, the server protects all endpoints (REST API, WebSocket, UI). The browser shows a native login dialog. The gRPC port (agent connections) is not affected.

### Multi-Cluster

The server supports multiple clusters out of the box with no extra configuration. Each agent reports its cluster ID (set via `AERON_MANAGEMENT_CLUSTER_ID`), and the server automatically groups agents into separate clusters. The UI shows a cluster selector dropdown when more than one cluster is connected. All REST and WebSocket endpoints are scoped by cluster: `/api/clusters/{clusterId}/...`.
