# Kubernetes Example

Deploys the full system on a local [kind](https://kind.sigs.k8s.io/) cluster.

## Prerequisites

- [kind](https://kind.sigs.k8s.io/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Docker](https://docs.docker.com/get-docker/)

## Deploy

```bash
./deploy.sh
```

This builds all images, creates a kind cluster, loads images, applies manifests, and waits for pods to be ready. The UI is available at http://localhost:8080.

## Teardown

```bash
./teardown.sh
```

## What Gets Created

- 3-node Aeron cluster (node-0, node-1, node-2) with a backup node
- One management agent per node
- Management server with the React UI
- NodePort service mapping port 30080 to 8080
