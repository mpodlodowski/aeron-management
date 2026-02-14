#!/usr/bin/env bash
set -e

./gradlew build
docker compose -f docker/docker-compose.native.yml up --build -d
