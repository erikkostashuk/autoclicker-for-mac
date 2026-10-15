#!/bin/sh
# Recompresses the DMGs in dist/ with LZMA (needs macOS 10.15+ to open), which
# electron-builder can't do itself. Downloads end up about 25% smaller.
set -eu
for dmg in dist/*.dmg; do
  hdiutil convert -quiet "$dmg" -format ULMO -o "$dmg.lzma.dmg"
  mv "$dmg.lzma.dmg" "$dmg"
done
