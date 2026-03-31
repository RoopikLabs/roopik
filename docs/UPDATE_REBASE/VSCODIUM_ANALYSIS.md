# VSCodium Build Process - Complete Analysis

## What is VSCodium?

VSCodium is a **100% open-source** distribution of Microsoft's VS Code without:
- Microsoft telemetry
- Microsoft branding
- Microsoft marketplace (uses Open VSX instead)
- Microsoft proprietary features (Copilot, Cloud Sync, etc.)

## How VSCodium Works

### 1. **Core Build Philosophy**

VSCodium **does NOT fork VS Code**. Instead, they:
1. Clone the official VS Code repository
2. Apply a series of **patches** to remove/modify Microsoft-specific features
3. Replace branding and configuration
4. Build the modified source

This means they stay **100% compatible** with VS Code updates!

---

## VSCodium's Build Pipeline - Step by Step

### **Phase 1: Preparation (`prepare_vscode.sh`)**

#### A. **Product Configuration Changes**

They modify `product.json` using `jq` (JSON processor):

```bash
# Change extension marketplace from Microsoft to Open VSX
setpath_json "product" "extensionsGallery" '{
  "serviceUrl": "https://open-vsx.org/vscode/gallery",
  "itemUrl": "https://open-vsx.org/vscode/item",
  ...
}'

# Set update URL to their own server
setpath "product" "updateUrl" "https://raw.githubusercontent.com/VSCodium/versions/refs/heads/master"

# Change all branding
setpath "product" "nameShort" "VSCodium"
setpath "product" "nameLong" "VSCodium"
setpath "product" "applicationName" "codium"
```

**What you can learn:**
- They use `jq` for safe JSON manipulation
- All URLs are changed to point to their infrastructure
- Product names, IDs, and identifiers are all changed

#### B. **Apply Patches**

They apply **35+ patch files** in a specific order:

```bash
# 1. Common patches (all platforms)
for file in ../patches/*.patch; do
  apply_patch "${file}"
done

# 2. Quality-specific patches (insider/stable)
for file in ../patches/insider/*.patch; do
  apply_patch "${file}"
done

# 3. OS-specific patches
for file in "../patches/${OS_NAME}/"*.patch; do
  apply_patch "${file}"
done

# 4. User custom patches
for file in ../patches/user/*.patch; do
  apply_patch "${file}"
done
```

---

## Key Patches Explained

### 1. **`telemetry.patch`** - Disable All Telemetry

Changes **default values** from `true` to `false`:

```diff
-'default': TelemetryConfiguration.ON,
+'default': TelemetryConfiguration.OFF,

-'default': true,  // enableTelemetry
+'default': false,

-'default': true,  // enableCrashReporting
+'default': false,

-'default': true,  // enableExperiments
+'default': false,
```

**What it does:**
- Telemetry is OFF by default
- Crash reporting is OFF by default
- A/B testing experiments are OFF by default
- Natural language search (uses Microsoft service) is OFF by default

### 2. **`undo_telemetry.sh`** - Remove Telemetry URLs

Uses `ripgrep` to find and replace **all Microsoft telemetry endpoints**:

```bash
SEARCH="\.data\.microsoft\.com"
REPLACEMENT="s|//[^/]+\.data\.microsoft\.com|//0\.0\.0\.0|g"

# Find all files containing Microsoft telemetry URLs
./node_modules/@vscode/ripgrep/bin/rg --no-ignore -l "${SEARCH}" . | \
  xargs -I {} sed -i -E "${REPLACEMENT}" "{}"
```

**Result:** All telemetry URLs like:
- `mobile.events.data.microsoft.com`
- `vortex.data.microsoft.com`

Are replaced with `0.0.0.0` (dead endpoint).

### 3. **`disable-copilot.patch`** - Remove GitHub Copilot

Disables Copilot by:
- Setting `chat.disableAIFeatures` default to `true`
- Hiding all Copilot UI elements via context keys
- Removing Copilot from command palette, menus, and views

```diff
-'default': false,  // chat.disableAIFeatures
+'default': true,

-when: ChatContextKeys.Setup.installed.negate(),
+when: ContextKeyExpr.has('config.chat.disableAIFeatures').negate(),
```

### 4. **`disable-cloud.patch`** - Remove Cloud Sync

Removes the "Turn on Cloud Changes" feature entirely by:
- Deleting the sign-in action registration
- Removing menu items for cloud sync

### 5. **`version-1-update.patch`** - Custom Update System

**This is the BIG one for you!** VSCodium completely **rewrites the update system**:

#### Changes to Update URL Format:

