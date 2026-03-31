# Latest Branding Automation Changes

This file tracks all VS Code core files modified by the `apply-branding.js` script during the last rebase sync. Use this as a checklist when comparing with the legacy `roopik/develop` branch to ensure no manual logic was missed.

**Date:** 2026-01-23
**Snapshot Branch:** `rebase-clean-snapshot`

## Modified Files (32)

| Category | File Path |
| :--- | :--- |
| **Project Config** | `.gitignore` |
| | `.eslint-ignore` |
| | `.mention-bot` |
| | `.mailmap` (Cleared) |
| **Build System** | `build/filters.ts` |
| | `build/gulpfile.extensions.ts` |
| | `build/gulpfile.vscode.ts` |
| | `build/hygiene.ts` |
| | `eslint.config.js` |
| **App Metadata** | `package.json` |
| | `product.json` |
| **Core Integration** | `src/vs/workbench/workbench.common.main.ts` |
| | `src/vs/workbench/contrib/chat/browser/chat.contribution.ts` |
| | `src/vs/workbench/browser/parts/titlebar/titlebarPart.ts` |
| | `src/vs/platform/windows/electron-main/windows.ts` |
| | `src/vs/platform/telemetry/common/telemetryService.ts` |
| | `src/vs/platform/update/electron-main/updateService.win32.ts` |
| | `src/vs/code/electron-browser/workbench/workbench.html` |
| | `src/vs/code/electron-browser/workbench/workbench-dev.html` |
| **Icons & Branding** | `resources/darwin/code.icns` |
| | `resources/linux/code.desktop` |
| | `resources/linux/code.png` |
| | `resources/server/code-192.png` |
| | `resources/server/code-512.png` |
| | `resources/server/favicon.ico` |
| | `resources/server/manifest.json` |
| | `resources/win32/VisualElementsManifest.xml` |
| | `resources/win32/code.ico` |
| | `resources/win32/code_150x150.png` |
| | `resources/win32/code_70x70.png` |
| | `src/vs/workbench/browser/media/code-icon.svg` |

---
*Note: `package-lock.json` was also modified due to dependency installations but is excluded from this list.*
