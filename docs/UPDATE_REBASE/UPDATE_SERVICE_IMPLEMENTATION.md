# Roopik IDE - Update Service Implementation Guide

## 🎯 Overview

This document records all the fixes and changes made to enable the "Check for Updates" functionality in Roopik IDE across all platforms (Windows, macOS, Linux).

---

## 🐛 The Problem

The "Check for Updates" button was not appearing in production builds, and the update service was completely disabled due to multiple issues:

1. ❌ Update cache path initialization was **fatal** (crashed the service)
2. ❌ Cloudflare Worker had **undefined variables** (500 errors)
3. ❌ Cloudflare Worker had **incomplete platform mapping**
4. ❌ **No version comparison** logic (always downloaded same version)
5. ❌ `latest.json` used **wrong version format** (version number instead of commit hash)

---

## ✅ The Solution - 5 Critical Fixes

### **Fix #1: Make Update Cache Path Non-Fatal (Windows)**

**File:** `src/vs/platform/update/electron-main/updateService.win32.ts`

**Problem:** If `app.setPath('appUpdate', cachePath)` failed, the entire update service was disabled.

**Solution:** Changed from `error` + `return` to `warn` + `continue`:

```typescript
// BEFORE (Fatal - disabled updates)
try {
    const cachePath = await this.cachePath;
    app.setPath('appUpdate', cachePath);
} catch (err) {
    this.logService.error('update#initialize - Failed to set update cache path', err);
    this.setState(State.Disabled(DisablementReason.InvalidConfiguration));
    return; // ❌ STOPS HERE!
}

// AFTER (Non-fatal - continues anyway)
try {
    const cachePath = await this.cachePath;
    app.setPath('appUpdate', cachePath);
} catch (err) {
    // Note: We skip setting appUpdate cache path as it can fail on some systems
    // and is not required for update functionality. Following VSCodium's approach.
    this.logService.warn('update#initialize - Failed to set update cache path, continuing anyway', err);
    // ✅ CONTINUES!
}
```

**Impact:** Update service now works even if cache path setup fails.

---

### **Fix #2: Cloudflare Worker - Fix Undefined Variables**

**File:** `docs/roopik-updates/src/index.js`

**Problem:** The `quality` variable was used but never extracted from the URL:

```javascript
// BEFORE (Broken - quality undefined)
const [, platform] = match;  // Only extracted platform!
const manifestUrl = `${baseUrl}/${manifestPath}/${quality}/latest.json`;  // ❌ quality is undefined!
```

**Solution:** Properly destructure all URL components:

```javascript
// AFTER (Fixed)
const [, platform, quality, currentCommit] = match;  // ✅ Extract all 3!
const manifestUrl = `${baseUrl}/${manifestPath}/${quality}/latest.json`;
```

**Impact:** Worker no longer crashes with 500 errors.

---

### **Fix #3: Cloudflare Worker - Complete Platform Mapping**

**File:** `docs/roopik-updates/src/index.js`

**Problem:** Platform map was incomplete - didn't recognize Windows variants like `win32-x64-user`:

```javascript
// BEFORE (Incomplete)
const platformMap = {
    'darwin-arm64': 'macos',
    'win32-x64': 'windows',  // ❌ Missing user/archive variants!
    'linux-x64': 'linux'
};
```

**Solution:** Added all platform variants:

```javascript
// AFTER (Complete)
const platformMap = {
    // macOS
    'darwin-arm64': 'macos',
    'darwin': 'macos',
    'darwin-universal': 'macos',
    // Windows (various build types)
    'win32-x64': 'windows',
    'win32-x64-user': 'windows',      // ✅ Added
    'win32-x64-archive': 'windows',   // ✅ Added
    'win32-arm64': 'windows',         // ✅ Added
    'win32-arm64-user': 'windows',    // ✅ Added
    'win32-arm64-archive': 'windows', // ✅ Added
    // Linux
    'linux-x64': 'linux',
    'linux-arm64': 'linux'            // ✅ Added
};
```

**Impact:** All platform variants are now recognized.

---

