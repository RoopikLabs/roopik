# Build Commands

## VS Code Editor Build

**Build whole VS Code editor:**

```bash
# From roopik root directory
npm run compile
```

**For native modules (terminal, etc.) or after pulling upstream changes:**

```bash
# From roopik root directory
npm run postinstall
```

This rebuilds native modules like `node-pty` for Electron.

---

## Roopik Extension Build

**All commands run from `extensions/roopik/` directory**

### Quick Start

```bash
# Build everything (extension + webview)
npm run build

# Watch everything (extension + webview) - for development
npm run watch:all
```

### Individual Builds

```bash
# Extension only
npm run build:extension
npm run watch

# Webview only (from extensions/roopik/)
npm run build:webview
npm run watch:webview

# Or from webview-ui/ directory directly
cd webview-ui
npm run build    # Build webview
npm run dev      # Watch webview
```

## Output Directories

- Extension: `out/`
- Webview: `webview-ui/build/`

