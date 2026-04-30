#!/usr/bin/env bash
# Custom DEB packaging script for Roopik
# Inspired by VSCodium - creates DEB package from already-built binary

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Configuration
APP_NAME="${APP_NAME:-roopik}"
VSCODE_ARCH="${VSCODE_ARCH:-x64}"
BUILD_DIR="${REPO_ROOT}/../VSCode-linux-${VSCODE_ARCH}"
DEB_ARCH=""

# Map VS Code arch to Debian arch
case "$VSCODE_ARCH" in
  x64)
    DEB_ARCH="amd64"
    ;;
  armhf)
    DEB_ARCH="armhf"
    ;;
  arm64)
    DEB_ARCH="arm64"
    ;;
  *)
    echo "Unknown architecture: $VSCODE_ARCH"
    exit 1
    ;;
esac

echo "========================================="
echo "Roopik DEB Package Builder"
echo "========================================="
echo "Architecture: $VSCODE_ARCH -> $DEB_ARCH"
echo "Build directory: $BUILD_DIR"
echo "========================================="

# Check if build directory exists
if [ ! -d "$BUILD_DIR" ]; then
  echo "ERROR: Build directory not found: $BUILD_DIR"
  echo "Make sure you've run 'npm run gulp vscode-linux-${VSCODE_ARCH}' first"
  exit 1
fi

# Create DEB package structure
DEB_ROOT="${REPO_ROOT}/.build/linux/deb/${DEB_ARCH}"
DEB_PKG="${DEB_ROOT}/${APP_NAME}-${DEB_ARCH}"

echo "Creating DEB package structure..."
rm -rf "$DEB_PKG"
mkdir -p "$DEB_PKG/DEBIAN"
mkdir -p "$DEB_PKG/usr/share/${APP_NAME}"
mkdir -p "$DEB_PKG/usr/share/applications"
mkdir -p "$DEB_PKG/usr/share/pixmaps"
mkdir -p "$DEB_PKG/usr/share/icons/hicolor/512x512/apps"
mkdir -p "$DEB_PKG/usr/bin"

