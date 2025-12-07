# VS Code Core Modifications

Track of all VS Code core files we've modified (for upstream conflict handling).

## Build System

| File | Change | Reason |
|------|--------|--------|
| `build/gulpfile.extensions.mjs` (after `extensions/git/tsconfig.json`) | Added `'extensions/roopik/tsconfig.json'` | Register roopik extension in build system |
| `build/hygiene.mjs:19-32` | Added `roopikCopyrightHeaderLines` constant array | Allow Roopik copyright alongside Microsoft |
| `build/hygiene.mjs:114-136` | Modified `copyrights` method to check both Microsoft and Roopik headers | Check for either Microsoft or Roopik copyright, fail only if neither found |
| `eslint.config.js:2185-2205` | Added roopik extension header override | Allow Roopik copyright in extensions/roopik/ |
| `build/lib/electron.ts:190-200` | Changed `winIcon` from `path.join(root, 'resources/win32/code.ico')` to `'resources/win32/code.ico'` | Fix .exe icon embedding |

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

## DURING UPSTREAM CHANGES

### Files to Delete
- `.config/1espt/` - Delete entire folder (Microsoft-specific build configs)
- `.mailmap` - Clean/remove data
- `cli/target/` - Delete build data (irrelevant, not needed)

### Files to Modify
- `.gitignore` - Clean/update (remove Microsoft-specific, add Roopik-specific)
- `.mention-bot` - Line 2: `maxReviewers`: 2 → 4, Line 3: `requiredOrgs`: ["Microsoft"] → ["RoopikLabs"]
- `.npmrc` - **DO NOT DELETE OR CHANGE** - Only observe build version changes, keep as-is
- `gulpfile.mjs` - Note: May have changed from `.mjs` to `.ts` imports (VS Code migration, adapt if needed)
- `package.json` - Update: `name`, `author.name`, `repository.url`, `bugs.url` (see apply-branding.json for full list)
- `build/gulpfile.extensions.mjs` - Add roopik extension registration (after `extensions/git/tsconfig.json` line): `'extensions/roopik/tsconfig.json', // ROOPIK: Our canvas-first IDE extension`
- `build/lib/electron.ts` (line ~190-200) - Change `winIcon`: `path.join(root, 'resources/win32/code.ico')` → `'resources/win32/code.ico'`
- `build/hygiene.mjs` - Add Roopik copyright constants and update copyrights method (see code below)
- `eslint.config.js` (end of file) - Add roopik extension header override block (see code below)

### Files to Replace
- `CONTRIBUTING.md` - Replace with Roopik version
- `README.md` - Replace with Roopik version
- `SECURITY.md` - Replace with Roopik version
- `LICENSE.md` - Replace with Roopik version

**build/hygiene.mjs changes:**

Add after line 19 (after Microsoft copyright constant):
```javascript
// ROOPIK: Allow both Microsoft and Roopik copyright headers
const roopikCopyrightHeaderLines = [
	'/*---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Roopik. All rights reserved.',
	' *  Licensed under the MIT License. See License.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------*/',
];
```

Update `copyrights` method (around line 114):
```javascript
const copyrights = es.through(function (file) {
	const lines = file.__lines;
	// ROOPIK: Check if file matches either Microsoft or Roopik copyright header
	let hasMicrosoftCopyright = true;
	let hasRoopikCopyright = true;
	for (let i = 0; i < copyrightHeaderLines.length; i++) {
		if (lines[i] !== copyrightHeaderLines[i]) {
			hasMicrosoftCopyright = false;
		}
		if (lines[i] !== roopikCopyrightHeaderLines[i]) {
			hasRoopikCopyright = false;
		}
	}
	if (!hasMicrosoftCopyright && !hasRoopikCopyright) {
		console.error(file.relative + ': Missing or bad copyright statement');
		errorCount++;
	}
	this.emit('data', file);
});
```

**eslint.config.js override block:**
```javascript
// ROOPIK: Override header rule for roopik extension
{
	files: ['extensions/roopik/**/*.{ts,tsx,js,jsx}'],
	plugins: { header: pluginHeader },
	rules: {
		'header/header': [2, 'block', [
			'---------------------------------------------------------------------------------------------',
			' *  Copyright (c) Roopik. All rights reserved.',
			' *  Licensed under the MIT License. See License.txt in the project root for license information.',
			' *--------------------------------------------------------------------------------------------'
		]]
	}
},
```

---

## CORE Migration (workbench/contrib)

**Migration Date:** Core migration from extension to `workbench/contrib/roopik/`

Files modified outside of `workbench/contrib/roopik/` to integrate Roopik into VS Code core:

