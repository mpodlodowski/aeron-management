#!/usr/bin/env bash
set -e

./gradlew build
docker compose -f docker/docker-compose.full-system.yml up --build -d