# Copy application files
echo "Copying application files..."
cp -r "$BUILD_DIR"/* "$DEB_PKG/usr/share/${APP_NAME}/"

# Create desktop file
echo "Creating desktop file..."
cat > "$DEB_PKG/usr/share/applications/${APP_NAME}.desktop" << EOF
[Desktop Entry]
Name=Roopik
Comment=Code Editing. Redefined.
GenericName=Text Editor
Exec=/usr/share/${APP_NAME}/${APP_NAME} --unity-launch %F
Icon=${APP_NAME}
Type=Application
StartupNotify=false
StartupWMClass=Roopik
Categories=Utility;TextEditor;Development;IDE;
MimeType=text/plain;inode/directory;
Actions=new-empty-window;
Keywords=roopik;

[Desktop Action new-empty-window]
Name=New Empty Window
Exec=/usr/share/${APP_NAME}/${APP_NAME} --new-window %F
Icon=${APP_NAME}
EOF

# Copy icon
# Install at both the legacy pixmaps location (older desktops) and the hicolor
# icon theme path (required by modern GNOME/Wayland and KDE — without this the
# dock falls back to a generic settings icon).
if [ -f "${REPO_ROOT}/resources/linux/code.png" ]; then
  cp "${REPO_ROOT}/resources/linux/code.png" "$DEB_PKG/usr/share/pixmaps/${APP_NAME}.png"
  cp "${REPO_ROOT}/resources/linux/code.png" "$DEB_PKG/usr/share/icons/hicolor/512x512/apps/${APP_NAME}.png"
fi

# Create symlink in /usr/bin
ln -sf "/usr/share/${APP_NAME}/${APP_NAME}" "$DEB_PKG/usr/bin/${APP_NAME}"

# Get package version
PACKAGE_VERSION=$(node -p "require('${REPO_ROOT}/package.json').version")

# Calculate installed size (in KB)
INSTALLED_SIZE=$(du -sk "$DEB_PKG/usr" | cut -f1)

# Fixed dependency list (known to work, no scanning needed)
# Based on VS Code's requirements but without strict version checking
DEPENDENCIES="ca-certificates, libasound2, libatk-bridge2.0-0, libatk1.0-0, libatspi2.0-0, libc6, libcairo2, libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3, libdbus-1-3, libdrm2, libexpat1, libgbm1, libglib2.0-0, libgtk-3-0 | libgtk-4-1, libnspr4, libnss3, libpango-1.0-0, libx11-6, libxcb1, libxcomposite1, libxdamage1, libxext6, libxfixes3, libxkbcommon0, libxkbfile1, libxrandr2, xdg-utils"

# Create control file
echo "Creating control file..."
cat > "$DEB_PKG/DEBIAN/control" << EOF
Package: ${APP_NAME}
Version: ${PACKAGE_VERSION}
Section: devel
Priority: optional
Architecture: ${DEB_ARCH}
Depends: ${DEPENDENCIES}
Maintainer: Roopik Labs <hello@roopik.com>
Homepage: https://roopik.com
Description: Roopik - Code Editing. Redefined.
 Roopik is a custom fork of VS Code with enhanced features
 for modern development workflows.
 .
 This package includes the full Roopik IDE with all core features.
Installed-Size: ${INSTALLED_SIZE}
EOF

# Create postinst script
cat > "$DEB_PKG/DEBIAN/postinst" << 'EOF'
#!/bin/sh
set -e

# Update desktop database
if command -v update-desktop-database > /dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi

# Update MIME database
if command -v update-mime-database > /dev/null 2>&1; then
    update-mime-database /usr/share/mime || true
fi

# Refresh the hicolor icon cache so the dock/launcher picks up the app icon
# immediately (otherwise GNOME/KDE show a generic icon until next login).
if command -v gtk-update-icon-cache > /dev/null 2>&1; then
    gtk-update-icon-cache -q -f -t /usr/share/icons/hicolor || true
fi

exit 0
EOF

chmod 755 "$DEB_PKG/DEBIAN/postinst"

# Create postrm script
cat > "$DEB_PKG/DEBIAN/postrm" << 'EOF'
#!/bin/sh
set -e

# Update desktop database
if command -v update-desktop-database > /dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi

# Update MIME database
if command -v update-mime-database > /dev/null 2>&1; then
    update-mime-database /usr/share/mime || true
fi

# Refresh the hicolor icon cache so the removed icon stops showing in caches.
if command -v gtk-update-icon-cache > /dev/null 2>&1; then
    gtk-update-icon-cache -q -f -t /usr/share/icons/hicolor || true
fi

exit 0
EOF

chmod 755 "$DEB_PKG/DEBIAN/postrm"

# Build the DEB package
echo "Building DEB package..."
mkdir -p "$DEB_ROOT/deb"

# Use dpkg-deb to build
if command -v fakeroot > /dev/null 2>&1; then
  fakeroot dpkg-deb --build "$DEB_PKG" "$DEB_ROOT/deb/${APP_NAME}_${PACKAGE_VERSION}_${DEB_ARCH}.deb"
else
  # Fallback without fakeroot (may have permission warnings but should work)
  dpkg-deb --build "$DEB_PKG" "$DEB_ROOT/deb/${APP_NAME}_${PACKAGE_VERSION}_${DEB_ARCH}.deb"
fi

echo "========================================="
echo "✅ DEB package created successfully!"
echo "📦 Package: ${APP_NAME}_${PACKAGE_VERSION}_${DEB_ARCH}.deb"
echo "📍 Location: $DEB_ROOT/deb/"
echo "📏 Size: $(du -h "$DEB_ROOT/deb/${APP_NAME}_${PACKAGE_VERSION}_${DEB_ARCH}.deb" | cut -f1)"
echo "========================================="
echo ""
echo "To install:"
echo "  sudo dpkg -i $DEB_ROOT/deb/${APP_NAME}_${PACKAGE_VERSION}_${DEB_ARCH}.deb"
echo "  sudo apt-get install -f  # Fix any missing dependencies"
echo "========================================="

