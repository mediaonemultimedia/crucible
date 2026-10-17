#!/bin/sh
# The piece is a single self-contained file; the release copy is src/index.html verbatim.
# Usage (from a checkout of tusche-release): sh path/to/build.sh <out-dir>
set -e
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$1"
cp "$here/src/index.html" "$1/index.html"
echo "wrote $1/index.html ($(wc -c < "$1/index.html") bytes)"
