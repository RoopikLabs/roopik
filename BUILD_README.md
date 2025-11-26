# 🚀 Build Guide

## Daily Development (Fast)

```bash
# Terminal 1: Watch mode (auto-rebuilds on save, ~5 sec)
npm run watch

# Terminal 2: Launch VSCode
.\scripts\code.bat
```

## Manual Rebuild

```bash
# Incremental build (only changed files)
npm run compile-build

# Extensions only
npm run compile-extensions
```

## Full Rebuild (Rarely Needed)

```bash
npm run compile  # ~10 min (only if build corrupted)
```

**Rule**: Use `npm run watch` for daily dev. Never run full `npm run compile` unless absolutely necessary!