### **Fix #4: Cloudflare Worker - Add Version Comparison**

**File:** `docs/roopik-updates/src/index.js`

**Problem:** Worker always returned the update JSON, even if the user was already on the latest version. This caused the IDE to re-download the same version repeatedly!

**Solution:** Compare the current commit (from URL) with the latest version (from `latest.json`):

```javascript
// AFTER (Added version comparison)
const update = await res.json();

// CRITICAL: Compare versions to determine if update is needed
// The "version" field in latest.json should be the commit hash
// If the current commit matches the latest commit, return 204 (no update)
const latestVersion = update.version;

if (latestVersion && currentCommit && latestVersion === currentCommit) {
    // Already running the latest version - no update available
    return new Response(null, {
        status: 204,
        headers: { 'Access-Control-Allow-Origin': '*' }
    });
}

// Update available - return the update info
return new Response(JSON.stringify(update), {
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    }
});
```

**Impact:** IDE correctly detects when it's already on the latest version and shows "No updates available" instead of re-downloading.

---

### **Fix #5: Build Workflows - Use Commit Hash as Version**

**Files:**
- `.github/workflows/build-windows.yml`
- `.github/workflows/build-macos.yml`
- `.github/workflows/build-linux.yml`

**Problem:** The `latest.json` used the package version (`"1.109.0"`) as the `version` field, but VS Code compares by **commit hash**!

```json
// BEFORE (Broken - always different from current commit)
{
  "version": "1.109.0",
  "productVersion": "1.109.0",
  ...
}
```

**Solution:** Use commit hash as `version`, keep human-readable version as `productVersion`:

**Windows:**
```powershell
$version = node -p "require('./package.json').version"
$commit = "${{ github.sha }}"  # ✅ Get commit hash!

$json = @{
    version = $commit           # ✅ Commit hash for comparison
    productVersion = $version   # Human-readable version
    url = $url
    sha256hash = $hash
    pub_date = $pubDate
}
```

**macOS/Linux:**
```bash
version="$(node -p "require('./package.json').version")"
commit="${{ github.sha }}"  # ✅ Get commit hash!

json="$(printf '{"version":"%s","productVersion":"%s",...}' "$commit" "$version" ...)"
```

**Result:**
```json
// AFTER (Fixed - matches current commit when up-to-date)
{
  "version": "27e4750f938fc8611f6fab1f29a0bf2e3ea9cbaf",  // ✅ Commit hash!
  "productVersion": "1.109.0",  // Human-readable
  ...
}
```

**Impact:** Update comparison now works correctly - IDE knows when it's on the latest version.

---

