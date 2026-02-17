# Docker Compose Examples

All examples use multi-stage builds — no pre-built images required, just `docker compose up --build`.

## Full System

3-node Aeron cluster + backup node + management center with JVM agents.

```bash
docker compose -f docker-compose.full-system.yml up --build
```

Open http://localhost:8080.

## Native Agents

Same as full system but agents are compiled to GraalVM native images. Faster startup, lower memory.

```bash
docker compose -f docker-compose.native.yml up --build
```

## Big Cluster

5-node cluster (no backup) for testing at scale.

```bash
docker compose -f docker-compose.big-cluster.yml up --build
```

## Management Only

Starts only the management server and agents. Expects a cluster already running with pre-created volumes — useful during development when you want to rebuild management without restarting the cluster.

```bash
docker compose -f docker-compose.management.yml up --build
```