```diff
-export function createUpdateURL(platform: string, quality: string, productService: IProductService): string {
-  return `${productService.updateUrl}/api/update/${platform}/${quality}/${productService.commit}`;
+export function createUpdateURL(productService: IProductService, quality: string, platform: Platform, architecture: Architecture, target?: Target): string {
+  if (target) {
+    return `${productService.updateUrl}/${quality}/${platform}/${architecture}/${target}/latest.json`;
+  } else {
+    return `${productService.updateUrl}/${quality}/${platform}/${architecture}/latest.json`;
+  }
}
```

**Before (VS Code):**
```
https://update.code.visualstudio.com/api/update/win32-x64/stable/abc123commit
```

**After (VSCodium):**
```
https://raw.githubusercontent.com/VSCodium/versions/stable/win32/x64/user/latest.json
```

#### Version Comparison Logic:

They add **semver comparison** to check if an update is actually newer:

```typescript
const fetchedVersion = update.productVersion.replace(/(\\d+\\.\\d+\\.)0+(\\d+)(\\-\\w+)?/, '$1$2$3')
const currentVersion = this.productService.version.replace(/(\\d+\\.\\d+\\.)0+(\\d+)(\\-\\w+)?/, '$1$2$3')

if(semver.compareBuild(currentVersion, fetchedVersion) >= 0) {
  this.setState(State.Idle(UpdateType.Setup));  // No update needed
}
```

#### Windows MSI Support:

They detect if the app is installed via MSI (in `Program Files`):

```typescript
if (existsSync(path.join(path.dirname(process.execPath), 'unins000.exe'))) {
  _updateType = UpdateType.Setup;  // Inno Setup installer
} else if (path.basename(path.normalize(path.join(process.execPath, '..', '..'))) === 'Program Files') {
  _updateType = UpdateType.WindowsInstaller;  // MSI installer
} else {
  _updateType = UpdateType.Archive;  // Portable
}
```

### 6. **`disable-update.patch.yet`** - Optionally Disable Updates

If `DISABLE_UPDATE=yes` is set, this patch is renamed to `.patch` and applied:

```diff
-'default': 'default',  // update.mode
+'default': 'none',
```

### 7. **`brand.patch`** - Replace All "VS Code" Text

**Massive patch (142KB, 1460 lines!)** that replaces every occurrence of:
- "VS Code" → "!!APP_NAME!!"
- "Visual Studio Code" → "!!APP_NAME!!"
- "Microsoft" → "VSCodium"

The `!!APP_NAME!!` placeholder is replaced during build with actual app name.

### 8. **`update-cache-path.patch`** - Fix Update Cache Path

Changes the Windows update cache path to use the product name:

```diff
-const result = path.join(tmpdir(), `vscode-${this.productService.quality}-${this.productService.target}-${process.arch}`);
+const result = path.join(tmpdir(), `${this.productService.applicationName}-${this.productService.quality}-${this.productService.target}-${process.arch}`);
```

**Why:** Prevents conflicts if both VS Code and VSCodium are installed.

---

## What VSCodium Does That You Might Want

### ✅ **Simple & Stable Patches You Can Use:**

1. **Telemetry Defaults** (`telemetry.patch`)
   - Just change default config values
   - No breaking changes
   - Easy to maintain

2. **Update Cache Path** (`update-cache-path.patch`)
   - Prevents conflicts with VS Code
   - One-line change
   - Highly recommended

3. **Disable Copilot** (`disable-copilot.patch`)
   - If you don't want built-in Copilot
   - Changes default settings only

4. **Custom Update URL Format** (from `version-1-update.patch`)
   - You're already doing this!
   - VSCodium's approach is very similar to yours

### ❌ **Complex Patches You Should Avoid:**

1. **Brand Patch** (`brand.patch`)
   - 1460 lines of text replacements
   - Breaks on every VS Code update
   - You already have your own branding

2. **Undo Telemetry Script** (`undo_telemetry.sh`)
   - Scans entire codebase with regex
   - Fragile and slow
   - Better to just disable in config

3. **Disable Cloud/Signature Verification**
   - Removes features you might want
   - Not necessary for your use case

---

## VSCodium's Update Server

They host `latest.json` files on GitHub:

```
https://raw.githubusercontent.com/VSCodium/versions/master/
├── stable/
│   ├── win32/
│   │   ├── x64/
│   │   │   ├── user/latest.json
│   │   │   ├── system/latest.json
│   │   │   ├── archive/latest.json
│   │   │   └── msi/latest.json
│   │   └── arm64/...
│   ├── darwin/...
│   └── linux/...
└── insider/...
```

Each `latest.json` contains:

```json
{
  "version": "1.96.2.24361",
  "productVersion": "1.96.2",
  "url": "https://github.com/VSCodium/vscodium/releases/download/1.96.2.24361/VSCodiumSetup-x64-1.96.2.24361.exe",
  "sha256hash": "abc123...",
  "pub_date": "2025-01-20T12:00:00Z"
}
```

