# Roopik Build System - Linux Packaging Solution

## Summary

We've successfully created a **VSCodium-inspired** build system for Roopik that produces **both** binary archives and DEB installer packages without modifying VS Code's core files.

## What We Fixed

### 1. ✅ Windows Build Error
**Problem**: Bash syntax (`if ! npm install; then`) doesn't work on Windows runners (PowerShell by default)

**Solution**: Added `shell: bash` to the step
```yaml
- name: Install roopik-roo extension dependencies
  working-directory: extensions/roopik-roo
  shell: bash  # ← This fixes it!
  run: |
    if ! npm install; then
      ...
```

### 2. ✅ Linux DEB Packaging Error
**Problem**: VS Code's DEB packaging requires `roopik-tunnel` binary which doesn't exist in our fork

**Solution**: Created custom DEB packaging script that:
- Works with already-built binaries
- Uses fixed dependency list (no scanning needed)
- Bypasses tunnel binary requirement
- Follows VSCodium's approach

## File Structure

```
.github/
├── build/
│   └── linux/
│       ├── package_bin.sh           # VSCodium's build script (reference)
│       └── package_roopik_deb.sh    # Our custom DEB packager ✨
└── workflows/
    └── build-all-platforms.yml       # Updated to use custom script
```

## How It Works

### Build Process

1. **Build Binary** (VS Code's gulp task)
   ```bash
   npm run gulp vscode-linux-x64
   ```
   Creates: `../VSCode-linux-x64/` (portable binary)

2. **Create DEB Package** (Our custom script)
   ```bash
   bash .github/build/linux/package_roopik_deb.sh
   ```
   Creates: `.build/linux/deb/amd64/roopik_1.108.0_amd64.deb`

### What Gets Uploaded

- ✅ `../VSCode-linux-x64/` - Portable binary (extract and run)
- ✅ `.build/linux/deb/amd64/` - DEB installer package

## Key Features of Our Solution

### 1. **No Core File Modifications** ✅
- All custom scripts in `.github/build/`
- VS Code core files untouched
- Easy to maintain during rebases

### 2. **Fixed Dependencies** ✅
- No dependency scanning (avoids tunnel binary issue)
- Uses known-good dependency list
- Compatible with Ubuntu 20.04+, Debian 11+

### 3. **Professional Packaging** ✅
- Desktop integration (menu entries)
- File associations
- Proper install/uninstall scripts
- Icon integration

### 4. **Flexible** ✅
- Works with or without `fakeroot`
- Continues even if DEB packaging fails
- Both binary and installer available

## Installation Methods

### Method 1: DEB Package (Recommended for end users)
```bash
sudo dpkg -i roopik_1.108.0_amd64.deb
sudo apt-get install -f  # Fix any missing dependencies
```

**Benefits:**
- ✅ Proper system integration
- ✅ Desktop menu entry
- ✅ File associations
- ✅ Easy uninstall: `sudo apt remove roopik`

### Method 2: Portable Binary (For testing/development)
```bash
tar -xzf VSCode-linux-x64.tar.gz
cd VSCode-linux-x64
./roopik
```

**Benefits:**
- ✅ No installation needed
- ✅ Run from any location
- ✅ Multiple versions side-by-side

## Comparison with VSCodium

| Aspect | VSCodium | Roopik (Our Solution) |
|--------|----------|----------------------|
| **Approach** | Clone VS Code + patch | Direct fork + custom packaging |
| **Core Files** | Never modified | Never modified ✅ |
| **DEB Creation** | Custom scripts | Custom scripts (inspired by VSCodium) ✅ |
| **Dependency Check** | Skipped | Skipped (fixed list) ✅ |
| **Tunnel Binary** | Not needed | Not needed ✅ |

## Next Steps (Optional Enhancements)

### 1. Create TAR.GZ Archive
Add a step to create compressed archives:
```yaml
- name: Create TAR.GZ archive
  run: |
    cd ..
    tar -czf roopik-linux-x64-${VERSION}.tar.gz VSCode-linux-x64/
```

### 2. Add RPM Packaging
Similar script for Red Hat/Fedora/CentOS users

### 3. Add AppImage
Universal Linux package that runs anywhere

### 4. Add Snap Package
Ubuntu Software Store distribution

## Testing the Build

### Local Testing
```bash
# Build the binary
npm run gulp vscode-linux-x64

# Create DEB package
export APP_NAME=roopik
export VSCODE_ARCH=x64
bash .github/build/linux/package_roopik_deb.sh

# Test installation
sudo dpkg -i .build/linux/deb/amd64/roopik_*.deb
roopik  # Should launch!
```

### CI Testing
Push to GitHub and check the Actions tab. Both artifacts should upload successfully.

## Troubleshooting

### "dpkg-deb: error: failed to open package info file"
- Make sure the build directory exists
- Run `npm run gulp vscode-linux-x64` first

### "fakeroot: command not found"
- Script will fallback to regular dpkg-deb
- May show permission warnings but should work
- Install fakeroot: `sudo apt-get install fakeroot`

### DEB package won't install
- Check dependencies: `sudo apt-get install -f`
- Verify architecture matches: `dpkg --print-architecture`

## Credits

- Inspired by [VSCodium](https://github.com/VSCodium/vscodium)
- Based on VS Code's build system
- Custom packaging by Roopik Labs

## License

Same as Roopik (MIT)
