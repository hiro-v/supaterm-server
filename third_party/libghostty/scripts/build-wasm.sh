#!/bin/bash
set -euo pipefail

echo "🔨 Building ghostty-vt.wasm..."

# Check for Zig
if ! command -v zig &> /dev/null; then
    echo "❌ Error: Zig not found"
    echo ""
    echo "Install Zig 0.15.2+:"
    echo "  macOS:   brew install zig"
    echo "  Linux:   https://ziglang.org/download/"
    echo ""
    exit 1
fi

ZIG_VERSION=$(zig version)
echo "✓ Found Zig $ZIG_VERSION"

# Initialize/update submodule
if [ ! -d "ghostty/.git" ]; then
    echo "📦 Initializing Ghostty submodule..."
    git submodule update --init --recursive
else
    echo "📦 Ghostty submodule already initialized"
fi

# Apply patch
echo "🔧 Applying WASM API patch..."
cd ghostty
PATCH_ALREADY_APPLIED=0
if git apply --reverse --check ../patches/ghostty-wasm-api.patch >/dev/null 2>&1; then
    echo "✓ WASM API patch already applied"
    PATCH_ALREADY_APPLIED=1
else
    git apply --check ../patches/ghostty-wasm-api.patch || {
        echo "❌ Patch doesn't apply cleanly"
        echo "Ghostty may have changed. Check patches/ghostty-wasm-api.patch"
        exit 1
    }
    git apply ../patches/ghostty-wasm-api.patch
fi

# Build WASM
echo "⚙️  Building WASM (takes ~20 seconds)..."
zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall

# Copy to project root
cd ..
cp ghostty/zig-out/bin/ghostty-vt.wasm ./

# Revert patch to keep submodule clean
echo "🧹 Cleaning up..."
cd ghostty
if [ "$PATCH_ALREADY_APPLIED" -eq 0 ]; then
    git apply -R ../patches/ghostty-wasm-api.patch
    # Remove new files created by the patch
    rm -f include/ghostty/vt/terminal.h
    rm -f src/terminal/c/terminal.zig
fi
cd ..

SIZE=$(du -h ghostty-vt.wasm | cut -f1)
echo "✅ Built ghostty-vt.wasm ($SIZE)"
