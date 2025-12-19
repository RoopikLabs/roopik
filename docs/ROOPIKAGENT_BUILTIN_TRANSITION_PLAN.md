# RoopikAgent Built-in Extension Transition Plan

**Goal**: Convert roopik-agent from dev-mode extension to auto-loading built-in extension (like GitHub Copilot Chat in VSCode)

**Current Status**: ✅ Extension works in dev mode with `--extensionDevelopmentPath`

**Target Status**: Extension auto-loads when Roopik IDE starts (no dev flag needed)

---

## Architecture Overview

### Current Structure (Dev Mode)
```
extensions/roopik-agent/
├── package.json              # Monorepo root (pnpm workspace)
├── pnpm-workspace.yaml       # Monorepo config
├── src/
│   ├── package.json          # Extension manifest (MAIN ONE)
│   ├── extension.ts          # Entry point
│   ├── dist/
│   │   └── extension.js      # Bundled extension (output)
│   └── ...                   # Extension source code
├── webview-ui/
│   ├── package.json          # React UI
│   ├── build/                # Vite build output
│   └── ...
└── packages/
    ├── types/                # Shared types
    ├── ipc/                  # IPC utilities
    ├── cloud/ (REMOVE)       # Cloud services
    └── telemetry/ (REMOVE)   # Telemetry
```

### Target Structure (Built-in)
```
extensions/roopik-agent/
├── package.json              # Extension manifest (simplified)
├── extension.ts              # Entry point
├── dist/
│   └── extension.js          # Bundled output
├── out/                      # Compiled TypeScript (for watch mode)
│   └── extension.js
├── webview/                  # React UI
│   └── build/                # Vite output
└── tsconfig.json             # Standard VSCode extension config
```

---

## Transition Plan (3 Phases)

### **Phase 1: Restructure to Standard VSCode Extension** (Week 1)
**Goal**: Flatten monorepo into standard VSCode extension structure

#### 1.1 Move Extension Files to Root
```bash
# Move src/ contents to root
extensions/roopik-agent/
  ├── src/package.json          → package.json
  ├── src/extension.ts          → extension.ts
  ├── src/core/                 → core/
  ├── src/api/                  → api/
  ├── src/services/             → services/
  ├── src/integrations/         → integrations/
  └── src/tsconfig.json         → tsconfig.json
```

#### 1.2 Merge Workspace Packages into Extension
```bash
# Merge packages/ into extension root
packages/types/     → types/       (or inline into code)
packages/ipc/       → ipc/         (or inline into code)
packages/cloud/     → DELETE (strip cloud features)
packages/telemetry/ → DELETE (strip telemetry)
```

#### 1.3 Simplify Build System
**Before (pnpm monorepo)**:
```json
// Root package.json
{
  "name": "roo-code",
  "packageManager": "pnpm@10.8.1",
  "scripts": {
    "build": "turbo build",
    "bundle": "turbo bundle"
  }
}

// src/package.json (extension)
{
  "name": "roo-cline",
  "main": "./dist/extension.js",
  "scripts": {
    "bundle": "node esbuild.mjs"
  }
}
```

**After (standard npm)**:
```json
// package.json (single file)
{
  "name": "roopik-agent",
  "displayName": "Roopik Agent",
  "version": "0.1.0",
  "publisher": "roopik",
  "main": "./dist/extension.js",
  "engines": {
    "vscode": "^1.84.0"
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "bundle": "node esbuild.mjs",
    "build": "npm run bundle && npm run build:webview",
    "build:webview": "cd webview && npm run build"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.37.0",
    "@modelcontextprotocol/sdk": "1.12.0",
    // ... (keep only extension deps, remove workspace:^ refs)
  }
}
```

#### 1.4 Update Build Script (esbuild.mjs)
Update `esbuild.mjs` to work without Turbo:
```javascript
// esbuild.mjs
import * as esbuild from 'esbuild';
import * as path from 'path';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const esbuildOptions = {
  entryPoints: ['./extension.ts'],
  bundle: true,
  outfile: './dist/extension.js',
  external: ['vscode'], // Don't bundle vscode module
  format: 'cjs',
  platform: 'node',
  sourcemap: !production,
  minify: production,
  // ... (copy from existing esbuild.mjs)
};

if (watch) {
  const ctx = await esbuild.context(esbuildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(esbuildOptions);
  console.log('Build complete!');
}
```

#### 1.5 Update tsconfig.json
Standard VSCode extension TypeScript config:
```json
{
  "compilerOptions": {
    "module": "Node16",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "./out",
    "sourceMap": true,
    "strict": true,
    "rootDir": ".",
    "moduleResolution": "Node16",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": [
    "**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "out",
    "dist",
    "webview"
  ]
}
```

#### 1.6 Rename References
```bash
# Find and replace throughout codebase
roo-cline        → roopik-agent
roo-code         → roopik-agent
RooVeterinaryInc → roopik
```