## 🔄 How the Update Flow Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROOPIK IDE (Installed)                       │
│                                                                 │
│  product.json contains:                                         │
│    "commit": "27e4750f938fc8611f6fab1f29a0bf2e3ea9cbaf"         │
│    "version": "1.109.0"                                         │
│                                                                 │
│  User clicks "Check for Updates"                                │
│  IDE sends:                                                     │
│  GET /api/update/win32-x64-user/stable/27e4750f...              │
│                                         ↑                       │
│                                         └── Current commit!     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CLOUDFLARE WORKER                             │
│                                                                 │
│  1. Extracts: platform="win32-x64-user"                         │
│              quality="stable"                                   │
│              currentCommit="27e4750f..."                        │
│                                                                 │
│  2. Maps platform → "windows"                                   │
│                                                                 │
│  3. Fetches: downloads.roopik.com/windows/stable/latest.json    │
│                                                                 │
│  4. Compares: latest.json.version === currentCommit ?           │
│                                                                 │
│     ✅ MATCH → Return 204 (No update)                           │
│     ❌ DIFFERENT → Return update JSON                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    R2 STORAGE                                   │
│                                                                 │
│  windows/stable/latest.json:                                    │
│  {                                                              │
│    "version": "27e4750f...",      ← Commit hash for comparison │
│    "productVersion": "1.109.0",   ← Human-readable version     │
│    "url": "https://downloads.roopik.com/windows/...",           │
│    "sha256hash": "a06a624...",                                  │
│    "pub_date": "2026-01-23T05:47:02Z"                           │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Testing Checklist

### ✅ Test Scenario 1: No Update Available (Same Version)

1. **Setup:** Ensure `latest.json` has the **same commit hash** as installed IDE
2. **Action:** Click "Check for Updates"
3. **Expected:**
   - IDE shows: "You're on the latest version!"
   - No download occurs
   - Logs show: `update#setState idle` (no update available)

### ✅ Test Scenario 2: Update Available (Different Version)

1. **Setup:** Ensure `latest.json` has a **different commit hash** than installed IDE
2. **Action:** Click "Check for Updates"
3. **Expected:**
   - IDE shows: "Downloading update..."
   - Download starts in background
   - After download: "Restart to update"
   - Logs show: `update#setState downloading` → `update#setState downloaded`

### ✅ Test Scenario 3: Hash Verification

1. **Setup:** Corrupt the `sha256hash` in `latest.json`
2. **Action:** Click "Check for Updates"
3. **Expected:**
   - Download completes
   - Hash verification fails
   - IDE shows: "Update failed - hash mismatch"
   - Logs show: `Error: Hash mismatch`

---

## 🚀 Deployment Steps

### 1. Deploy Cloudflare Worker

```bash
cd docs/roopik-updates
npm run deploy
```

### 2. Build and Upload New Version

```bash
# Trigger GitHub Actions build
git push origin main

# Or build locally
npm run gulp vscode-win32-x64-user-setup
```

### 3. Verify `latest.json` Format

Check that R2 has the correct format:

```bash
curl https://downloads.roopik.com/windows/stable/latest.json
```

Should return:
```json
{
  "version": "COMMIT_HASH_HERE",  ← Must be commit hash!
  "productVersion": "1.109.0",
  "url": "https://downloads.roopik.com/windows/roopik-windows-latest.exe",
  "sha256hash": "...",
  "pub_date": "2026-01-23T..."
}
```

---

## 🔧 Troubleshooting

### Issue: "Check for Updates" button not visible

**Cause:** `isBuilt` is `false` (dev mode)

**Check:**
```typescript
// In logs, look for:
update#initialize - isBuilt: false  // ❌ Bad!
update#initialize - isBuilt: true   // ✅ Good!
```

**Fix:** Ensure `VSCODE_DEV` environment variable is **NOT set** in production builds.

---

### Issue: Always downloads same version

**Cause:** `latest.json` has wrong version format

**Check:**
```bash
curl https://downloads.roopik.com/windows/stable/latest.json | jq .version
```

**Expected:** Commit hash (e.g., `"27e4750f..."`)
**Wrong:** Version number (e.g., `"1.109.0"`)

**Fix:** Re-run build workflow with the fixed scripts.

---

### Issue: Worker returns 500 error

**Cause:** Missing environment variable or undefined variable

**Check Cloudflare Worker logs:**
- Look for `UPDATE_MANIFEST_BASE` is set
- Check for JavaScript errors

**Fix:** Ensure `UPDATE_MANIFEST_BASE` is set in Cloudflare Worker environment variables.

---

## 📝 Key Takeaways

1. **Commit hash is king:** VS Code compares updates by commit hash, not version number
2. **Non-fatal errors:** Cache path failures should not disable the entire update service
3. **Version comparison is critical:** Without it, the IDE re-downloads the same version forever
4. **Platform mapping matters:** All platform variants must be recognized by the worker
5. **Testing is essential:** Always test both "no update" and "update available" scenarios

---

## 🎉 Success Criteria

- ✅ "Check for Updates" button appears in production builds
- ✅ Shows "No updates available" when on latest version
- ✅ Downloads and installs updates when available
- ✅ Verifies SHA256 hash before installing
- ✅ Works on all platforms (Windows, macOS, Linux)
- ✅ Logs are informative and non-fatal errors don't crash the service

---

**Last Updated:** 2026-01-23
**Status:** ✅ Fully Working
**Tested On:** Windows (User Setup), macOS (Universal), Linux (x64)
