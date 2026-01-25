# Windows Evaluation Setup Guide

This document outlines all the fixes needed to run the Roo Code evaluation system on Windows.

## Prerequisites

1. **Docker Desktop** - Required for PostgreSQL and Redis
2. **Node.js** - v20.19.2 or compatible
3. **pnpm** - Package manager
4. **Git Bash** or similar Unix-like shell

## Required Fixes

### 1. Database Setup

Start the required services:

```bash
cd packages/evals
docker compose up -d db redis
```

### 2. Clone Evaluation Repository

The evaluation exercises need to be cloned locally:

```bash
cd extensions/roopik-roo
git clone https://github.com/RooCodeInc/Roo-Code-Evals.git evals
```

### 3. Environment Configuration

Create `packages/evals/.env.local`:

```env
OPENROUTER_API_KEY=your_api_key_here
HOST_EXECUTION_METHOD=cli
```

**Important**: Use `cli` execution method on Windows (not `docker` or `vscode`).

### 4. Build System Fixes

#### 4.1 Build the `@roo-code/build` Package

```bash
pnpm --filter @roo-code/build build
```

#### 4.2 Fix esbuild.mjs Import Path

In `esbuild.mjs`, change the import to use a direct path:

```javascript
// Before:
import { copyPaths, copyWasms, copyLocales, setupLocaleWatcher } from "@roo-code/build"

// After:
import { copyPaths, copyWasms, copyLocales, setupLocaleWatcher } from "./packages/build/dist/index.js"
```

#### 4.3 Update @roo-code/build package.json

In `packages/build/package.json`, add proper exports:

```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

#### 4.4 Build the Extension Bundle

```bash
pnpm bundle
```

### 5. CLI Fixes

#### 5.1 Add CLI Export to @roo-code/core

In `packages/core/package.json`:

```json
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./browser": {
      "types": "./src/browser.ts",
      "default": "./src/browser.ts"
    },
    "./cli": {
      "types": "./src/cli.ts",
      "default": "./src/cli.ts"
    }
  }
}
```

#### 5.2 Update CLI Start Script

In `apps/cli/package.json`:

```json
{
  "scripts": {
    "start": "tsx src/index.ts"
  }
}
```

#### 5.3 Fix Version Path

In `apps/cli/src/lib/utils/version.ts`:

```typescript
const packageJson = require("../../../package.json")
```

#### 5.4 Fix Extension Path Detection

In `apps/cli/src/lib/utils/extension.ts`, implement upward search for monorepo root:

```typescript
export function getDefaultExtensionPath(dirname: string): string {
  if (process.env.ROO_EXTENSION_PATH) {
    const envPath = process.env.ROO_EXTENSION_PATH
    if (fs.existsSync(path.join(envPath, "extension.js"))) {
      return envPath
    }
  }

  // Search upward for monorepo root
  let currentDir = dirname
  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, "package.json")
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
        if (pkg.name === "roodio") {
          const distPath = path.join(currentDir, "dist")
          if (fs.existsSync(path.join(distPath, "extension.js"))) {
            return distPath
          }
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
    currentDir = path.dirname(currentDir)
  }

  const packagePath = path.resolve(dirname, "../extension")
  return packagePath
}
```

### 6. Ripgrep Setup

#### 6.1 Add Ripgrep to Root Dependencies

In root `package.json`:

```json
{
  "dependencies": {
    "@vscode/ripgrep": "^1.15.9"
  }
}
```

#### 6.2 Install and Build Ripgrep

```bash
pnpm install -w @vscode/ripgrep
node node_modules/@vscode/ripgrep/lib/postinstall.js
```

### 7. Evaluation Runner Fixes

#### 7.1 Set Execution Method to CLI

In `packages/evals/src/cli/runCi.ts`:

```typescript
const run = await createRun({
  model: "anthropic/claude-sonnet-4",
  executionMethod: "cli",  // Use CLI instead of vscode
  socketPath: "",
  concurrency,
})
```

#### 7.2 Fix Shell Execution

In `packages/evals/src/cli/runTaskInVscode.ts`:

```typescript
const subprocess = execa({ env, shell: true, cancelSignal })`${codeCommand}`
```

#### 7.3 Add __dirname for ESM

In `packages/evals/src/cli/runTaskInCli.ts`:

```typescript
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
```

#### 7.4 Set ROO_CLI_ROOT Environment Variable

In `packages/evals/src/cli/runTaskInCli.ts`:

```typescript
const env: Record<string, string> = {
  ...(process.env as Record<string, string>),
  ROO_CODE_IPC_SOCKET_PATH: ipcSocketPath,
  ROO_CLI_ROOT: "C:\\Users\\Humblebee\\Documents\\GitHub\\roopik\\extensions\\roopik-roo",
}
```

**Note**: You may need to adjust this path to your actual monorepo root.

### 8. Error Handling

In `packages/evals/src/cli/processTask.ts`, add detailed error logging:

```typescript
} catch (err: any) {
  logger.error(`Task ${task.id} failed with error:`, err)
  if (err.stack) {
    logger.error(err.stack)
  }
  throw err
}
```

## Running Evaluations

Once all fixes are applied:

```bash
cd packages/evals
pnpm cli --ci
```

## Common Issues

### Issue: "Extension bundle not found"
**Solution**: Run `pnpm bundle` from the root directory

### Issue: "Could not find ripgrep binary"
**Solution**: Run `node node_modules/@vscode/ripgrep/lib/postinstall.js`

### Issue: "ERR_MODULE_NOT_FOUND"
**Solution**: Ensure all packages are built (`pnpm --filter @roo-code/build build`)

### Issue: VS Code windows opening everywhere
**Solution**: Make sure `HOST_EXECUTION_METHOD=cli` in `.env.local`

## Performance Notes

- The CLI execution method is **much faster** than Docker on Windows
- Each evaluation task can consume significant API credits
- Consider setting a lower concurrency value to control costs
- The default timeout is 5 minutes per task

## Future Improvements

1. Make `ROO_CLI_ROOT` path detection automatic
2. Add a setup script to automate all these fixes
3. Create a Windows-specific Docker configuration
4. Add cost estimation before running evaluations
