# DevServer Architecture

> **How Roopik runs Vite dev servers for project preview**

This document explains the complete architecture of Roopik's DevServer system, from user action to running server.

---

## Key Constraint: Single Server Only

**IMPORTANT:** Only ONE dev server can run at a time globally.

| Scenario | Behavior |
|----------|----------|
| Same project already running | Navigate to existing server URL |
| Different project running | Stop old server, start new one |
| No server running | Start new server normally |

This is enforced at **two levels** (defense in depth):

1. **Editor layer** (`startProjectPreview`): Checks `isProjectMode` and `currentProjectRoot`
2. **Service layer** (`startServer`): Iterates `servers` map and stops any running server

### Checking Server Status

```typescript
// Quick boolean check
const isRunning = await devServerService.isAnyServerRunning();

// Get details about the running server
const serverInfo = await devServerService.getRunningServer();
if (serverInfo) {
    console.log(`Server running at ${serverInfo.url} for ${serverInfo.projectRoot}`);
}
```

---

## Overview

The DevServer system runs Vite development servers for live project preview. It uses a **worker process architecture** for isolation and reliability.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RENDERER PROCESS                                     │
│  (VSCode Window - Editor.ts)                                                │
│                                                                              │
│  User clicks "Open Project"                                                  │
│         │                                                                    │
│         ▼                                                                    │
│  DevServerBridge.startServer(options)                                        │
│         │                                                                    │
│         │ IPC call via IChannel                                              │
└─────────┼────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MAIN PROCESS                                        │
│  (Node.js - DevServerService.ts)                                            │
│                                                                              │
│  DevServerService                                                            │
│    ├── Manages server lifecycle                                              │
│    ├── Spawns worker processes                                               │
│    ├── Fires status/log events                                               │
│    └── Handles IPC messages                                                  │
│              │                                                               │
│              │ cp.fork() with IPC                                            │
└──────────────┼──────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       WORKER PROCESS                                         │
│  (Node.js Child - devServerWorker.mjs)                                      │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                 │
│  │ Prerequisites  │→ │  ViteRunner    │→ │    Plugins     │                 │
│  │   Checker      │  │   (server)     │  │   (injected)   │                 │
│  └────────────────┘  └────────────────┘  └────────────────┘                 │
│                                                                              │
│  Runs Vite in user's project context                                        │
│  Uses project's node_modules/vite                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
roopik/
├── common/projectMode/
│   └── devServer.ts              # Interface definitions (IDevServerService)
│
├── browser/projectMode/
│   └── devServerBridge.ts        # Renderer-side IPC proxy
│
└── electron-main/projectMode/
    └── devServer/
        ├── devServerService.ts   # Main process service (manages workers)
        ├── devServerChannel.ts   # IPC router
        ├── devServerWorker.mjs   # Worker process (runs Vite)
        └── lib/
            ├── prerequisites.mjs # Project validation checks
            ├── viteRunner.mjs    # Vite server management
            ├── plugins.mjs       # Roopik Vite plugins
            └── logger.mjs        # Logging utilities
```

---

## Component Details

### 1. Interface (devServer.ts)

Defines the contract between renderer and main process:

```typescript
// Types
export type Framework = 'react-vite' | 'vue-vite' | 'svelte-vite' | ...;
export type DevServerState = 'stopped' | 'starting' | 'running' | 'error';

// Events
interface DevServerStatusEvent {
    projectRoot: string;
    state: DevServerState;
    url?: string;
    port?: number;
    framework?: Framework;
    error?: string;
}

interface DevServerLogEvent {
    projectRoot: string;
    level: 'info' | 'warn' | 'error';
    message: string;
}

// Service Interface
interface IDevServerService {
    // Events
    onStatusChanged: Event<DevServerStatusEvent>;
    onLog: Event<DevServerLogEvent>;

