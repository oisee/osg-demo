#!/usr/bin/env bash
# Chapter 18: rebuild iti/mandel.wasm and src/iti/zcl_wasm_mandel.clas.abap
# from iti/mandel.c.
#   ABAPITI=<abapiti checkout at the commit below> bash iti/build.sh
# Needs clang with the wasm32 target and wasm-ld, and Go for abapiti. The
# chapter was built with abapiti 3e92daf and clang 18.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
: "${ABAPITI:?set ABAPITI to an abapiti checkout}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
clang --target=wasm32 -O2 -nostdlib -Wl,--no-entry -Wl,--export=mandel \
  -o "$here/mandel.wasm" "$here/mandel.c"
(cd "$ABAPITI" && go build -o "$tmp/abapiti" ./cmd/abapiti)
"$tmp/abapiti" compile wasm "$here/mandel.wasm" -o "$tmp/out"
cp "$tmp/out/zcl_wasm_mandel.clas.abap" "$here/../src/iti/"
