# Integration Guide - New Webview Structure

## Overview
This guide shows how to integrate the new React-based webview structure into the extension.

## Changes Needed

### 1. Update `canvasPanel.ts`

**Location:** Line 161-164

**Current code:**
```typescript
localResourceRoots: [
    vscode.Uri.joinPath(extensionUri, 'out'),
    vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build')
]
```

**Change to:**
```typescript
localResourceRoots: [
    vscode.Uri.joinPath(extensionUri, 'out'),
    vscode.Uri.joinPath(extensionUri, 'webview', 'build')  // Changed from webview-ui to webview
]
```

**Location:** Line 877-882 (in `_getHtmlForWebview` method)

**Current code:**
```typescript
const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build', 'assets', 'index.js')
);
const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build', 'assets', 'index.css')
);
```

**Change to:**
```typescript
const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this.extensionUri, 'webview', 'build', 'assets', 'componentView.js')
);
const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this.extensionUri, 'webview', 'build', 'assets', 'componentView.css')
);
```

---

### 2. Update `projectPreviewPanel.ts`

**Find the `_getHtmlForWebview` method** (around line 330)

**Current:** Loads `projectPreviewTemplate.html`

**Change to:** Load the new React-based ProjectView

```typescript
private _getHtmlForWebview(_webview: vscode.Webview) {
    try {
        // Load the built ProjectView HTML
        const projectViewHtmlPath = path.join(__dirname, '..', 'webview', 'build', 'projectView.html');
        let html = fs.readFileSync(projectViewHtmlPath, 'utf8');

        // Inject server URL and loading state
        html = html.replace(/window\.VITE_SERVER_URL\s*=\s*undefined/g,
            `window.VITE_SERVER_URL = "${this._viteServerUrl || ''}"`);
        html = html.replace(/window\.INITIAL_LOADING\s*=\s*undefined/g,
            `window.INITIAL_LOADING = ${!this._viteServerUrl}`);

        // Update asset paths to use webview URIs
        html = html.replace(/src="\/assets\//g, `src="${_webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'build', 'assets')
        )}/`);
        html = html.replace(/href="\/assets\//g, `href="${_webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'build', 'assets')
        )}/`);

        return html;
    } catch (error) {
        this._logger.error('Failed to load ProjectView HTML', error);
        return '<html><body>Error loading preview</body></html>';
    }
}
```

---

### 3. Build Process

The build scripts in `package.json` are already updated to build both webview folders.

**To build:**
```bash
npm run build
```

This will:
1. Compile TypeScript (`tsc`)
2. Copy assets (`copyAssets.js`)
3. Build webview-ui (old structure - for backward compatibility)
4. Build webview (new structure - ComponentView + ProjectView)

---

### 4. Testing

1. **Build everything:**
   ```bash
   npm run build
   ```

2. **Press F5** to launch extension

3. **Test ComponentView (Mode 1):**
   - Open Roopik Canvas
   - Should load from `webview/build/componentView.html`

4. **Test ProjectView (Mode 2):**
   - Open Project Preview
   - Should load from `webview/build/projectView.html`
   - BottomActionBar should appear when EDIT mode is enabled

---

## Benefits

✅ **Single source of truth** - BottomActionBar is shared between both modes
✅ **No manual syncing** - Update once, both modes get it
✅ **TypeScript everywhere** - Better type safety
✅ **Easier maintenance** - React components instead of HTML/JS

---

## Rollback

If something goes wrong, you can always revert to the old structure by changing the paths back to `webview-ui`.

---

## File Structure

```
webview/
├── build/                    # Built files (generated)
│   ├── componentView.html
│   ├── projectView.html
│   └── assets/
│       ├── componentView.js
│       ├── componentView.css
│       ├── projectView.js
│       ├── projectView.css
│       ├── BottomActionBar.js
│       └── BottomActionBar.css
│
└── src/
    ├── componentView/        # Mode 1 - Canvas
    ├── projectView/          # Mode 2 - Project Preview
    └── components/           # Shared (BottomActionBar, etc.)
```

---

## Notes

- The old `webview-ui` folder can remain for now (backward compatibility)
- Once tested and working, we can remove `webview-ui`
- The new structure is cleaner and more maintainable