    // Methods
    startServer(options): Promise<string>;
    stopServer(projectRoot): Promise<void>;
    stopAllServers(): Promise<void>;
    getServerInfo(projectRoot): Promise<DevServerInfo>;
    getAllServers(): Promise<DevServerInfo[]>;
    detectFramework(projectRoot): Promise<FrameworkInfo>;
    hasNodeModules(projectRoot): Promise<boolean>;
    installDependencies(projectRoot): Promise<void>;
}
```

### 2. Bridge (devServerBridge.ts)

Renderer-side proxy that uses IChannel for IPC:

```typescript
export class DevServerBridge implements IDevServerService {
    readonly onStatusChanged: Event<DevServerStatusEvent>;
    readonly onLog: Event<DevServerLogEvent>;

    constructor(private channel: IChannel) {
        // Subscribe to events from main process
        this.onStatusChanged = this.channel.listen<DevServerStatusEvent>('onStatusChanged');
        this.onLog = this.channel.listen<DevServerLogEvent>('onLog');
    }

    async startServer(options: DevServerStartOptions): Promise<string> {
        return this.channel.call('startServer', options);
    }

    // ... other methods delegate to channel.call()
}
```

### 3. Service (devServerService.ts)

Main process service that manages worker processes:

```typescript
export class DevServerService implements IDevServerService {
    private servers = new Map<string, ServerInstance>();

    private readonly _onStatusChanged = new Emitter<DevServerStatusEvent>();
    private readonly _onLog = new Emitter<DevServerLogEvent>();

    async startServer(options: DevServerStartOptions): Promise<string> {
        // 1. Check if already running
        // 2. Fork worker process
        // 3. Send START message
        // 4. Wait for READY or ERROR response
        // 5. Return server URL
    }

    async stopServer(projectRoot: string): Promise<void> {
        // 1. Send STOP message to worker
        // 2. Force kill after timeout
        // 3. Cleanup state
    }
}
```

### 4. Channel (devServerChannel.ts)

Routes IPC calls to service methods:

```typescript
export class DevServerChannel implements IServerChannel {
    constructor(private service: IDevServerService) {}

    listen(_: unknown, event: string): Event<any> {
        switch (event) {
            case 'onStatusChanged': return this.service.onStatusChanged;
            case 'onLog': return this.service.onLog;
        }
    }

    call(_: unknown, command: string, arg?: any): Promise<any> {
        switch (command) {
            case 'startServer': return this.service.startServer(arg);
            case 'stopServer': return this.service.stopServer(arg);
            // ... other commands
        }
    }
}
```

### 5. Worker (devServerWorker.mjs)

Isolated child process that runs Vite:

```javascript
// IPC Message Handling
process.on('message', async (message) => {
    switch (message.type) {
        case 'START':
            // Run startup pipeline
            const result = await runStartupPipeline(message.payload);
            process.send({ type: 'READY', ...result });
            break;

        case 'STOP':
            await shutdown();
            break;
    }
});
```

---

## Startup Pipeline

When `startServer()` is called, the worker runs a 2-phase pipeline:

```
╔══════════════════════════════════════════════════════════╗
║           ROOPIK DEV SERVER - STARTING                   ║
╚══════════════════════════════════════════════════════════╝
  Project: my-react-app
  Path: C:\Users\me\projects\my-react-app
  Port: 5173

┌─ PHASE 1: Checking Prerequisites ─────────────────────────
│  ✓ [directory] OK
│  ✓ [package.json] OK
│  ✓ [framework] OK
│  ✓ [framework-support] OK
│  ✓ [node_modules] OK
│  ✓ [vite] OK
│
│  Framework: React (Vite)
│  Source tracking: Yes
└─ All checks passed ✓ ──────────────────────────────────────

┌─ PHASE 2: Starting Vite Server ───────────────────────────
│  Loading Vite from project...
│  Vite v5.4.2 loaded
│  Config: vite.config.ts
│  Plugins: 3 loaded
│  Server started on port 5173
└─────────────────────────────────────────────────────────────

