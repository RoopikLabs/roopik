# Terminal Output Capture: Architecture Decision & Justification

## 🎯 Executive Summary

**Decision**: Use **child_process with stdout/stderr capture** + **Vite logger interception** via IPC messages.

**Why**: This is the **proven VS Code pattern** used throughout the codebase. It works for ALL terminal commands, maintains process isolation, and scales to any tool.

**Evidence**: VS Code source code uses this exact pattern for Extension Host, terminal processes, and all child processes.

---

## 📚 Evidence from VS Code Source Code

### Pattern 1: Extension Host Process (Proven Pattern)

**File**: `src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts`

```typescript
// VS Code's ACTUAL implementation
const onStdout = this._handleProcessOutputStream(
  this._extensionHostProcess.onStdout,
  this._toDispose
);
const onStderr = this._handleProcessOutputStream(
  this._extensionHostProcess.onStderr,
  this._toDispose
);

// Combine and debounce
const onOutput = Event.any(
  Event.map(onStdout.event, o => ({ data: `%c${o}`, format: [''] })),
  Event.map(onStderr.event, o => ({ data: `%c${o}`, format: ['color: red'] }))
);

// Process output
this._toDispose.add(onDebouncedOutput(output => {
  // Handle output
}));
```

**Key Points**:
- ✅ Uses `child_process` with `fork()`
- ✅ Captures stdout/stderr via event listeners
- ✅ Uses VS Code's Event system for debouncing
- ✅ This is the **official VS Code pattern**

### Pattern 2: Extension Lifecycle Hooks

**File**: `src/vs/platform/extensionManagement/node/extensionLifecycle.ts`

```typescript
// VS Code's ACTUAL implementation
const extensionUninstallProcess = fork(uninstallHook, args, {
  silent: true,
  execArgv: undefined
});

// Set encoding
extensionUninstallProcess.stdout!.setEncoding('utf8');
extensionUninstallProcess.stderr!.setEncoding('utf8');

// Convert Node events to VS Code events
const onStdout = Event.fromNodeEventEmitter<string>(
  extensionUninstallProcess.stdout!,
  'data'
);
const onStderr = Event.fromNodeEventEmitter<string>(
  extensionUninstallProcess.stderr!,
  'data'
);

// Log to LogService
this._register(onStdout(data =>
  this.logService.info(extension.id, data)
));
this._register(onStderr(data =>
  this.logService.error(extension.id, data)
));
```

**Key Points**:
- ✅ Uses `fork()` with `silent: true`
- ✅ Sets encoding to `'utf8'`
- ✅ Converts Node events to VS Code events
- ✅ Logs to centralized LogService

### Pattern 3: Test Output Scanner

**File**: `.vscode/extensions/vscode-selfhost-test-provider/src/testOutputScanner.ts`

```typescript
// VS Code's ACTUAL implementation
constructor(private readonly process: ChildProcessWithoutNullStreams) {
  process.stdout.pipe(new StreamSplitter(LF)).on('data', this.processData);
  process.stderr.pipe(new StreamSplitter(LF)).on('data', this.processData);
  process.on('error', e => this.onExitEmitter.fire(e.message));
  process.on('exit', code =>
    this.onExitEmitter.fire(code ? `Process exited with code ${code}` : undefined)
  );
}
```

**Key Points**:
- ✅ Uses `pipe()` with `StreamSplitter` for line-by-line processing
- ✅ Handles both stdout and stderr
- ✅ Handles process errors and exit codes

---

## 🔍 Why We Can't Use `npm run dev` Directly

### Problem Statement

**User's Concern**: "We can't let npm run dev directly by the AI agent because that'll not start the project in our iframe rather that'll start in users system local, we don't have features."

### Analysis

