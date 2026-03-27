#!/usr/bin/env bash
# BetOnMe — Build .deb + AppImage
# Run this from your project root: bash build-deb.sh
set -e

echo "🔒 BetOnMe build script"
echo "========================"

# 1. Check Rust
if ! command -v cargo &>/dev/null; then
  echo "Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi
echo "✓ Rust $(rustc --version)"

# 2. Check Tauri CLI
if ! command -v cargo-tauri &>/dev/null; then
  echo "Installing tauri-cli..."
  cargo install tauri-cli --version "^2"
fi
echo "✓ $(cargo tauri --version)"

# 3. Check Linux build deps
echo "Checking Linux dependencies..."
MISSING=()
for pkg in libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev; do
  if ! dpkg -s "$pkg" &>/dev/null; then
    MISSING+=("$pkg")
  fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "Installing missing deps: ${MISSING[*]}"
  sudo apt-get update -qq
  sudo apt-get install -y "${MISSING[@]}"
fi
echo "✓ System dependencies OK"

# 4. Install JS deps
echo "Installing JS dependencies..."
pnpm install --frozen-lockfile

# 5. Build frontend
echo "Building Vite frontend..."
pnpm build

# 6. Build Tauri .deb + AppImage
echo "Building Tauri bundle (this takes ~3-5 min first time)..."
cargo tauri build --bundles deb appimage

# 7. Show output
echo ""
echo "✅ Build complete! Output:"
find src-tauri/target/release/bundle -name "*.deb" -o -name "*.AppImage" 2>/dev/null | while read f; do
  echo "   $f ($(du -h "$f" | cut -f1))"
done

echo ""
echo "Install .deb:      sudo dpkg -i src-tauri/target/release/bundle/deb/*.deb"
echo "Run AppImage:      chmod +x *.AppImage && ./*.AppImage"