| File | Change | PR Reference |
|------|--------|--------------|
| `src/vs/workbench/workbench.common.main.ts` | Added roopik contribution import:<br>`// Roopik Design IDE`<br>`import './contrib/roopik/browser/roopik.contribution.js';` | [PR #15](https://github.com/RoopikLabs/roopik/pull/15/files) |
| `src/vs/code/electron-main/app.ts` | Multiple changes (see detailed section below) | [PR #15](https://github.com/RoopikLabs/roopik/pull/15/files) |
| `src/vs/platform/windows/electron-main/windows.ts` | Added `webviewTag: true` in `webPreferences`:<br>`// Enable webview tag for Roopik browser preview`<br>`webviewTag: true,` | [PR #15](https://github.com/RoopikLabs/roopik/pull/15/files) |

**Note:** See [PR #15](https://github.com/RoopikLabs/roopik/pull/15/files) for full diff.

### `src/vs/code/electron-main/app.ts` - Detailed Changes

**PR Reference:** [PR #15](https://github.com/RoopikLabs/roopik/pull/15/files)

| Line(s) | Change | Details |
|---------|--------|---------|
| **~126-129** | Added imports for ProjectMode | Added imports:<br>`// ROOPIK: ProjectMode - Browser Preview with embedded DevTools`<br>`import { BrowserViewService } from '../../workbench/contrib/roopik/electron-main/projectMode/browserViewService.js';`<br>`import { ProjectModeChannel } from '../../workbench/contrib/roopik/electron-main/projectMode/projectModeChannel.js';`<br>`import { PROJECT_MODE_CHANNEL } from '../../workbench/contrib/roopik/common/projectMode/ipc.js';` |
| **~254** | Removed webview request validation function | Removed `isAllowedWebviewRequest` function. Added comment:<br>`// Removed isAllowedWebviewRequest function - validation disabled for Roopik browser preview` |
| **~259-260** | Disabled webview request validation | In `session.defaultSession.webRequest.onBeforeRequest` handler, removed validation check. Added comments:<br>`// Allow all webview requests for Roopik browser preview (Electron webview tag)`<br>`// Original validation disabled to enable full browser preview functionality` |
| **~397-405** | Modified navigation handler | Updated `contents.on('will-navigate')` handler:<br>- Changed comment to: `// ROOPIK: Block any in-page navigation (except for ProjectMode browser views)`<br>- Added check: `if (BrowserViewService.isManagedWebContents(webContentsId)) { return; }`<br>- Allows navigation for ProjectMode managed browser views<br>- Ends with `// ROOPIK END` |
| **~413-426** | Modified window open handler | Updated `contents.setWindowOpenHandler()` handler:<br>- Changed comment to: `// ROOPIK: For all other URLs, delegate to the OS (except for ProjectMode browser views)`<br>- Added logic to redirect new window requests (Ctrl+Click, `target="_blank"`, etc.) to the same view for ProjectMode browser views<br>- Prevents new windows from opening for ProjectMode managed views<br>- Ends with `// ROOPIK END` |
| **~1246-1250** | Registered ProjectMode IPC channel | Added IPC channel registration:<br>`// ROOPIK: ProjectMode - Browser Preview with embedded DevTools and CDP`<br>`const projectModeService = new BrowserViewService();`<br>`const projectModeChannel = new ProjectModeChannel(projectModeService);`<br>`mainProcessElectronServer.registerChannel(PROJECT_MODE_CHANNEL, projectModeChannel);`<br>`// ROOPIK END` |
| **~134-136** | Added imports for SandboxPipeline | Added imports:<br>`// ROOPIK: Sandbox Pipeline - ESBuild component transformation`<br>`import { SandboxPipelineMainService } from '../../workbench/contrib/roopik/electron-main/sandboxPipeline/sandboxPipelineMainService.js';`<br>`import { SandboxPipelineChannel } from '../../workbench/contrib/roopik/electron-main/sandboxPipeline/sandboxPipelineChannel.js';` |
| **~1263-1266** | Registered SandboxPipeline IPC channel | Added IPC channel registration:<br>`// ROOPIK: Sandbox Pipeline - ESBuild component transformation`<br>`const sandboxPipelineService = new SandboxPipelineMainService();`<br>`const sandboxPipelineChannel = new SandboxPipelineChannel(sandboxPipelineService);`<br>`mainProcessElectronServer.registerChannel('sandboxPipeline', sandboxPipelineChannel);`<br>`// ROOPIK END` |

---

## Dependencies Added to Core

**Location:** `package.json` (root)

| Package | Version | Reason |
|---------|---------|--------|
| `esbuild` | `^0.27.0` | JavaScript/TypeScript bundler for sandbox component transformation |
| `esbuild-plugin-vue3` | `^0.5.1` | ESBuild plugin to compile Vue 3 SFC (.vue files) |
| `esbuild-svelte` | `^0.9.3` | ESBuild plugin to compile Svelte components (.svelte files) |
| `svelte` | `^5.45.2` | Svelte 5 compiler (required by esbuild-svelte@0.9.x) |
| `@vue/compiler-sfc` | `^3.5.25` | Vue 3 SFC compiler (peer dependency of esbuild-plugin-vue3) |

**Why in core?** Sandbox pipeline runs in electron-main process to bundle user components with ESBuild. Frameworks like Vue/Svelte need their compiler plugins available at build time.
