#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ "$#" -eq 0 ]; then
  set -- --run ./my-family.sqlite
fi
python3 -m kosodate gui "$@"