╔══════════════════════════════════════════════════════════╗
║  ✅ SERVER READY: http://127.0.0.1:5173                  ║
╚══════════════════════════════════════════════════════════╝
```

### Phase 1: Prerequisites (prerequisites.mjs)

Validates the project before starting:

| Check | What it validates |
|-------|------------------|
| `directory` | Path exists and is a directory |
| `package.json` | Valid JSON, readable |
| `framework` | Detects framework from dependencies |
| `framework-support` | Framework is supported (Vite-based) |
| `node_modules` | Dependencies installed |
| `vite` | Vite package exists and loadable |

```javascript
// Each check returns { ok: boolean, error?: string, data?: any }
export function runAllChecks(projectRoot) {
    const results = { checks: [] };

    // Step 1: Valid directory
    const dirCheck = isValidDirectory(projectRoot);
    results.checks.push({ name: 'directory', ...dirCheck });
    if (!dirCheck.ok) return { ok: false, error: dirCheck.error, results };

    // Step 2: package.json
    const pkgCheck = hasValidPackageJson(projectRoot);
    // ...continue checks...

    return { ok: true, results };
}
```

#### Framework Detection

Detects framework from package.json dependencies:

| Framework | Detection Rule | Supported | Click-to-Source |
|-----------|---------------|-----------|-----------------|
| react-vite | `vite` + (`react` OR `@vitejs/plugin-react`) | ✅ | ✅ |
| vue-vite | `vite` + (`vue` OR `@vitejs/plugin-vue`) | ✅ | ✅ |
| svelte-vite | `vite` + (`svelte` OR `@sveltejs/vite-plugin-svelte`) | ✅ | ❌ |
| solid-vite | `vite` + (`solid-js` OR `vite-plugin-solid`) | ✅ | ✅ |
| plain-html-vite | `vite` + no framework | ✅ | ✅ |
| nextjs | `next` | ❌ | ❌ |
| nuxt | `nuxt` | ❌ | ❌ |
| sveltekit | `@sveltejs/kit` | ❌ | ❌ |
| react-cra | `react-scripts` | ❌ | ❌ |
| react-webpack | `webpack` + `react` | ❌ | ❌ |
| vue-webpack | `webpack` + `vue` | ❌ | ❌ |

### Phase 2: Start Server (viteRunner.mjs)

Loads and runs Vite from user's project:

```javascript
export async function startServer(config) {
    const { projectRoot, port, frameworkId, pluginOptions } = config;

    // 1. Load Vite from project's node_modules
    const { createServer, version } = loadVite(projectRoot);

    // 2. Find user's vite.config file
    const configFile = findViteConfig(projectRoot);

    // 3. Get Roopik plugins for framework
    const roopikPlugins = getPluginsForFramework(frameworkId, pluginOptions);

    // 4. Create server configuration
    const serverConfig = {
        root: projectRoot,
        configFile: configFile,
        server: {
            port: port,
            host: '127.0.0.1',
            strictPort: false,  // Find next available port
            cors: true,
            hmr: { host: '127.0.0.1' }
        },
        plugins: roopikPlugins,
        clearScreen: false,
        logLevel: 'info'
    };

    // 5. Start server
    const server = await createServer(serverConfig);
    await server.listen();

    return {
        server,
        url: `http://127.0.0.1:${actualPort}`,
        port: actualPort
    };
}
```

---

## Plugin System (plugins.mjs)

Roopik injects custom Vite plugins for enhanced features:

### Plugins Applied

| Plugin | Purpose | When Applied |
|--------|---------|--------------|
| `roopik:inject` | Injects click-to-source script | All frameworks |
| `roopik:cors` | CORS headers for webview | All frameworks |
| `roopik:react-source` | Source tracking for JSX | React, SolidJS |
| `roopik:vue-source` | Source tracking for Vue SFC | Vue |
| `roopik:html-source` | Source tracking for HTML | Plain HTML |

### Plugin Selection

```javascript
export function getPluginsForFramework(frameworkId, options = {}) {
    const plugins = [];

    // Always add these
    plugins.push(createInjectPlugin());  // Click-to-source script
    plugins.push(createCorsPlugin());    // CORS headers

    // Framework-specific source tracking
    switch (frameworkId) {
        case 'react-vite':
            plugins.push(createReactSourcePlugin(options));
            break;
        case 'vue-vite':
            plugins.push(createVueSourcePlugin(options));
            break;
        case 'solid-vite':
            plugins.push(createReactSourcePlugin(options)); // Same as React
            break;
        case 'plain-html-vite':
            plugins.push(createHtmlSourcePlugin(options));
            break;
    }

    return plugins;
}
```

### Click-to-Source Injection

The `roopik:inject` plugin adds a script to every HTML page:

```javascript
export function createInjectPlugin() {
    return {
        name: 'roopik:inject',
        enforce: 'post',

        transformIndexHtml(html) {
            // Inject before </body>
            return html.replace('</body>', CLICK_TO_SOURCE_SCRIPT + '</body>');
        }
    };
}
```

The injected script provides:
- `window.__roopik_enableInspect()` - Enable inspect mode
- `window.__roopik_disableInspect()` - Disable inspect mode
- `window.__roopik_isInspectActive()` - Check if active
- `window.__roopik_getLastInspectedHtml()` - Get last clicked element

### Source Tracking

Adds `data-roopik-source="file:line:col"` to elements:

```javascript
// React/SolidJS (JSX/TSX files)
export function createReactSourcePlugin(options = {}) {
    return {
        name: 'roopik:react-source',
        enforce: 'pre',

        transform(code, id) {
            if (!id.match(/\.(jsx|tsx)$/)) return null;
            if (id.includes('node_modules')) return null;

            // Add source attribute to JSX elements
            const lines = code.split('\n');
            const transformed = lines.map((line, lineIndex) => {
                return line.replace(
                    /<([A-Z][a-zA-Z0-9]*|[a-z][a-z0-9-]*)(\s|>|\/>)/g,
                    (match, tagName, suffix) => {
                        const source = `${id}:${lineIndex + 1}:1`;
                        return `<${tagName} data-roopik-source="${source}"${suffix}`;
                    }
                );
            });

            return { code: transformed.join('\n'), map: null };
        }
    };
}
```

### CORS Plugin

Enables cross-origin requests from Roopik's webview:

```javascript
export function createCorsPlugin() {
    return {
        name: 'roopik:cors',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Roopik-Token');

                if (req.method === 'OPTIONS') {
                    res.statusCode = 204;
                    res.end();
                    return;
                }
                next();
            });
        }
    };
}
```

---

## IPC Communication

### Message Flow

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Editor    │      │   Service   │      │   Worker    │
│  (browser/) │      │ (electron-  │      │  (child     │
│             │      │   main/)    │      │  process)   │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │
       │ startServer()      │                    │
       │ ──────────────────>│                    │
       │                    │ fork()             │
       │                    │ ───────────────────>
       │                    │                    │
       │                    │ { type: 'START' }  │
       │                    │ ──────────────────>│
       │                    │                    │
       │                    │  (runs pipeline)   │
       │                    │                    │
       │                    │ { type: 'READY' }  │
       │                    │ <──────────────────│
       │                    │                    │
       │ url (resolved)     │                    │
       │ <──────────────────│                    │
       │                    │                    │
       │                    │ onLog events       │
       │ <──────────────────│ (forwarded)        │
       │                    │                    │
```

