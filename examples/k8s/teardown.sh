#!/usr/bin/env bash
set -euo pipefail
kind delete cluster --name aeron-demo
echo "Cluster deleted."
