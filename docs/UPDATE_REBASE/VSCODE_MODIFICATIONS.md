# VS Code Core Modifications

Track of all VS Code core files we've modified (for upstream conflict handling).

## Build System

| File | Change | Reason |
|------|--------|--------|
| `build/gulpfile.extensions.js` (after `extensions/git/tsconfig.json`) | Added `'extensions/roopik/tsconfig.json'` and `'extensions/roopik-dio/tsconfig.json'` | Register roopik canvas and roopik-dio agent extensions in build system |
| `build/hygiene.ts:25-31` | Added `roopikCopyrightHeaderLines` constant array | Allow Roopik copyright alongside Microsoft |
| `build/hygiene.ts:115-135` | Modified `copyrights` method to check both Microsoft and Roopik headers | Check for either Microsoft or Roopik copyright, fail only if neither found |
| `eslint.config.js:2185-2205` | Added roopik extension header override | Allow Roopik copyright in extensions/roopik/ |
| `eslint.config.js` (`local/code-import-patterns` → `target: 'src/vs/code/~'`) | Added Roopik allow-pattern for `vs/workbench/contrib/roopik/~` (electron layers) | Prevent hygiene/precommit failures caused by Roopik imports in `src/vs/code/electron-main/*` (layering rule whitelist) |
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
- `package.json` - Update: `name`, `author.name`, `repository.url`, `bugs.url` (see apply-branding.json for full list)
- `build/gulpfile.extensions.ts` - Add roopik and roopik-dio extension registration (after `extensions/git/tsconfig.json` line):
  - `'extensions/roopik/tsconfig.json', // ROOPIK: Our canvas-first IDE extension`
  - `'extensions/roopik-dio/tsconfig.json', // ROOPIK DIO: AI agent integration`
- `build/lib/electron.ts` (line ~190-200) - Change `winIcon`: `path.join(root, 'resources/win32/code.ico')` → `'resources/win32/code.ico'`
- `build/hygiene.ts` - Add Roopik copyright constants and update copyrights method (see code below)
- `eslint.config.js` (end of file) - Add roopik extension header override block (see code below)
- `eslint.config.js` (code-import-patterns) - Add Roopik allow-pattern under `target: 'src/vs/code/~'` for electron layers so `npm run precommit` doesn't fail when `src/vs/code/electron-main/*` imports `workbench/contrib/roopik/*`

### Files to Replace
- `CONTRIBUTING.md` - Replace with Roopik version
- `README.md` - Replace with Roopik version
- `SECURITY.md` - Replace with Roopik version
- `LICENSE.md` - Replace with Roopik version