### Worker IPC Messages

**Incoming (from Service to Worker):**

| Message | Payload | Description |
|---------|---------|-------------|
| `START` | `{ root, port, pluginConfig }` | Start dev server |
| `STOP` | - | Graceful shutdown |

**Outgoing (from Worker to Service):**

| Message | Payload | Description |
|---------|---------|-------------|
| `READY` | `{ url, port, framework }` | Server started successfully |
| `ERROR` | `{ message, stack }` | Startup failed |

### Service Events

Events fired by DevServerService:

| Event | When | Contains |
|-------|------|----------|
| `onStatusChanged` | State changes | `{ projectRoot, state, url?, port?, framework?, error? }` |
| `onLog` | Worker logs | `{ projectRoot, level, message }` |

---

## Logging

### Log Flow

```
Worker console.log()
    │
    ▼
stdout (pipe)
    │
    ▼
DevServerService (captures stdout)
    │
    ▼
_onLog.fire({ level, message })
    │
    ▼ IPC Event
DevServerChannel (listen 'onLog')
    │
    ▼
DevServerBridge.onLog
    │
    ▼
Editor subscribes → Logger.info/warn/error()
    │
    ▼
VSCode Output Channel: "Roopik"
```

### Viewing Logs

1. Open VSCode Output panel (View → Output)
2. Select "Roopik" from dropdown
3. All DevServer logs appear with `[DevServer]` prefix

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `node_modules not found` | Dependencies not installed | Run `npm install` |
| `Vite is not installed` | Vite not in dependencies | Run `npm install vite` |
| `Framework not supported` | Non-Vite project | Convert to Vite or use unsupported |
| `Port already in use` | Port 5173 taken | Vite auto-finds next port |
| `Timeout (60s)` | Server hung during start | Check project config |

