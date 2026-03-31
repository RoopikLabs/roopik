# Build Troubleshooting Guide

This document covers common build issues and their solutions for the Roopik-Roo extension, especially after rebasing from upstream Roo-Code.

---

## Table of Contents

1. [Common Build Error: Export Not Found](#common-build-error-export-not-found)
2. [Build Order (Important!)](#build-order-important)
3. [Post-Rebase Cleanup Script](#post-rebase-cleanup-script)
4. [Quick Reference Commands](#quick-reference-commands)

---

## Common Build Error: Export Not Found

### Symptom

```
error during build:
"openAiCodexDefaultModelId" is not exported by "../packages/types/src/index.ts"
```

or

```
"OpenAICodex" is not exported by "src/components/settings/providers/index.js"
```

### Root Cause

**Stale compiled `.js` and `.js.map` files** exist in the source directories from previous builds. When you rebase and add NEW TypeScript files, these old `.js` files don't contain the new exports.

Vite/Rollup sometimes picks up the old `.js` files instead of compiling the `.ts` source files, causing import resolution failures.

### Solution

Delete all stale `.js` and `.js.map` files from source directories:

```bash
# From extensions/roopik-roo directory

# Clean packages/types source
find packages/types/src -name "*.js" -delete
find packages/types/src -name "*.js.map" -delete

# Clean webview source
find webview-ui/src -name "*.js" -delete
find webview-ui/src -name "*.js.map" -delete

# Clean main src (if needed)
find src -name "*.js" -delete 2>/dev/null
find src -name "*.js.map" -delete 2>/dev/null
```

---

## Build Order (Important!)

The correct build order must be followed. This is based on the GitHub workflow:

```bash
# 1. Install and build @roo-code/types
cd packages/types
npm install
npm run build

# 2. Install and build @roo-code/build
cd ../build
npm install
npm run build

# 3. Return to extension root and build
cd ../..
npm run build
```

The `npm run build` command in the root will:
1. Clean dist directory
2. Build webview (`cd webview-ui && npm install && npm run build`)
3. Bundle extension (`node esbuild.mjs`)

---

## Post-Rebase Cleanup Script

After rebasing from upstream Roo-Code, run this script to ensure a clean build:

```bash
#!/bin/bash
# save as: scripts/clean-rebuild.sh

echo "🧹 Cleaning stale .js files from source directories..."

# Clean stale compiled files in packages/types/src
find packages/types/src -name "*.js" -delete 2>/dev/null
find packages/types/src -name "*.js.map" -delete 2>/dev/null
echo "✅ Cleaned packages/types/src"

# Clean stale compiled files in webview-ui/src
find webview-ui/src -name "*.js" -delete 2>/dev/null
find webview-ui/src -name "*.js.map" -delete 2>/dev/null
echo "✅ Cleaned webview-ui/src"

# Clean stale compiled files in src (if any)
find src -name "*.js" -delete 2>/dev/null
find src -name "*.js.map" -delete 2>/dev/null
echo "✅ Cleaned src"

echo ""
echo "📦 Building @roo-code/types..."
cd packages/types
npm install
npm run build
cd ../..

echo ""
echo "📦 Building @roo-code/build..."
cd packages/build
npm install
npm run build
cd ../..

echo ""
echo "🔨 Building extension..."
npm run build

echo ""
echo "✅ Build complete!"
```

---

## Quick Reference Commands

### Clean Everything and Rebuild

```bash
# Quick one-liner to clean and rebuild
find packages/types/src webview-ui/src -name "*.js" -o -name "*.js.map" | xargs rm -f && \
cd packages/types && npm i && npm run build && cd ../build && npm i && npm run build && cd ../.. && npm run build
```

### Just Rebuild Webview

```bash
cd webview-ui && npm run build
```

### Just Bundle Extension (skip webview)

```bash
npm run bundle
```

### Check for Stale Files

```bash
# List all .js files in source directories (should be empty for clean state)
find packages/types/src webview-ui/src -name "*.js" 2>/dev/null
```

### Check Build Timestamps

```bash
# Verify dist files are recent
ls -la packages/types/dist/
ls -la webview-ui/build/assets/ | head -5
```

---

## Files That Commonly Cause Issues After Rebase

When upstream Roo-Code adds new features, these files may need attention:

| File | Description |
|------|-------------|
| `packages/types/src/providers/*.ts` | New provider types (e.g., openai-codex.ts) |
| `packages/types/src/providers/index.ts` | Must export new providers |
| `packages/types/src/vscode-extension-host.ts` | Extension state types |
| `webview-ui/src/components/settings/providers/*.tsx` | Provider UI components |
| `webview-ui/src/components/settings/providers/index.ts` | Must export new components |
| `src/api/providers/*.ts` | API handlers for new providers |

---

## Prevention

To prevent stale file issues:

1. **Add to .gitignore** (already done):
   ```
   # packages/types/.gitignore
   src/**/*.js
   src/**/*.js.map
   ```

2. **Always clean before rebuild** after rebasing

3. **Follow the correct build order**

---

## Troubleshooting Checklist

If build fails after rebase:

- [ ] Deleted stale `.js` and `.js.map` from `packages/types/src/`
- [ ] Deleted stale `.js` and `.js.map` from `webview-ui/src/`
- [ ] Ran `npm install` in `packages/types/`
- [ ] Ran `npm run build` in `packages/types/`
- [ ] Ran `npm install` in `packages/build/`
- [ ] Ran `npm run build` in `packages/build/`
- [ ] Ran `npm run build` in extension root
- [ ] Checked for missing dependencies (install if needed)

---

*Last updated: January 2026*
