#!/bin/sh
# Builds the native click engine as a universal (Apple Silicon + Intel) binary.
# Needs the Xcode Command Line Tools: xcode-select --install
set -eu
cd "$(dirname "$0")"
mkdir -p build
clang -O2 -Wall -Wextra -fobjc-arc \
  -mmacosx-version-min=13.0 -arch arm64 -arch x86_64 \
  -framework ApplicationServices -framework Foundation \
  -o build/clicker clicker.m
