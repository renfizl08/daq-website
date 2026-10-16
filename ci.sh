#!/usr/bin/env bash
# Pull the latest code and rebuild the production containers.
set -euo pipefail

cd ~/daq-website
git pull --ff-only
docker compose -f docker-compose.prod.yml up --build -d