### Error Propagation

```
Worker throws Error
    │
    ▼
process.send({ type: 'ERROR', message })
    │
    ▼
DevServerService rejects Promise
    │
    ▼
fires onStatusChanged({ state: 'error', error })
    │
    ▼
Editor catches, shows notification
```

---

## Shutdown & Cleanup

### Shutdown Scenarios

The dev server must be stopped in ALL these scenarios to avoid orphaned processes:

| Scenario | Trigger | How It's Handled |
|----------|---------|------------------|
| **Tab closed** | User closes browser tab | `EditorInput.onWillDispose` → `stopDevServerOnClose()` |
| **Editor disposed** | VSCode cleans up editor | `Editor.dispose()` → `stopDevServerOnClose()` |
| **VSCode exit** | User quits VSCode | Main process exits → Worker gets SIGTERM |
| **Window reload** | Developer reloads window | `BrowserViewService.attachSafetyLeash()` → destroys view |
| **Manual stop** | User clicks stop button | `stopDevServer()` → `devServerService.stopServer()` |

### Tab Close Flow (CRITICAL)

When user closes the browser preview tab:

```
User closes tab
    │
    ▼
EditorInput.onWillDispose fires
    │
    ▼
Editor.stopDevServerOnClose()  ◄─── MUST stop server here!
    │                               Otherwise port stays blocked
    ▼
Editor.destroyBrowserNow()
    │
    ▼
Editor.dispose() (called by VSCode)
    │
    ▼
stopDevServerOnClose() (idempotent - skips if already stopped)
```

```typescript
// editor.ts - Tab closure handler
this._register(input.onWillDispose(() => {
    // Stop dev server FIRST to release the port
    // This is critical - if we don't stop here, the server becomes orphaned
    this.stopDevServerOnClose();
    this.destroyBrowserNow();
}));

// Idempotent stop method
private stopDevServerOnClose(): void {
    if (!this.currentProjectRoot) return;  // Already stopped

    const projectRoot = this.currentProjectRoot;
    this.currentProjectRoot = undefined;  // Prevent double-stop
    this.isProjectMode = false;

    this.devServerService.stopServer(projectRoot);
}
```

### Worker Graceful Shutdown

```javascript
// Worker shutdown sequence
async function shutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;

    if (currentServer) {
        await stopServer(currentServer);  // Vite server.close()
        currentServer = null;
    }

    process.exit(0);
}

// Triggers
process.on('message', msg => {
    if (msg.type === 'STOP') shutdown();
});
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### Force Kill

If worker doesn't respond to STOP within 2 seconds:

```javascript
// Windows
cp.execSync(`taskkill /pid ${pid} /T /F`);

