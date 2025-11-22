# VS Code Core Modifications

Track of all VS Code core files we've modified (for upstream conflict handling).

## Build System

| File | Change | Reason |
|------|--------|--------|
| `build/gulpfile.extensions.mjs:47` | Added `extensions/roopik/tsconfig.json` | Register roopik extension in build system |
| `build/hygiene.mjs:19-32` | Added Roopik copyright header check | Allow Roopik copyright alongside Microsoft |
| `build/hygiene.mjs:114-136` | Modified copyright validation logic | Check for either Microsoft or Roopik header |
| `eslint.config.js:2185-2205` | Added roopik extension header override | Allow Roopik copyright in extensions/roopik/ |
| `build/lib/electron.ts:199` | Changed `winIcon` from relative to absolute path: `path.join(root, 'resources/win32/code.ico')` | Fix icon embedding - relative path doesn't resolve correctly during Electron build, causing Task Manager to show old icon |

## Branding (Text/Metadata)

**Applied via:** `docs/UPDATE_REBASE/apply-branding.js`

| File | Fields Updated | Details |
|------|----------------|---------|
| `product.json` | `nameShort`, `nameLong`, `applicationName`, `dataFolderName`, `win32DirName`, `win32NameVersion`, `win32RegValueName`, `darwinBundleIdentifier`, `linuxIconName`, `urlProtocol`, `reportIssueUrl` | Core app branding (names, IDs, URLs) |
| `package.json` | `name`, `author.name`, `repository.type`, `repository.url`, `bugs.url` | NPM package metadata |
| `resources/server/manifest.json` | `name`, `short_name` | PWA manifest branding |
| `resources/win32/VisualElementsManifest.xml` | `ShortDisplayName` | Windows tile branding |
| `resources/linux/code.desktop` | `Comment` | Linux desktop entry description |
| `build/win32/code.iss` | `AppPublisher`, `AppPublisherURL`, `AppSupportURL`, `AppUpdatesURL` | Windows installer metadata (if script extended) |

## Branding (Icons)

**Applied via:** `docs/UPDATE_REBASE/apply-branding.js`

| Location | File | Purpose |
|----------|------|---------|
| `resources/win32/` | `code.ico`, `code_150x150.png`, `code_70x70.png` | Windows app icons (taskbar, tiles) |
| `resources/darwin/` | `code.icns` | macOS app icon bundle |
| `resources/linux/` | `code.png` | Linux desktop icon |
| `resources/server/` | `code-192.png`, `code-512.png`, `favicon.ico` | PWA/server icons |
| `src/vs/workbench/browser/media/` | `code-icon.svg` | Workbench welcome page icon |
| `extensions/github-authentication/media/` | `favicon.ico` | GitHub auth extension favicon |
| `extensions/microsoft-authentication/media/` | `favicon.ico` | Microsoft auth extension favicon |

**Note:** Icons are replaced by copying from `branding/icons/` to VS Code locations. Filenames remain unchanged (VS Code expects these names).
