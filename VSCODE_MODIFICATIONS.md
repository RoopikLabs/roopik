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
