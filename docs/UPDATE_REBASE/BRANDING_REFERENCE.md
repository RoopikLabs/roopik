# ROOPIK IDE - Branding & Customization Reference

**Last Updated:** 2025-01-XX
**Purpose:** Complete reference for all branding locations in the VS Code fork to maintain Roopik identity after rebasing with upstream VS Code.

---

## 📋 Table of Contents

1. [Core Product Configuration](#core-product-configuration)
2. [Application Icons](#application-icons)
3. [Build & Packaging](#build--packaging)
4. [CLI Branding](#cli-branding)
5. [UI & Themes](#ui--themes)
6. [Window Title & Branding](#window-title--branding)
7. [Welcome & Onboarding](#welcome--onboarding)
8. [Activity Bar Icon](#activity-bar-icon)
9. [Rebase Strategy](#rebase-strategy)
10. [Priority Checklist](#priority-checklist)

---

## 🎯 Core Product Configuration

### 1. `product.json` (Root Directory)

**Location:** `product.json`
**Purpose:** Main product configuration file - controls app name, IDs, URLs, and system identifiers.

**Fields to Update:**
```json
{
  "nameShort": "Roopik",                    // ✅ Already set
  "nameLong": "Roopik",                     // ✅ Already set
  "applicationName": "roopik",              // ✅ Already set
  "dataFolderName": ".roopik",              // ✅ Already set
  "win32DirName": "Roopik",                 // ✅ Already set
  "win32NameVersion": "Roopik",             // ✅ Already set
  "win32RegValueName": "Roopik",            // ✅ Already set
  "darwinBundleIdentifier": "com.roopik.code", // ✅ Already set
  "linuxIconName": "roopik-editor",         // ✅ Already set
  "urlProtocol": "roopik",                  // ✅ Already set
  "reportIssueUrl": "https://github.com/RoopikLabs/roopik/issues/new", // ✅ Already set
  "webviewContentExternalBaseUrlTemplate": "..." // ⚠️ May need update
}
```

**Rebase Impact:** Medium - Usually stable, but check for new fields after rebase.

---

### 2. `package.json` (Root Directory)

**Location:** `package.json`
**Purpose:** NPM package metadata and repository information.

**Fields to Update:**
- Line 2: `"name": "code-oss-dev"` → Should be `"roopik"` or `"roopik-dev"`
- Line 6: `"author": { "name": "Microsoft Corporation" }` → Update to `"Roopik Labs"` or your org
- Line 234-236: `repository` → Update URL to Roopik repository
- Line 238-239: `bugs` → Update URL to Roopik issues

**Rebase Impact:** High - Often changes during rebase, needs manual review.

---

## 🎨 Application Icons

### 3. Windows Icons

**Location:** `resources/win32/`

| File | Purpose | Status |
|------|---------|--------|
| `code.ico` | Main application icon (Windows) | ❌ Needs replacement |
| `code_150x150.png` | Taskbar/Start menu (150x150) | ❌ Needs replacement |
| `code_70x70.png` | Taskbar/Start menu (70x70) | ❌ Needs replacement |
| `VisualElementsManifest.xml` | Windows tile metadata | ⚠️ Needs text update |

**VisualElementsManifest.xml Changes:**
- Line 8: `ShortDisplayName="Code - OSS"` → Change to `"Roopik"`
- Lines 5-6: Icon paths (already correct structure, just need new images)

**Rebase Impact:** Low - Icon files rarely change, but manifest might.

---

### 4. macOS Icons

**Location:** `resources/darwin/`

| File | Purpose | Status |
|------|---------|--------|
| `code.icns` | Main application icon bundle (macOS) | ❌ Needs replacement |
| `*.icns` | File type association icons | ⚠️ Optional (for file associations) |

**Rebase Impact:** Low - Icon files rarely change.

---

### 5. Linux Icons

**Location:** `resources/linux/`

| File | Purpose | Status |
|------|---------|--------|
| `code.png` | Desktop icon (Linux) | ❌ Needs replacement |
| `code.desktop` | Desktop entry file | ⚠️ Needs text update |

**code.desktop Changes:**
- Line 2: `Name=@@NAME_LONG@@` (template, replaced at build - already correct)
- Line 3: `Comment=Code Editing. Redefined.` → Update to `"AI-Native Canvas-First IDE"`
- Line 6: `Icon=@@ICON@@` (template - already correct)
- Line 9: `StartupWMClass=@@NAME_SHORT@@` (template - already correct)

**Rebase Impact:** Medium - Desktop file may get updates.

---

### 6. Web/Server Icons

**Location:** `resources/server/`

| File | Purpose | Status |
|------|---------|--------|
| `code-192.png` | PWA icon (192x192) | ❌ Needs replacement |
| `code-512.png` | PWA icon (512x512) | ❌ Needs replacement |
| `favicon.ico` | Browser favicon | ❌ Needs replacement |
| `manifest.json` | PWA manifest | ⚠️ Needs text update |

**manifest.json Changes:**
- Line 2: `"name": "Code - OSS"` → Change to `"Roopik"`
- Line 3: `"short_name": "Code- OSS"` → Change to `"Roopik"`

**Rebase Impact:** Low - Manifest rarely changes.

---

### 7. Workbench Icon (In-App)

**Location:** `src/vs/workbench/browser/media/code-icon.svg`
**Purpose:** SVG icon used in welcome pages, walkthroughs, and in-app branding.

**Referenced In:**
- `src/vs/workbench/contrib/welcomeWalkthrough/browser/media/walkThroughPart.css` (line 116)

**Rebase Impact:** Low - SVG rarely changes, but CSS reference might.

---

## 🔨 Build & Packaging

### 8. Windows Installer

**Location:** `build/win32/code.iss`
**Purpose:** Inno Setup script for Windows installer.

**Fields to Update:**
- Line 11: `AppPublisher=Microsoft Corporation` → Change to `"Roopik Labs"` or your org
- Line 12: `AppPublisherURL=https://code.visualstudio.com/` → Update to Roopik website
- Line 13: `AppSupportURL=https://code.visualstudio.com/` → Update to Roopik support
- Line 14: `AppUpdatesURL=https://code.visualstudio.com/` → Update to Roopik updates
- Line 25: `SetupIconFile` (points to code.ico) → Update path if icon renamed

**Rebase Impact:** Medium - Installer script may get updates.

---

### 8b. Windows 11+ AppX Manifest (Optional)

**Location:** `resources/win32/appx/AppxManifest.xml`
**Purpose:** Windows 11+ context menu integration ("Open with Code" → "Open with Roopik")

**Fields to Update:**
- Line 18: `Publisher="CN=Microsoft Corporation..."` → Change to your company/publisher
- Line 23: `PublisherDisplayName="Microsoft Corporation"` → Change to `"Roopik Labs"`
- Line 428 in `build/gulpfile.vscode.mjs`: `'OpenWithCode'` → Change to `'OpenWithRoopik'` (context menu ID)

**Note:** Only needed if shipping Windows installers. Can be removed if not needed (like Void did).

**Rebase Impact:** Low - Manifest rarely changes.

---

### 9. Build Scripts

**Locations:**
- `build/gulpfile.vscode.mjs` → Main build configuration
- `build/lib/electron.ts` → Electron packaging (icon paths, bundle IDs)
- `build/package.json` → Build package name (currently "code-oss-dev-build")

**Rebase Impact:** High - Build scripts change frequently, review carefully.

---

## 💻 CLI Branding

### 10. CLI Constants (Rust)

**Location:** `cli/src/constants.rs`
**Purpose:** Rust CLI application constants.

**Constants to Update (or set via build-time env vars):**
- Line 50-53: `APPLICATION_NAME` → Defaults to "code", set `VSCODE_CLI_APPLICATION_NAME="roopik"`
- Line 56-59: `PRODUCT_NAME_LONG` → Defaults to "Code - OSS", set `VSCODE_CLI_NAME_LONG="Roopik"`
- Line 62-66: `QUALITYLESS_PRODUCT_NAME` → Defaults to "Code", set `VSCODE_CLI_QUALITYLESS_PRODUCT_NAME="Roopik"`
- Line 88-91: `DEFAULT_DATA_PARENT_DIR` → Defaults to ".vscode-oss", set `VSCODE_CLI_DATA_FOLDER_NAME=".roopik"`

**Build-Time Environment Variables:**
```bash
export VSCODE_CLI_APPLICATION_NAME="roopik"
export VSCODE_CLI_NAME_LONG="Roopik"
export VSCODE_CLI_QUALITYLESS_PRODUCT_NAME="Roopik"
export VSCODE_CLI_DATA_FOLDER_NAME=".roopik"
```

**Rebase Impact:** Medium - Constants file may get updates.

---

## 🎨 UI & Themes

### 11. Default Themes

**Locations:**
- `extensions/theme-defaults/package.json` → Theme extension metadata
- `extensions/theme-defaults/themes/*.json` → Theme color definitions
  - `dark_plus.json`, `dark_modern.json`, `light_plus.json`, `light_modern.json`, etc.
- `src/vs/workbench/services/themes/common/workbenchThemeService.ts`
  - Lines 42-45: Default theme names
  - Lines 54-194: Initial color values

**Theme Customization Strategy:**
1. **Keep Default Themes:** Users can still use VS Code themes - don't remove them
2. **Add Custom Themes:** Create new theme files in `extensions/theme-defaults/themes/`
3. **Override Defaults:** Modify `ThemeSettingDefaults` in `workbenchThemeService.ts` (lines 42-45)
4. **Custom Colors:** Modify `COLOR_THEME_DARK_INITIAL_COLORS` (lines 54-194)

**Example Custom Theme:**
```json
// extensions/theme-defaults/themes/roopik-modern-dark.json
{
  "name": "Roopik Modern Dark",
  "type": "dark",
  "colors": {
    "editor.background": "#1a1a1a",
    "editor.foreground": "#e0e0e0",
    // ... custom colors
  }
}
```

**Rebase Impact:** Low - Theme files rarely change, but service file might.

---

## 🪟 Window Title & Branding

### 12. Window Title

**Location:** `src/vs/workbench/browser/parts/titlebar/windowTitle.ts`
**Purpose:** Window title bar configuration.

- Line 358: Uses `productService.nameLong` for `${appName}` variable
- **Already uses product.json** - no changes needed if product.json is correct

**Rebase Impact:** Low - Title logic rarely changes.

---

### 13. Splash Screen

**Locations:**
- `src/vs/code/electron-browser/workbench/workbench.ts` (lines 23-270)
- `src/vs/platform/theme/electron-main/themeMainServiceImpl.ts` (lines 23-26)

**Purpose:** Startup splash screen colors and layout.

- Uses theme colors from `partsSplash` configuration
- Default background colors defined in `themeMainServiceImpl.ts`

**Rebase Impact:** Low - Splash screen logic rarely changes.

---

## 👋 Welcome & Onboarding

### 14. Welcome Page

**Locations:**
- `src/vs/workbench/contrib/welcomeGettingStarted/` → Getting Started page
- `src/vs/workbench/contrib/welcomeWalkthrough/` → Walkthrough system

**Purpose:** First-run experience and onboarding.

- Uses `productService` for branding (already dynamic)
- Content is mostly product-agnostic

**Rebase Impact:** Low - Welcome pages rarely need branding changes.

---

## 📌 Activity Bar Icon

### 15. Activity Bar Icon

**Location:** `extensions/roopik/resources/roopik-icon.svg`
**Referenced In:** `extensions/roopik/package.json` (line 66)

**Status:** ✅ Already configured correctly - this is your custom extension, not VS Code core.

**Rebase Impact:** None - This is in your extension, not VS Code core.

---

## 🔄 Rebase Strategy

### Recommended Structure

Create a branding overlay system to make rebasing easier:

```
roopik/
├── branding/                    # NEW: Branding overlay directory
│   ├── product.json             # Override for product.json
│   ├── icons/
│   │   ├── win32/
│   │   │   ├── roopik.ico
│   │   │   ├── roopik_150x150.png
│   │   │   └── roopik_70x70.png
│   │   ├── darwin/
│   │   │   └── roopik.icns
│   │   ├── linux/
│   │   │   └── roopik.png
│   │   └── server/
│   │       ├── roopik-192.png
│   │       ├── roopik-512.png
│   │       └── favicon.ico
│   ├── themes/                  # Custom theme files
│   │   └── roopik-modern-dark.json
│   └── scripts/
│       └── apply-branding.js    # Script to apply branding after rebase
├── docs/
│   └── UPDATE_REBASE/
│       ├── BRANDING_REFERENCE.md (this file)
│       ├── apply-branding.js
│       └── README.md
└── ... (rest of VS Code fork)
```

### Rebase Workflow

1. **Rebase with upstream VS Code:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Resolve conflicts** in core VS Code files (if any)

3. **Run branding script:**
   ```bash
   node docs/UPDATE_REBASE/apply-branding.js
   ```

4. **Verify changes:**
   - Check `product.json` has correct values
   - Verify icons are replaced
   - Test build

5. **Commit branding changes:**
   ```bash
   git add -A
   git commit -m "chore: apply Roopik branding after rebase"
   ```

---

## ✅ Priority Checklist

### High Priority (Required for Branding)

- [ ] `product.json` - Verify all fields are correct
- [ ] `resources/win32/code.ico` → Replace with `roopik.ico`
- [ ] `resources/win32/code_150x150.png` → Replace with `roopik_150x150.png`
- [ ] `resources/win32/code_70x70.png` → Replace with `roopik_70x70.png`
- [ ] `resources/win32/VisualElementsManifest.xml` - Line 8
- [ ] `resources/darwin/code.icns` → Replace with `roopik.icns`
- [ ] `resources/linux/code.png` → Replace with `roopik.png`
- [ ] `resources/linux/code.desktop` - Line 3 (description)
- [ ] `resources/server/manifest.json` - Lines 2-3
- [ ] `resources/server/code-192.png` → Replace
- [ ] `resources/server/code-512.png` → Replace
- [ ] `resources/server/favicon.ico` → Replace
- [ ] `src/vs/workbench/browser/media/code-icon.svg` → Replace with Roopik icon
- [ ] `package.json` - Lines 2, 6, 234-239

### Medium Priority (Nice to Have)

- [ ] `build/win32/code.iss` - Lines 11-14 (publisher info)
- [ ] `resources/win32/appx/AppxManifest.xml` - Lines 18, 23 (publisher) + `build/gulpfile.vscode.mjs` line 428 (context menu ID: "OpenWithCode" → "OpenWithRoopik")
- [ ] `cli/src/constants.rs` - Or set build-time env vars
- [ ] `build/package.json` - Line 2

### Low Priority (Optional)

- [ ] Custom theme files in `extensions/theme-defaults/themes/`
- [ ] File type icons (`resources/win32/*.ico`, `resources/darwin/*.icns`)

---

## 📝 Notes

### Theme System Philosophy

- **Keep VS Code Themes:** Users should still be able to use VS Code's default themes
- **Add Custom Themes:** Create new theme files alongside defaults rather than replacing them
- **Override Defaults:** Only change default theme selection, not remove themes

### Rebase Strategy

- **Keep branding changes in separate overlay directory** - makes rebasing cleaner
- **Use script to apply branding** - reduces manual work and errors
- **Document all changes** - helps track what needs updating

### Build-Time Variables

Some values (CLI name, etc.) can be set via environment variables during build, reducing merge conflicts. See [CLI Branding](#10-cli-constants-rust) section.

---

## 🔗 Related Files

- `docs/UPDATE_REBASE/apply-branding.js` - Automated branding application script
- `docs/UPDATE_REBASE/README.md` - Usage instructions for branding script

---

**Last Review:** After each VS Code rebase, review this document and update any changed file paths or new branding locations.

