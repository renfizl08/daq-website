#!/usr/bin/env bash
# Pull the latest code and rebuild the production containers.
set -euo pipefail

cd ~/daq-website
before=$(git rev-parse HEAD)
git pull --ff-only
# Nothing new: skip the rebuild so frequent cron runs stay cheap.
[ "$(git rev-parse HEAD)" = "$before" ] && exit 0
docker compose -f docker-compose.prod.yml up --build -d
