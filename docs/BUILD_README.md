# Build Guide


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

# Or from webview/ directory directly
cd webview
npm run build    # Build webview
npm run dev      # Watch webview
```

----
----

## Commands

| Command | Cleans? | Watches? | Time |
|---------|---------|----------|------|
| `npm run watch` | YES | YES | ~10 min start |
| `npm run watch-client` | YES | YES | ~10 min start |
| `npm run compile` | YES | NO | ~10 min |
| `npm run compile-build` | YES | NO | ~10 min |
| `npm run compile-extensions` | YES | NO | ~1-2 min |
| `npx tsc -p src/tsconfig.json --incremental` | NO | NO | ~30 sec |
| `npx tsc -p src/tsconfig.json --incremental --watch` | NO | YES | ~1 sec/change |

## Daily Development (Project Already Built)

### Watch Without Cleaning (Best Option)

```bash
npx tsc -p src/tsconfig.json --incremental --watch
```

- Does NOT clean old build
- Watches for changes
- Rebuilds only changed files (~1-2 sec)

### One-Shot Build Without Cleaning

```bash
npx tsc -p src/tsconfig.json --incremental
```

### Launch VSCode

```bash
.\scripts\code.bat
```

## When to Use What

| Situation | Command |
|-----------|---------|
| Project built, want to watch | `npx tsc -p src/tsconfig.json --incremental --watch` |
| Project built, quick one-shot | `npx tsc -p src/tsconfig.json --incremental` |
| Fresh start / corrupted build | `npm run compile` |

## The Truth

**ALL npm run commands clean first!**

Only `npx tsc` with `--incremental` preserves the old build.
