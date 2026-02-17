# Aeron Management Server

Spring Boot application that aggregates metrics from all agents, serves the React UI, and exposes a REST/WebSocket API.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8080` | HTTP port for UI and REST API |
| `GRPC_SERVER_PORT` | `8081` | gRPC port for agent connections |
| `MANAGEMENT_METRICS_HISTORY_SECONDS` | `300` | Rolling metrics window duration (seconds) |