**Your approach is simpler and better!** You use Cloudflare Workers to dynamically generate this.

---

## Recommendations for Roopik

### ✅ **DO Adopt These:**

1. **Update Cache Path Fix**
   ```typescript
   // In src/vs/platform/update/electron-main/updateService.win32.ts
   const result = path.join(tmpdir(), `${this.productService.applicationName}-${this.productService.quality}-${this.productService.target}-${process.arch}`);
   ```

2. **Telemetry Defaults** (if you want privacy-first defaults)
   ```typescript
   // In src/vs/platform/telemetry/common/telemetryService.ts
   'default': TelemetryConfiguration.OFF,
   ```

3. **Semver Version Comparison** (you might already have this)
   ```typescript
   import * as semver from 'semver';

   if(semver.compareBuild(currentVersion, fetchedVersion) >= 0) {
     // No update needed
   }
   ```

### ❌ **DON'T Adopt These:**

1. **Patch-based workflow** - Too fragile, breaks on every update
2. **Brand.patch** - You have your own branding
3. **Undo telemetry script** - Overkill, just change defaults
4. **Disable Copilot** - You might want to keep it

### 🤔 **Consider These:**

1. **MSI Installer Support** (if you plan to offer MSI)
   - VSCodium's detection logic is good
   - Adds `UpdateType.WindowsInstaller`

2. **Separate Update Channels** (stable/insider)
   - VSCodium has separate update URLs
   - Useful if you have preview builds

---

## Key Takeaways

1. **VSCodium's approach is COMPLEX** because they need to:
   - Remove ALL Microsoft branding/services
   - Stay compatible with every VS Code update
   - Support multiple quality levels (stable/insider)

2. **Your approach is SIMPLER** because you:
   - Keep most VS Code features
   - Just customize branding and updates
   - Don't need to patch 1460 lines of text

3. **What you can steal:**
   - Update cache path fix (prevents conflicts)
   - Telemetry defaults (privacy-first)
   - MSI installer detection (if needed)

4. **What you should avoid:**
   - Patch-based workflow (too fragile)
   - Text replacement scripts (breaks easily)
   - Removing features you might want

---

## Your Current Setup vs VSCodium

| Feature | Roopik | VSCodium |
|---------|--------|----------|
| **Update URL Format** | `/{platform}/{quality}/latest.json` | `/{quality}/{platform}/{arch}/{target}/latest.json` |
| **Update Server** | Cloudflare Worker (dynamic) | GitHub (static files) |
| **Branding** | Custom product.json | Patch-based replacement |
| **Telemetry** | Default ON (VS Code default) | Default OFF (patched) |
| **Marketplace** | VS Code Marketplace | Open VSX |
| **Build Process** | Direct build | Clone + Patch + Build |
| **Maintenance** | Low (no patches) | High (patches break) |

**Verdict:** Your approach is **better for your use case**! VSCodium's complexity is necessary for their goal (100% de-Microsoft-ification), but you don't need that.

---

## Simple Integration Plan

If you want to adopt VSCodium's best practices **without the complexity**:

### Step 1: Update Cache Path (5 minutes)

```bash
# File: src/vs/platform/update/electron-main/updateService.win32.ts
# Line 58

# Change:
const result = path.join(tmpdir(), `vscode-${this.productService.quality}-${this.productService.target}-${process.arch}`);

# To:
const result = path.join(tmpdir(), `${this.productService.applicationName}-${this.productService.quality}-${this.productService.target}-${process.arch}`);
```

### Step 2: Telemetry Defaults (10 minutes) - Optional

```bash
# File: src/vs/platform/telemetry/common/telemetryService.ts
# Lines 7-8, 12-13

# Change all telemetry defaults from true to false
'default': TelemetryConfiguration.OFF,
'default': false,
```

### Step 3: Done!

That's it. You get the benefits without the complexity.

---

## Conclusion

VSCodium is an **impressive engineering effort** to completely de-Microsoft-ify VS Code while staying compatible with updates. However, their approach requires:
- Maintaining 35+ patches
- Rebuilding on every VS Code release
- Constant vigilance for breaking changes

**For Roopik, you don't need this complexity.** Your current approach of:
1. Custom `product.json`
2. Cloudflare Worker for updates
3. Direct builds without patches

Is **simpler, more maintainable, and perfectly adequate** for your needs.

The only things worth stealing from VSCodium are:
1. ✅ Update cache path fix
2. 🤔 Telemetry defaults (if you want privacy-first)
3. 🤔 MSI installer detection (if you offer MSI)

Everything else is overkill for your use case!