**build/hygiene.js changes:**

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
	const copyrights = es.through(function (file: VinylFileWithLines) {
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

**eslint.config.js code-import-patterns exception (Roopik):**

This is a targeted whitelist entry so the local `code-import-patterns` rule (a whitelist-based layering check) allows Roopik IPC/service wiring from `src/vs/code/**` in Electron layers.

```javascript
// Roopik fork: allow bridging from code/electron-main into our
// workbench contrib area for custom services while keeping
// other layering rules intact.
{
	'when': 'hasElectron',
	'pattern': 'vs/workbench/contrib/roopik/~'
},
```

---

## Platform / Security Bypasses

**Purpose:** Allow unsigned Roopik builds to function without code signing issues and keychain prompts.

| File | Change | Reason |
|------|--------|--------|
| `src/vs/platform/extensionManagement/node/extensionManagementService.ts` | In `downloadExtension()` method: commented out config-based signature verification and hard-coded `verifySignature = false`. Added `logService.trace()` for debugging. | Bypass extension signature verification for unsigned Roopik builds |
| `src/vs/platform/encryption/electron-main/encryptionMainService.ts` | In constructor: added macOS check that calls `safeStorage.setUsePlainTextEncryption?.(true)` | Bypass Keychain prompts on unsigned macOS builds |

**Applied via:** `docs/UPDATE_REBASE/apply-branding.js` (signature bypass) and `docs/UPDATE_REBASE/patches/fix-macos-bypass-keychain-prompts-fix-strict-build.patch` (keychain bypass)

**extensionManagementService.ts change:**
```typescript
if (verifySignature) {
	this.logService.trace(`Roopik: Bypassing signature verification for ${extension.identifier.id}. Original config key: ${VerifyExtensionSignatureConfigKey}. Configuration service available: ${!!this.configurationService}`);
	// const value = this.configurationService.getValue(VerifyExtensionSignatureConfigKey);
	// verifySignature = isBoolean(value) ? value : true;
	verifySignature = false; // Roopik: Disable signature verification
```

**encryptionMainService.ts change:**
```typescript
constructor(
	@ILogService private readonly logService: ILogService
) {
	// Roopik: Force basic encryption on macOS to avoid Keychain prompts on unsigned builds
	if (isMacintosh) {
		this.logService.trace('[EncryptionMainService] Roopik: Force-enabling basic text encryption on macOS to bypass Keychain prompts.');
		safeStorage.setUsePlainTextEncryption?.(true);
	}
	// ... rest of constructor
```

---

## CORE Migration (workbench/contrib)

**Migration Date:** Core migration from extension to `workbench/contrib/roopik/`

Files modified outside of `workbench/contrib/roopik/` to integrate Roopik into VS Code core:

| File | Change | PR Reference |
|------|--------|--------------|
| `src/vs/workbench/workbench.common.main.ts` | Added roopik contribution import:<br>`// Roopik Design IDE`<br>`import './contrib/roopik/browser/roopik.contribution.js';` | [PR #15](https://github.com/RoopikLabs/roopik/pull/15/files) |
| `src/vs/code/electron-main/app.ts` [MANUAL] | Multiple changes (see detailed section below) | [PR #15](https://github.com/RoopikLabs/roopik/pull/15/files) |
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
| **~134-138** | Added imports for CanvasService | Added imports:<br>`// ROOPIK: Canvas Service - Canvas lifecycle and metadata management`<br>`import { CanvasService } from '../../workbench/contrib/roopik/electron-main/canvas/canvasService.js';`<br>`import { CanvasChannel } from '../../workbench/contrib/roopik/electron-main/channel/canvasChannel.js';`<br>`import { CANVAS_CHANNEL_NAME } from '../../workbench/contrib/roopik/browser/canvasServiceClient.js';`<br>`import { RoopikStorageService } from '../../workbench/contrib/roopik/electron-main/storage/storageService.js';` |
| **~139-145** | Added imports for ComponentService | Added imports:<br>`// ROOPIK: Component Service - Component lifecycle, build queue, file watching`<br>`import { ComponentService } from '../../workbench/contrib/roopik/electron-main/component/componentService.js';`<br>`import { ComponentChannel } from '../../workbench/contrib/roopik/electron-main/channel/componentChannel.js';`<br>`import { COMPONENT_CHANNEL_NAME } from '../../workbench/contrib/roopik/browser/componentServiceClient.js';`<br>`import { BuildService } from '../../workbench/contrib/roopik/electron-main/build/buildService.js';`<br>`import { ImportService } from '../../workbench/contrib/roopik/electron-main/import/importService.js';`<br>`import { FileWatcher } from '../../workbench/contrib/roopik/electron-main/watch/fileWatcher.js';` |
| **~1272-1276** | Registered CanvasService IPC channel | Added IPC channel registration:<br>`// ROOPIK: Canvas Service - Canvas lifecycle, metadata, panel state tracking`<br>`const roopikStorageService = new RoopikStorageService();`<br>`const canvasService = new CanvasService(roopikStorageService);`<br>`const canvasChannel = new CanvasChannel(canvasService);`<br>`mainProcessElectronServer.registerChannel(CANVAS_CHANNEL_NAME, canvasChannel);` |
| **~1278-1284** | Registered ComponentService IPC channel | Added IPC channel registration:<br>`// ROOPIK: Component Service - Component lifecycle, build queue, file watching`<br>`const buildService = new BuildService();`<br>`const importService = new ImportService();`<br>`const fileWatcher = new FileWatcher();`<br>`const componentService = new ComponentService(roopikStorageService, buildService, importService, fileWatcher);`<br>`const componentChannel = new ComponentChannel(componentService);`<br>`mainProcessElectronServer.registerChannel(COMPONENT_CHANNEL_NAME, componentChannel);`<br>`// ROOPIK END` |
| **~146-149** | Added imports for ProjectStorageService | Added imports:<br>`// ROOPIK: Project Storage Service - Recent projects for Project Mode`<br>`import { ProjectStorageService } from '../../workbench/contrib/roopik/electron-main/projectStorage/projectStorageService.js';`<br>`import { ProjectStorageChannel } from '../../workbench/contrib/roopik/electron-main/channel/projectStorageChannel.js';`<br>`import { PROJECT_STORAGE_CHANNEL } from '../../workbench/contrib/roopik/common/projectStorage/index.js';` |
| **~1290-1293** | Registered ProjectStorageService IPC channel | Added IPC channel registration:<br>`// ROOPIK: Project Storage Service - Recent projects for Project Mode`<br>`const projectStorageService = new ProjectStorageService();`<br>`const projectStorageChannel = new ProjectStorageChannel(projectStorageService);`<br>`mainProcessElectronServer.registerChannel(PROJECT_STORAGE_CHANNEL, projectStorageChannel);` |

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
| `electron-context-menu` | `^4.1.1` | Standard browser context menu (Back/Forward/Reload/Inspect) for ProjectMode BrowserView |
NOTE: Add these two in devDepdencies for AST component source:
  "devDependencies": {
    "@babel/core"
    "@types/babel__core"

**Why in core?** BuildService (part of ComponentService) runs in electron-main process to bundle user components with ESBuild. Frameworks like Vue/Svelte need their compiler plugins available at build time. electron-context-menu enables standard browser right-click menu in ProjectMode browser preview.

---

## Titlebar / Menubar Modifications

**Purpose:** Expose menubar focus state changes so ProjectMode can pause browser preview when menus open (WebContentsView renders on top of HTML menus).

| File | Change | Reason |
|------|--------|--------|
| `src/vs/workbench/browser/parts/titlebar/titlebarPart.ts` | Added `onMenubarFocusStateChange: Event<boolean>` to `ITitlebarPart` interface and `BrowserTitlebarPart` class | Expose event when custom HTML menubar opens/closes |
| `src/vs/workbench/browser/parts/titlebar/titlebarPart.ts` | In `installMenubar()`: Added listener `this.customMenubar.value.onFocusStateChange(focused => this._onMenubarFocusStateChange.fire(focused))` | Wire up menubar focus events to titlebar part |
| `src/vs/workbench/browser/parts/titlebar/titlebarPart.ts` | In `BrowserTitleService`: Added `onMenubarFocusStateChange` property assignment from `mainPart` | Expose event through service |

**Roopik Service (NOT in VSCode core - lives in our project):**

| File | Purpose |
|------|---------|
| `src/vs/workbench/contrib/roopik/browser/services/menubarStateService.ts` | Service that listens to `ITitleService.onMenubarFocusStateChange` and exposes `onDidOpenMenu`/`onDidCloseMenu` events for browser pause detection |

**Usage in Roopik:**
- `src/vs/workbench/contrib/roopik/browser/projectMode/editor.ts` subscribes to `IMenubarStateService.onDidOpenMenu/onDidCloseMenu` to pause/resume browser when menus open
- Service is registered via import in `roopik.contribution.ts`

---

## Content Security Policy (CSP) Modifications

**Purpose:** Allow favicon loading from local development servers (Vite, React dev server, etc.) in ProjectMode browser preview.

| File | Lines | Change | Reason |
|------|-------|--------|--------|
| `src/vs/code/electron-browser/workbench/workbench.html` | 19-20 | Added `http://127.0.0.1:*` and `http://localhost:*` to `img-src` directive | Allow favicon images from local dev servers |
| `src/vs/code/electron-browser/workbench/workbench-dev.html` | 19-20 | Added `http://127.0.0.1:*` and `http://localhost:*` to `img-src` directive | Allow favicon images from local dev servers |

**Change Details:**

Original CSP `img-src` directive:
```html
img-src
    'self'
    data:
    blob:
    vscode-remote-resource:
    vscode-managed-remote-resource:
    https:
;
```

Modified CSP `img-src` directive:
```html
img-src
    'self'
    data:
    blob:
    vscode-remote-resource:
    vscode-managed-remote-resource:
    https:
    http://127.0.0.1:*
    http://localhost:*
;
```

**Why needed?** When users preview local projects (e.g., Vite at `http://127.0.0.1:5173`), the browser tab favicon is loaded from the dev server. Without this CSP exception, favicon requests are blocked and show console errors like:
```
Loading the image 'http://127.0.0.1:5173/favicon.ico' violates the Content Security Policy directive: 'img-src ...'
```
