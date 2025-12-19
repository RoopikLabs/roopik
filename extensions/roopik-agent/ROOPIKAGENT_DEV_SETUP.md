# RoopikAgent (Roo Code Fork) – Dev Setup

Minimal notes for using this fork **inside Roopik**, not for publishing.

## 1. One‑time install

From `extensions/roopik-agent`:

```bash
# Enable pnpm via corepack (once, using your Node install)
corepack enable
corepack prepare pnpm@10.8.1 --activate

# Install monorepo dependencies (Roo)
pnpm install
```

## 2. Build once (extension + webview)

From `extensions/roopik-agent`:

```bash
# Build webview UI (React/Vite)
pnpm --filter @roo-code/vscode-webview build

# Bundle VS Code extension (produces src/dist/extension.js)
pnpm --filter roo-cline bundle
```

This is slow the first time (big React app + WASM assets). Later runs are faster.

## 3. Run Roopik with this extension in dev mode

From Roopik repo root (`c:/Users/Humblebee/Documents/GitHub/roopik` on Windows):

```bash
scripts\code.bat --extensionDevelopmentPath=c:\Users\Humblebee\Documents\GitHub\roopik\extensions\roopik-agent\src
```

Then in the dev Roopik window:

- Look for the **Roo** icon in the Activity Bar.
- Or run **Developer: Show Running Extensions** and check for `RooVeterinaryInc.roo-cline`.

## 4. Optional: Rebuild after code changes

If you modify only the **extension backend** (`extensions/roopik-agent/src`):

```bash
cd extensions/roopik-agent
pnpm --filter roo-cline bundle
```

If you also change the **webview UI** (`extensions/roopik-agent/webview-ui`):

```bash
cd extensions/roopik-agent
pnpm --filter @roo-code/vscode-webview build
pnpm --filter roo-cline bundle
```

## 5. Ignore HMR warning

You may see: `Local development server is not running, HMR will not work.`

We are using **static builds**, so this is expected. As long as the panel renders, you can ignore this warning.
