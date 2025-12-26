# Roo Integration Steps

## Step 1: Copy Roo-Code As-Is (in your extension Root folder)
- src/
- webview-ui/
- packages/
- tsconfig.json

## Step 2: Build Configuration

### esbuild.mjs
- Output: `dist/` (root level, not `src/dist/`)
- Copy assets: `["src/assets", "assets"]` → `dist/assets/`
- Copy webview: `["webview-ui/build", "webview-ui/build"]` → `dist/webview-ui/build/`
- Copy audio: `["webview-ui/audio", "webview-ui/audio"]` → `dist/webview-ui/audio/`

### webview-ui/package.json
- Build script: `"build": "vite build"` (skip `tsc -b` to avoid csstype mismatch)
- vite.config.ts outDir: `./build` (relative to webview-ui/)

### webview-ui/vite.config.ts
- outDir: `./build` (outputs to webview-ui/build/)

## Step 3: ClineProvider.ts Paths
- All asset URIs point to `dist/` (not `src/`)
- `["dist", "webview-ui", "build", "assets", "index.css"]`
- `["dist", "assets", "codicons", "codicon.css"]`
- `["dist", "assets", "images"]`
- `["dist", "assets", "vscode-material-icons", "icons"]`
- `["dist", "webview-ui", "audio"]`

## Step 4: package.json
- icon: Points to `src/assets/icons/icon.png`
- All command IDs use `roodio.*` namespace
- main: `dist/extension.js`
- **Package references** (from extension root to root packages):
  - Dependencies: `"@roo-code/cloud": "file:./packages/cloud"`, etc.
  - DevDependencies: `"@roo-code/build": "file:./packages/build"`, etc.
  - Note: Uses `./packages` (same level in monorepo)

## Key Differences: roopik-roo vs roopik-dio
| | roopik-roo | roopik-dio |
|---|---|---|
| Output | `/dist` | `src/dist` |
| Asset paths | `["dist", "assets"]` | `["src", "assets"]` |
| Webview build | Copied to `dist/webview-ui/build/` | Stays at `webview-ui/build/` |