// Unix
process.kill(-pid, 'SIGTERM');
```

### Port Recovery

If a port gets stuck (orphaned server):

1. **Find the process**: `netstat -ano | findstr :5173` (Windows) or `lsof -i :5173` (Unix)
2. **Kill it**: `taskkill /pid <PID> /F` (Windows) or `kill -9 <PID>` (Unix)
3. **Restart VSCode**: Fresh start clears all Roopik processes

---

## Sequence Diagrams

### Start Server

```
User                Editor              Service            Worker
 │                    │                    │                  │
 │ Click Open Project │                    │                  │
 │ ──────────────────>│                    │                  │
 │                    │                    │                  │
 │                    │ startServer()      │                  │
 │                    │ ──────────────────>│                  │
 │                    │                    │                  │
 │                    │                    │ fork(worker)     │
 │                    │                    │ ────────────────>│
 │                    │                    │                  │
 │                    │                    │ START message    │
 │                    │                    │ ────────────────>│
 │                    │                    │                  │
 │                    │                    │    Phase 1:      │
 │                    │                    │    Prerequisites │
 │                    │                    │    ─────────────>│
 │                    │                    │                  │
 │                    │                    │    Phase 2:      │
 │                    │                    │    Start Vite    │
 │                    │                    │    ─────────────>│
 │                    │                    │                  │
 │                    │                    │ READY message    │
 │                    │                    │ <────────────────│
 │                    │                    │                  │
 │                    │ URL resolved       │                  │
 │                    │ <──────────────────│                  │
 │                    │                    │                  │
 │                    │ navigate(url)      │                  │
 │                    │ ─────────────────────────────────────>│
 │                    │                    │                  │
 │ See preview        │                    │                  │
 │ <──────────────────│                    │                  │
```

### Stop Server

```
User               Editor              Service            Worker
 │                    │                    │                  │
 │ Close tab          │                    │                  │
 │ ──────────────────>│                    │                  │
 │                    │                    │                  │
 │                    │ stopServer()       │                  │
 │                    │ ──────────────────>│                  │
 │                    │                    │                  │
 │                    │                    │ STOP message     │
 │                    │                    │ ────────────────>│
 │                    │                    │                  │
 │                    │                    │   shutdown()     │
 │                    │                    │   server.close() │
 │                    │                    │   ─────────────> │
 │                    │                    │                  │
 │                    │                    │ exit(0)          │
 │                    │                    │ <────────────────│
 │                    │                    │                  │
 │                    │ Promise resolved   │                  │
 │                    │ <──────────────────│                  │
```

---

## Why This Architecture?

### 1. Process Isolation

**Problem:** Vite runs in user's project context with their node_modules. If Vite crashes, it shouldn't crash the IDE.

**Solution:** Run Vite in a child process. If it crashes, we just restart it.

### 2. Module Resolution

**Problem:** Need to use user's Vite version, not ours. Different projects have different Vite versions.

**Solution:** Worker runs with `cwd` set to project root. `require()` resolves from project's node_modules.

### 3. Clean Logging

**Problem:** Vite logs to stdout. Need to capture and show in VSCode.

**Solution:** Worker's stdout is piped. Service reads it and fires `onLog` events.

### 4. Type Safety

**Problem:** Worker is ES Module (.mjs), but TypeScript wants types.

**Solution:** Types defined in `devServer.ts` (common/). Service implements interface. Bridge proxies calls.

### 5. Plugin Injection

**Problem:** Need to inject Roopik features (click-to-source) without modifying user's config.

**Solution:** Merge our plugins with user's vite.config at runtime.

---

## Debugging Tips

### 1. View All Logs

Open VSCode Output panel → Select "Roopik"

### 2. Check Server State

```typescript
const info = await devServerService.getServerInfo(projectRoot);
console.log(info.state); // 'stopped' | 'starting' | 'running' | 'error'
```

### 3. Manual Start

Open DevTools console in Roopik and run:
```javascript
roopikDevServer.startServer({ projectRoot: 'C:/path/to/project' });
```

### 4. Check Prerequisites

Look for Phase 1 output in logs. Any `✗` indicates failure.

### 5. Port Issues

If server never starts:
1. Check if port 5173 is taken
2. Vite should auto-find next port
3. Check firewall isn't blocking

---

## Future Improvements

- [ ] Support Next.js (Turbopack)
- [ ] Support Create React App (Webpack)
- [ ] Auto-install dependencies option
- [ ] Multiple servers per project (different ports)
- [ ] Server restart on config change
- [ ] Network inspection panel
- [ ] Performance metrics

---

*Last updated: November 2024*