**Files to update**:
- `package.json` (name, displayName, publisher, IDs)
- `extension.ts` (command IDs, view IDs)
- All source files (imports, references)
- `webview/` (IPC message types, API calls)

---

### **Phase 2: Register in VSCode Build System** (Week 1)

#### 2.1 Add to Gulp Compilation List
**File**: `build/gulpfile.extensions.ts`

Add at line 36 (after roopik):
```typescript
const compilations = [
  'extensions/roopik/tsconfig.json',
  'extensions/roopik-agent/tsconfig.json', // ← ADD THIS
  'extensions/configuration-editing/tsconfig.json',
  // ...
];
```

This enables:
- `npm run watch` auto-compiles roopik-agent
- `npm run compile-extensions` includes roopik-agent

#### 2.2 Add Custom Build Hook for Webview + Bundle
**File**: `build/gulpfile.extensions.ts`

Add at end of file (after line 189):
```typescript
import * as roopikAgent from './lib/roopik-agent.ts';

// Roopik Agent: Custom build task (pnpm monorepo → standard extension)
const buildRoopikAgentTask = task.define('build-roopik-agent', async () => {
  await roopikAgent.build();
});

const cleanRoopikAgentTask = task.define('clean-roopik-agent', async () => {
  await roopikAgent.clean();
});

gulp.task(buildRoopikAgentTask);
gulp.task(cleanRoopikAgentTask);

// Add to main compile task
export const compileExtensionsTaskWithRoopikAgent = task.define(
  'compile-extensions-with-roopik-agent',
  task.series(buildRoopikAgentTask, compileExtensionsTask)
);
gulp.task(compileExtensionsTaskWithRoopikAgent);
```

#### 2.3 Update Root Build Scripts
**File**: `package.json` (root)

Update scripts to include roopik-agent:
```json
{
  "scripts": {
    "compile": "...",
    "compile-extensions": "gulp compile-extensions-with-roopik-agent",
    "watch": "npm run watch-with-roopik-agent",
    // ...
  }
}
```

#### 2.4 Test Build Integration
```bash
# Test TypeScript compilation
npm run compile-extensions

# Test watch mode
npm run watch

# Launch Roopik
.\scripts\code.bat
```

**Expected**: Roopik Agent icon appears in Activity Bar automatically (no `--extensionDevelopmentPath` needed)

---

### **Phase 3: Strip Cloud/Telemetry Features** (Week 2)

#### 3.1 Remove Cloud Package References
**Files to update**:
- `extension.ts` - Remove cloud imports
- `api/providers/roo.ts` - Remove CloudService
- `core/task/Task.ts` - Remove BridgeOrchestrator
- `core/webview/ClineProvider.ts` - Remove cloud dependencies

**Before**:
```typescript
import { CloudService, BridgeOrchestrator } from "@roo-code/cloud";

export class RooProvider {
  constructor(private cloudService: CloudService) {}

  async makeRequest() {
    if (this.cloudService.isConnected()) {
      // Use cloud
    }
  }
}
```

**After**:
```typescript
// Remove cloud import entirely

export class RooProvider {
  constructor() {} // No cloud service

  async makeRequest() {
    // Only local API calls
  }
}
```

#### 3.2 Remove Cloud Commands
**File**: `package.json`

Remove from `contributes.commands`:
```json
{
  "command": "roo-cline.cloudButtonClicked",  // REMOVE
  "title": "%command.cloud.title%",
  "icon": "$(cloud)"
}
```

Remove from `contributes.menus`:
```json
{
  "command": "roo-cline.cloudButtonClicked",  // REMOVE
  "group": "navigation@3",
  "when": "view == roo-cline.SidebarProvider"
}
```

#### 3.3 Remove Dependencies
**File**: `package.json`

Remove:
```json
{
  "dependencies": {
    "@roo-code/cloud": "workspace:^",        // REMOVE
    "@roo-code/telemetry": "workspace:^",    // REMOVE
    "socket.io-client": "^4.8.1",            // REMOVE (cloud)
    "jwt-decode": "^4.0.0",                  // REMOVE (cloud auth)
    "pkce-challenge": "^5.0.0",              // REMOVE (OAuth)
    "reconnecting-eventsource": "^1.6.4",    // REMOVE (cloud)
    "ioredis": "^5.6.1",                     // REMOVE (cloud)
    "posthog-node": "^5.0.0"                 // REMOVE (telemetry)
  }
}
```

#### 3.4 Remove Cloud UI Components
**Files**:
- `webview-ui/src/components/settings/CloudSettings.tsx` - Delete
- `webview-ui/src/components/toolbar/CloudButton.tsx` - Delete
- `webview-ui/src/api/cloudApi.ts` - Delete

Update toolbar to remove cloud button:
```typescript
// Before
<Toolbar>
  <NewChatButton />
  <SettingsButton />
  <CloudButton />      {/* REMOVE */}
  <MarketplaceButton />
</Toolbar>

// After
<Toolbar>
  <NewChatButton />
  <SettingsButton />
  <MarketplaceButton />
</Toolbar>
```

