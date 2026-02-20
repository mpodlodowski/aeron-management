# Aeron Management Server

Spring Boot application that aggregates metrics from all agents, serves the React UI, and exposes a REST/WebSocket API.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8080` | HTTP port for UI and REST API (standard Spring Boot) |
| `AERON_MANAGEMENT_SERVER_HOST` | `0.0.0.0` | Bind address (also sets Spring `server.address`) |
| `AERON_MANAGEMENT_SERVER_PORT` | `8081` | gRPC port for agent connections |
| `AERON_MANAGEMENT_SERVER_METRICS_HISTORY_SECONDS` | `300` | Rolling metrics window duration (seconds) |
