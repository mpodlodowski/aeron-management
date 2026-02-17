# Go Server Rewrite Design

## Goal

Replace the Spring Boot server module with a Go server to reduce image size (~300MB → ~20MB), startup time (~3-5s → <10ms), and memory usage (~150MB → ~15MB), while exploring Go as a new technology.

## Context

The server has zero Aeron dependencies. It is a thin coordination layer:
- gRPC server accepting bidirectional streams from agents
- REST API for the React UI
- WebSocket (STOMP) pushing real-time metrics to the UI
- In-memory aggregation of cluster state, disk tracking, event history

13 Java source files, no database, no Spring Security, no Spring Data. The agent module (Java, Aeron on classpath) stays unchanged.

## Architecture

### Module Layout

```
server/
├── go.mod
├── go.sum
├── main.go                     # entry point, manual wiring
├── Dockerfile
├── proto/                      # generated Go stubs (committed)
│   └── agentpb/
│       ├── agent_service.pb.go
│       └── agent_service_grpc.pb.go
├── grpc/
│   ├── agent_service.go        # gRPC service impl (AgentConnectionService)
│   └── registry.go             # agent registry (AgentRegistry)
├── api/
│   ├── cluster.go              # cluster REST handlers (ClusterController)
│   ├── node.go                 # node REST handlers (NodeController)
│   └── sse.go                  # SSE broker (replaces STOMP/WebSocket)
├── aggregator/
│   ├── cluster_state.go        # metrics aggregation (ClusterStateAggregator)
│   ├── disk_tracker.go         # disk growth tracking (DiskUsageTracker)
│   └── metrics_window.go       # rolling window (MetricsWindow)
├── command/
│   └── router.go               # command routing (CommandRouter)
└── config/
    └── config.go               # env-based configuration
```

### Key Technology Choices

- **chi** router — lightweight, stdlib-compatible
- **google.golang.org/grpc** — gRPC server
- **`//go:embed`** — embed UI dist into single binary
- **SSE** — replaces STOMP/WebSocket for metrics push
- **Env vars** — configuration (no config files)
- **`FROM scratch`** — Docker image

### gRPC Layer

- Same `AgentService.Connect()` bidirectional stream protocol
- `grpc/registry.go`: `sync.RWMutex`-protected `map[int32]*AgentConnection`
- `grpc/agent_service.go`: `for { stream.Recv() }` loop per agent goroutine
  - `AgentRegistration` → register in registry
  - `MetricsReport` → pass to aggregator
  - `CommandResult` → resolve pending command via channel
  - Stream error/EOF → deregister, notify aggregator

### Command Routing

- `sync.Map` of `commandId → chan *CommandResult`
- `SendCommand(nodeId, commandType)`: create UUID, register channel, send via agent stream, `select` with 30s timeout
- Channels replace `CompletableFuture`

### REST API

Same paths as current Spring controllers:

```
GET  /api/cluster/overview
GET  /api/cluster/events
POST /api/cluster/snapshot
POST /api/cluster/suspend
POST /api/cluster/resume
POST /api/cluster/shutdown
POST /api/cluster/abort
GET  /api/cluster/recordings

GET  /api/nodes/{id}
POST /api/nodes/{id}/snapshot
POST /api/nodes/{id}/suspend
POST /api/nodes/{id}/resume
POST /api/nodes/{id}/shutdown
POST /api/nodes/{id}/abort
POST /api/nodes/{id}/archive/verify
POST /api/nodes/{id}/archive/compact
POST /api/nodes/{id}/archive/mark-invalid/{recordingId}
POST /api/nodes/{id}/archive/mark-valid/{recordingId}
POST /api/nodes/{id}/archive/delete-orphaned
```

JSON via `protojson` for proto messages, `encoding/json` for the rest.

### SSE (Replaces STOMP/WebSocket)

- Single endpoint: `GET /api/events`
- Broker goroutine fans out events to all subscribers
- Three event types: `cluster`, `nodes`, `alerts`
- Disconnect detected via `r.Context().Done()`
- UI dispatches by `event.type`

### SPA Serving

- `//go:embed ui/dist/*` embeds the UI build
- Serve static files at `/`
- Fallback to `index.html` for client-side routes (`/nodes/**`, `/archive`)
- Single binary = server + UI

### Configuration

Environment variables only:
- `HTTP_PORT` (default: 8080)
- `GRPC_PORT` (default: 8081)
- `METRICS_WINDOW` (default: 300s)

## Docker

```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /build
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM scratch
COPY --from=builder /build/server /server
EXPOSE 8080 8081
ENTRYPOINT ["/server"]
```

Image size: ~20-25MB. Multi-arch via `docker buildx` with `GOARCH` build arg.

## Proto Generation

- `protoc` with `protoc-gen-go` + `protoc-gen-go-grpc`
- Source: `../common/src/main/proto/agent_service.proto`
- Output: `server/proto/agentpb/`
- Generated files committed (standard Go convention)

## UI Changes

- Replace `useWebSocket.ts` → `useSSE.ts`
- `EventSource` connects to `/api/events`, dispatches by `event.type`
- Remove `@stomp/stompjs` and `sockjs-client` dependencies

## What Does NOT Change

- `agent/` module (Java, unchanged)
- `common/` module (still exists for agent proto stubs)
- `agent_service.proto` (the gRPC contract)
- REST API paths (UI REST calls unchanged)
- All functionality (metrics, commands, alerts, recordings, disk tracking)

## Footprint Comparison

| Metric | Spring Boot | Go |
|--------|------------|-----|
| Docker image | ~300MB | ~20-25MB |
| Startup | ~3-5s | <10ms |
| Memory (RSS) | ~150-200MB | 10-20MB |
| Build time | ~30s | ~5s |