#### 3.5 Remove Telemetry Calls
Search for telemetry calls:
```bash
grep -r "telemetry" extensions/roopik-agent --include="*.ts" --include="*.tsx"
```

Remove:
```typescript
// Before
import { telemetry } from './services/telemetry';

telemetry.track('task_started', { model: 'claude-sonnet-4.5' });

// After
// Delete entirely (no telemetry)
```

#### 3.6 Test Clean Build
```bash
cd extensions/roopik-agent
rm -rf node_modules
npm install
npm run build

# Launch Roopik
cd ../..
.\scripts\code.bat
```

**Verify**:
- ✅ Extension loads without errors
- ✅ No cloud button in UI
- ✅ Agent works locally (Anthropic API key only)
- ✅ No network calls to roocode.com

---

## File Changes Summary

### Files to Move
```
extensions/roopik-agent/src/package.json → extensions/roopik-agent/package.json
extensions/roopik-agent/src/extension.ts → extensions/roopik-agent/extension.ts
extensions/roopik-agent/src/**/*.ts      → extensions/roopik-agent/**/*.ts
extensions/roopik-agent/webview-ui/      → extensions/roopik-agent/webview/
```

### Files to Delete
```
extensions/roopik-agent/packages/cloud/
extensions/roopik-agent/packages/telemetry/
extensions/roopik-agent/packages/evals/
extensions/roopik-agent/apps/
extensions/roopik-agent/pnpm-workspace.yaml
extensions/roopik-agent/turbo.json
extensions/roopik-agent/.changeset/
extensions/roopik-agent/.husky/
```

### Files to Create
```
build/lib/roopik-agent.ts (already created ✅)
docs/ROOPIKAGENT_BUILTIN_TRANSITION_PLAN.md (this file ✅)
```

### Files to Update
```
build/gulpfile.extensions.ts (add roopik-agent compilation)
extensions/roopik-agent/package.json (flatten from monorepo)
extensions/roopik-agent/tsconfig.json (standard VSCode config)
extensions/roopik-agent/extension.ts (remove cloud imports)
extensions/roopik-agent/esbuild.mjs (simplify build)
```

---

## Testing Checklist

### Phase 1 Testing
- [ ] Extension structure is flat (no src/ folder)
- [ ] `npm install` works (no pnpm needed)
- [ ] `npm run compile` produces `out/extension.js`
- [ ] `npm run bundle` produces `dist/extension.js`
- [ ] `npm run build:webview` produces `webview/build/`
- [ ] Dev mode still works: `.\scripts\code.bat --extensionDevelopmentPath=extensions\roopik-agent`

### Phase 2 Testing
- [ ] `npm run watch` auto-compiles roopik-agent on save
- [ ] `npm run compile-extensions` includes roopik-agent
- [ ] `.\scripts\code.bat` loads roopik-agent automatically (NO dev flag)
- [ ] Roopik Agent icon appears in Activity Bar
- [ ] Extension shows in "Extensions: Show Running Extensions"

### Phase 3 Testing
- [ ] No cloud imports in codebase
- [ ] No cloud button in UI
- [ ] Agent works with local Anthropic API key
- [ ] No network calls to roocode.com (check DevTools Network tab)
- [ ] Extension size reduced (no cloud/telemetry deps)

---

## Timeline

| Week | Phase | Tasks | Outcome |
|------|-------|-------|---------|
| **Week 1** | Phase 1 | Restructure extension, flatten monorepo | Standard VSCode extension structure |
| **Week 1** | Phase 2 | Register in build system | Auto-loads with Roopik |
| **Week 2** | Phase 3 | Strip cloud/telemetry | Local-only agent |

**Total Time**: 1-2 weeks

---

## Next Steps

1. **Start with Phase 1**: Restructure roopik-agent to standard extension format
2. **Test incrementally**: After each phase, verify extension still works
3. **Preserve git history**: Commit after each major change
4. **Document changes**: Update ROOPIKAGENT_FORK_NOTES.md

**Ready to begin?** Start with Phase 1.1 (moving files from `src/` to root).

---

## Optional: Keep Monorepo (Alternative Approach)

If you want to keep the monorepo structure (less work, but non-standard):

**Pros**:
- ✅ Minimal restructuring
- ✅ Easier to sync upstream Roo Code updates
- ✅ Keep existing build system

**Cons**:
- ❌ Non-standard VSCode extension structure
- ❌ Requires pnpm (extra dependency)
- ❌ More complex build integration

**Implementation**:
1. Keep current structure as-is
2. Add custom Gulp task that runs `pnpm --filter roo-cline bundle`
3. Register in `build/gulpfile.extensions.ts`
4. Extension auto-loads, but with monorepo complexity

**Recommendation**: Go with standard structure (flatten monorepo) for cleaner integration and easier maintenance.
