#!/bin/sh
set -eu
# Railway volumes are mounted as root. Initialize ownership, then drop privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR:-/app/data}"
  chown -R node:node "${DATA_DIR:-/app/data}"
  exec gosu node "$@"
fi
exec "$@"