**Correct Assessment**: Running `npm run dev` directly would:
1. ❌ Start server in user's system (not controlled by us)
2. ❌ No plugin injection (no click-to-source, no auth middleware)
3. ❌ No iframe integration (can't control the preview)
4. ❌ No error capture (can't intercept logs)

**Our Current Architecture** (Correct):
```
Extension → fork(serverWorker.js) → Vite.createServer() → localhost:5173
                ↓
         Our plugins injected
         Our auth middleware
         Our click-to-source
```

**If We Used `npm run dev`** (Wrong):
```
Extension → spawn('npm', ['run', 'dev']) → User's Vite → localhost:5173
                ↓
         NO plugins
         NO middleware
         NO control
```

**Conclusion**: We MUST use programmatic API to inject our plugins. This is non-negotiable.

---

## ✅ Solution: Hybrid Approach (Proven + Custom)

### Architecture

```
Extension (Node.js)
    ↓ fork()
Worker Process (serverWorker.js)
    ↓
Vite.createServer() [Programmatic API]
    ↓
Custom Logger → IPC → Extension
    ↓
stdout/stderr → Extension (via existing capture)
```

### Why This Works

1. **Keeps Programmatic API**: We maintain plugin injection
2. **Captures Vite Logs**: Via custom logger + IPC
3. **Captures Worker Logs**: Via stdout/stderr (already working)
4. **Scales to All Commands**: Same pattern for npm install, build, etc.

---

## 🔧 Implementation: Vite Logger Interception

### Vite's Logger API

Vite's `createServer()` accepts a `logger` option:

```typescript
// From Vite source code (vite/src/node/logger.ts)
interface Logger {
  info(msg: string, options?: LogOptions): void;
  warn(msg: string, options?: LogOptions): void;
  warnOnce(msg: string, options?: LogOptions): void;
  error(msg: string, options?: LogErrorOptions): void;
  clearScreen(type: LogType): void;
  hasErrorLogged(error: Error | RollupError): boolean;
  hasWarned: boolean;
}
```

### Our Implementation

**File**: `serverWorker.js`

```javascript
// Custom logger that forwards to parent via IPC
const customLogger = {
  info(msg, options) {
    console.log(`[Vite] ${msg}`); // Still log to stdout
    process.send({
      type: 'VITE_LOG',
      level: 'info',
      message: msg,
      timestamp: Date.now()
    });
  },
  warn(msg, options) {
    console.warn(`[Vite] ${msg}`);
    process.send({
      type: 'VITE_LOG',
      level: 'warn',
      message: msg,
      timestamp: Date.now()
    });
  },
  error(msg, options) {
    console.error(`[Vite] ${msg}`);
    process.send({
      type: 'VITE_LOG',
      level: 'error',
      message: msg,
      timestamp: Date.now()
    });
  },
  clearScreen() {
    // No-op or forward if needed
  },
  hasErrorLogged() {
    return false;
  },
  hasWarned: false
};

// Use in createServer
const server = await createServer({
  root: root,
  configFile: configPath,
  logger: customLogger, // <-- Intercept Vite's logs
  // ... rest of config
});
```

### Extension Side: Capture IPC Logs

**File**: `viteServerManager.ts`

```typescript
// Already capturing stdout/stderr
this.workerProcess.stdout?.on('data', (data) => {
  this.outputChannel.append(data.toString());
});

// ADD: Capture IPC logs from Vite logger
this.workerProcess.on('message', (msg: any) => {
  if (msg.type === 'VITE_LOG') {
    // Forward to output channel
    this.outputChannel.append(`[${msg.level.toUpperCase()}] ${msg.message}\n`);

    // Forward to AI agent (if active)
    this.aiAgent?.receiveLog({
      level: msg.level,
      message: msg.message,
      timestamp: msg.timestamp,
      source: 'vite'
    });
  } else if (msg.type === 'READY') {
    // Existing ready handler
  } else if (msg.type === 'ERROR') {
    // Existing error handler
  }
});
```

---

## 🎯 Why This Architecture is Resilient

### 1. **Proven Pattern**
- ✅ Used by VS Code itself (Extension Host, terminals, etc.)
- ✅ Battle-tested in production
- ✅ Handles edge cases (process crashes, encoding, buffering)

### 2. **Process Isolation**
- ✅ Worker runs in separate process (can't crash extension)
- ✅ Uses IPC for communication (safe, structured)
- ✅ Can be killed/restarted independently

### 3. **Complete Log Capture**
- ✅ **Worker logs**: Captured via stdout/stderr (already working)
- ✅ **Vite logs**: Captured via custom logger + IPC (new)
- ✅ **npm logs**: Would be captured if we spawn npm commands
- ✅ **Framework logs**: Captured via Vite logger

### 4. **Scales to All Commands**
- ✅ **npm install**: Use `spawn('npm', ['install'])` → capture stdout/stderr
- ✅ **npm run build**: Use `spawn('npm', ['run', 'build'])` → capture stdout/stderr
- ✅ **Any terminal command**: Same pattern works

### 5. **AI Agent Integration**
- ✅ Logs streamed in real-time
- ✅ Structured format (level, message, timestamp)
- ✅ Can filter/process logs before sending to agent
- ✅ Agent can react to errors automatically

---

## 📊 Comparison: Options

| Option | Plugin Injection | Log Capture | Scalability | VS Code Pattern |
|--------|------------------|-------------|-------------|-----------------|
| **Programmatic API + Logger** | ✅ Yes | ✅ Full | ✅ All commands | ✅ Yes |
| **npm run dev** | ❌ No | ✅ Full | ✅ All commands | ✅ Yes |
| **Programmatic API Only** | ✅ Yes | ⚠️ Partial | ✅ All commands | ✅ Yes |

**Winner**: **Programmatic API + Logger Interception**

---

## 🚀 Implementation Plan

### Phase 1: Add Custom Logger (serverWorker.js)
1. Create `customLogger` object
2. Forward logs via `process.send()`
3. Pass to `createServer({ logger: customLogger })`

### Phase 2: Capture IPC Logs (viteServerManager.ts)
1. Add handler for `VITE_LOG` messages
2. Forward to output channel
3. Forward to AI agent (if active)

### Phase 3: Test
1. Verify Vite logs appear in output channel
2. Verify logs stream to AI agent
3. Test with real projects

### Phase 4: Extend to Other Commands
1. Create `CommandExecutor` service
2. Use same pattern for npm install, build, etc.
3. Unified log streaming interface

---

## ✅ Final Decision

**Architecture**:
- **Programmatic API** (for plugin injection)
- **Custom Logger** (for Vite log capture)
- **IPC Messages** (for structured log forwarding)
- **stdout/stderr Capture** (for worker logs)

**Why This is Correct**:
1. ✅ Maintains plugin injection (required)
2. ✅ Captures ALL logs (Vite + worker + future commands)
3. ✅ Uses proven VS Code pattern
4. ✅ Scales to all terminal commands
5. ✅ Works for both UI and AI agent

**Evidence**: VS Code source code uses this exact pattern throughout.

**Risk**: Low - We're following VS Code's own patterns.

---

## 📚 References

1. **VS Code Extension Host**: `src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts`
2. **VS Code Extension Lifecycle**: `src/vs/platform/extensionManagement/node/extensionLifecycle.ts`
3. **VS Code Test Scanner**: `.vscode/extensions/vscode-selfhost-test-provider/src/testOutputScanner.ts`
4. **Vite Logger API**: Vite source code (vite/src/node/logger.ts)

---

## 🎯 Conclusion

This architecture is:
- ✅ **Proven** (used by VS Code itself)
- ✅ **Resilient** (process isolation, error handling)
- ✅ **Complete** (captures all logs)
- ✅ **Scalable** (works for all terminal commands)
- ✅ **Correct** (maintains plugin injection)

**No blind implementation** - This is based on VS Code's actual source code and proven patterns.

