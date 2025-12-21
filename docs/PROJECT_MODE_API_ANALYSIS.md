# Project Mode Deep Analysis: API Exposure Requirements

**Date:** December 21, 2025
**Purpose:** Define bridge API requirements for roopik-dio agent to interact with Project Mode
**Status:** Analysis Complete - Ready for Bridge Implementation

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Project Startup Flow](#2-project-startup-flow)
3. [APIs to Expose via Bridge](#3-apis-to-expose-via-bridge)
4. [Implementation Priority](#4-implementation-priority)
5. [Example Usage in Dio Agent](#5-example-usage-in-dio-agent)
6. [Key Technical Details](#6-key-technical-details)
7. [Next Steps](#7-next-steps)

---

## 1. Architecture Overview

### Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    Roopik-Dio Extension                      │
│              (AI Agent - Extension Mode)                     │
└────────────────────────┬────────────────────────────────────┘
                         │ Bridge API (to be created)
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    Core Services (Main Process)              │
│  • IDevServerService      - Vite dev server lifecycle        │
│  • IProjectModeService    - WebContentsView + CDP            │
│  • IProjectStorageService - Project registry (.roopik/)      │
└─────────────────────────────────────────────────────────────┘
```

### Key Services

#### 1. **IDevServerService** (Main Process)
- **Location:** `src/vs/workbench/contrib/roopik/electron-main/projectMode/devServer/devServerService.ts`
- **Purpose:** Manages Vite dev server via child process workers
- **Features:**
  - Framework detection (React, Vue, Svelte, Next.js, etc.)
  - Port allocation (default: 5173, auto-increments if busy)
  - Server status events (`starting`, `running`, `stopped`, `error`)
  - Real-time log streaming from dev server process
  - Prerequisite checks (node_modules, package.json)
  - Automatic npm install when needed

#### 2. **IProjectModeService** (Main Process)
- **Location:** `src/vs/workbench/contrib/roopik/electron-main/projectMode/browserViewService.ts`
- **Purpose:** Manages WebContentsView (Electron browser) and CDP integration
- **Features:**
  - Creates/destroys WebContentsView
  - Navigation control (back, forward, reload)
  - DevTools management (open/close)
  - CDP (Chrome DevTools Protocol) integration
  - Console log capture
  - Network monitoring
  - CSS inspection via CDP
  - Execute JavaScript in browser
  - Screenshot capture

#### 3. **IProjectStorageService** (Main Process)
- **Location:** `src/vs/workbench/contrib/roopik/electron-main/projectStorage/projectStorageService.ts`
- **Purpose:** Manages project registry
- **Storage:** `.roopik/projects/projects.json`
- **Features:**
  - Tracks recent projects with metadata
  - Framework information
  - Last accessed time

---

## 2. Project Startup Flow

### Current User Flow

```
User clicks "Open Project"
  → Folder picker dialog
  → startProjectPreview(projectPath)
    ├─ Check if same project already running → navigate to existing URL
    ├─ Check if different project running → stop it first (single server constraint)
    ├─ Ensure browser view initialized
    ├─ Start dev server (IDevServerService.startServer())
    │   ├─ Fork worker process (devServerWorker.mjs)
    │   ├─ Worker checks prerequisites:
    │   │   - package.json exists?
    │   │   - node_modules exists? → install if missing
    │   │   - Detect framework (react-vite, vue-vite, etc.)
    │   ├─ Worker starts Vite server
    │   └─ Worker sends IPC message: { type: 'READY', url, port, framework }
    ├─ Save project to registry (projectStorageService.upsertProject())
    ├─ Wait 100ms (ensure Vite fully ready)
    └─ Navigate browser to http://localhost:{port}
```

### What Dio Agent Needs to Do

```typescript
// After generating project code in workspace folder:

// 1. Start project preview
const url = await bridge.startProject({
  projectPath: '/path/to/generated/project',
  port: 5173  // optional, defaults to 5173
});

// 2. Monitor server startup (event-based)
bridge.onDevServerLog((event) => {
  console.log(`[${event.level}] ${event.message}`);
  // Logs include:
  // - "Checking node_modules..."
  // - "Running npm install..."
  // - "Detected framework: react-vite"
  // - "Starting Vite server..."
  // - "✅ Server ready at http://localhost:5173"
});

bridge.onDevServerStatusChanged((event) => {
  // event.state: 'starting' | 'running' | 'stopped' | 'error'
  // event.url: 'http://localhost:5173' (when running)
  // event.port: 5173
  // event.framework: 'react-vite'
  // event.error: '...' (if state === 'error')

  if (event.state === 'running') {
    console.log(`✅ Project started at ${event.url}`);
  }
});
```

---

## 3. APIs to Expose via Bridge

### A. Project Lifecycle (High Priority)

```typescript
interface RoopikBridge {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. START PROJECT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Start a project preview with dev server
   *
   * @param projectPath - Absolute path to project root
   * @param port - Port number (default: 5173)
   * @returns Promise<string> - Server URL when ready (e.g., "http://localhost:5173")
   *
   * Example:
   *   const url = await bridge.startProject({
   *     projectPath: '/home/user/my-app'
   *   });
   *   // Returns: "http://localhost:5173"
   */
  startProject(options: {
    projectPath: string;
    port?: number;
  }): Promise<string>;

  /**
   * Retry starting project after npm install failure or other recoverable error
   * Clears cached state and retries from scratch
   */
  retryStartProject(projectPath: string): Promise<string>;

  /**
   * Force kill server if stuck (sends SIGKILL instead of SIGTERM)
   * Use when normal stopProject() doesn't work
   */
  forceStopProject(projectPath: string): Promise<void>;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. STOP PROJECT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Stop the running dev server for a project
   */
  stopProject(projectPath: string): Promise<void>;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. GET PROJECT STATUS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Get current status of a project's dev server
   *
   * Returns:
   * {
   *   state: 'running',
   *   url: 'http://localhost:5173',
   *   port: 5173,
   *   framework: 'react-vite',
   *   frameworkDisplayName: 'React + Vite'
   * }
   */
  getProjectStatus(projectPath: string): Promise<{
    projectRoot: string;
    state: 'stopped' | 'starting' | 'running' | 'error';
    url?: string;
    port?: number;
    framework?: Framework;
    frameworkDisplayName?: string;
  } | undefined>;

  /**
   * Get the currently running project (single server constraint)
   * Returns undefined if no server is running
   */
  getRunningProject(): Promise<{
    projectRoot: string;
    url: string;
    port: number;
    framework?: Framework;
  } | undefined>;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. FRAMEWORK DETECTION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Detect framework before starting server (for AI decision making)
   *
   * Returns:
   * {
   *   framework: 'react-vite',
   *   displayName: 'React + Vite',
   *   supported: true,
   *   supportsClickToSource: true
   * }
   */
  detectFramework(projectPath: string): Promise<{
    framework: Framework;
    displayName: string;
    supported: boolean;
    supportsClickToSource: boolean;
  }>;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. EVENTS (Real-time Observability)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Subscribe to dev server status changes
   *
   * Event fires when state changes:
   * - starting → running (success)
   * - starting → error (failed)
   * - running → stopped (manual stop)
   */
  onDevServerStatusChanged: Event<{
    projectRoot: string;
    state: 'stopped' | 'starting' | 'running' | 'error';
    url?: string;
    port?: number;
    framework?: Framework;
    error?: string;
  }>;

  /**
   * Subscribe to dev server logs (stdout/stderr from Vite process)
   *
   * Critical for observing:
   * - Prerequisite checks ("Checking node_modules...")
   * - npm install progress
   * - Framework detection ("Detected framework: react-vite")
   * - Server startup ("Starting Vite server...")
   * - Errors ("Port 5173 is already in use")
   * - Ready message ("✅ Server ready at http://localhost:5173")
   */
  onDevServerLog: Event<{
    projectRoot: string;
    level: 'info' | 'warn' | 'error';
    message: string;
  }>;
}

type Framework =
  | 'react-vite'
  | 'vue-vite'
  | 'svelte-vite'
  | 'solid-vite'
  | 'plain-html-vite'
  | 'nextjs'
  | 'nuxt'
  | 'sveltekit'
  | 'react-cra'
  | 'react-webpack'
  | 'vue-webpack'
  | 'unknown';
```

### B. CDP Access (Medium Priority - for advanced debugging)

```typescript
interface RoopikBridge {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. CDP - CONSOLE LOGS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Enable CDP Console domain and listen for console logs
   * Agent can observe runtime errors, warnings, console.log output
   */
  enableConsoleLogging(): Promise<void>;

  /**
   * Subscribe to browser console messages
   *
   * Example output:
   * {
   *   type: 'log',
   *   message: 'App mounted',
   *   source: 'console-api',
   *   level: 'log'
   * }
   *
   * {
   *   type: 'error',
   *   message: 'Uncaught TypeError: Cannot read property of undefined',
   *   source: 'javascript',
   *   level: 'error',
   *   stackTrace: [...]
   * }
   */
  onConsoleMessage: Event<{
    type: 'log' | 'info' | 'warn' | 'error';
    message: string;
    source: string;
    level: string;
    stackTrace?: any[];
  }>;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 7. CDP - NETWORK MONITORING
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Enable CDP Network domain for performance monitoring
   */
  enableNetworkMonitoring(): Promise<void>;

  /**
   * Subscribe to network requests (for performance analysis)
   */
  onNetworkRequest: Event<{
    requestId: string;
    url: string;
    method: string;
    timestamp: number;
  }>;

  onNetworkResponse: Event<{
    requestId: string;
    url: string;
    status: number;
    timing: {
      requestTime: number;
      receiveHeadersEnd: number;
    };
  }>;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 8. CDP - RAW ACCESS (for MCP integration)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Get CDP WebSocket URL for direct MCP connection
   *
   * Returns: "ws://127.0.0.1:9222/devtools/page/{guid}"
   *
   * Use case: Connect MCP CDP server directly to browser
   */
  getCDPDebugUrl(): Promise<string>;

  /**
   * Send raw CDP command (advanced use)
   *
   * Example:
   *   await bridge.sendCDPCommand('Runtime.evaluate', {
   *     expression: 'document.title',
   *     returnByValue: true
   *   });
   */
  sendCDPCommand(method: string, params?: any): Promise<any>;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 9. NAVIGATION & INTERACTION (For AI Visual Verification)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Navigate browser to a specific URL
   * Use to navigate within the running project (e.g., to different routes)
   */
  navigate(url: string): Promise<void>;

  /**
   * Reload the current page
   * Useful after code changes to verify they took effect
   */
  reload(): Promise<void>;

  /**
   * Take screenshot of current browser view
   * Essential for AI visual verification - agent can "see" the result
   *
   * @param options.format - 'png' | 'jpeg' (default: 'png')
   * @param options.quality - JPEG quality 0-100 (default: 80)
   * @param options.fullPage - Capture full scrollable page (default: false)
   * @returns Base64 encoded image string
   *
   * Example:
   *   const screenshot = await bridge.takeScreenshot({ format: 'png' });
   *   // Agent can analyze screenshot to verify UI changes
   */
  takeScreenshot(options?: {
    format?: 'png' | 'jpeg';
    quality?: number;
    fullPage?: boolean;
  }): Promise<string>;

  /**
   * Get current browser URL
   * Useful for tracking navigation state
   */
  getCurrentUrl(): Promise<string>;
}
```

### C. Project Registry (Low Priority - nice to have)

```typescript
interface RoopikBridge {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 9. PROJECT REGISTRY
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Get recent projects from .roopik/projects/projects.json
   */
  getRecentProjects(limit?: number): Promise<Array<{
    id: string;
    name: string;
    path: string;
    framework?: string;
    frameworkDisplayName?: string;
    updatedAt: string;
  }>>;

  /**
   * Add project to registry (usually automatic on successful start)
   */
  addProjectToRegistry(options: {
    name: string;
    path: string;
    framework?: string;
  }): Promise<string>;  // Returns project ID
}
```

---

## 4. Implementation Priority

### Phase 1 - Must Have (Week 1)
✅ **Project Lifecycle APIs**
- `startProject()` - Start dev server
- `stopProject()` - Stop dev server
- `getProjectStatus()` - Check server state
- `getRunningProject()` - Get currently running project
- `detectFramework()` - Framework detection
- `onDevServerStatusChanged` - Monitor state changes
- `onDevServerLog` - Observe server output

**Rationale:** Dio agent needs to start projects after code generation and verify they started successfully. These APIs provide complete observability into the startup process.

### Phase 2 - Should Have (Week 2)
✅ **CDP Console Access**
- `enableConsoleLogging()`
- `onConsoleMessage` - Runtime errors, warnings

**Rationale:** Agent can detect runtime errors and fix them automatically. This enables autonomous error detection and debugging.

### Phase 3 - Nice to Have (Future)
✅ **CDP Network & MCP**
- `getCDPDebugUrl()` - For MCP CDP integration
- `enableNetworkMonitoring()`
- Network monitoring APIs
- Project registry APIs

**Rationale:** Advanced performance monitoring and potential MCP integration. Registry APIs are low priority since projects are automatically added on successful start.

---

## 5. Example Usage in Dio Agent

```typescript
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCENARIO: Dio generates a new React app and starts preview
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { RoopikBridge } from './services/roopikBridge';

async function generateAndPreviewApp(prompt: string) {
  const bridge = await vscode.commands.executeCommand('roopik.getBridge') as RoopikBridge;

  // Step 1: Generate project code
  const projectPath = await generateReactApp(prompt);
  console.log(`Generated project at: ${projectPath}`);

  // Step 2: Subscribe to server logs (for debugging)
  const logDisposable = bridge.onDevServerLog((event) => {
    console.log(`[${event.level}] ${event.message}`);

    // Key messages to watch:
    // - "Checking node_modules..."
    // - "Running npm install..." (can take minutes!)
    // - "Detected framework: react-vite"
    // - "Starting Vite server..."
    // - "✅ Server ready at http://localhost:5173"
  });

  // Step 3: Subscribe to status changes
  let serverUrl: string | undefined;
  const statusDisposable = bridge.onDevServerStatusChanged((event) => {
    if (event.state === 'running' && event.url) {
      serverUrl = event.url;
      console.log(`✅ Project started successfully at ${event.url}`);
      console.log(`   Framework: ${event.framework}`);
      console.log(`   Port: ${event.port}`);
    } else if (event.state === 'error') {
      console.error(`❌ Server failed to start: ${event.error}`);
    } else if (event.state === 'starting') {
      console.log('⏳ Server starting...');
    }
  });

  // Step 4: Start the project
  try {
    console.log('Starting project preview...');
    const url = await bridge.startProject({ projectPath });
    console.log(`✅ Project preview available at: ${url}`);

    // Step 5: Enable console logging (detect runtime errors)
    await bridge.enableConsoleLogging();
    bridge.onConsoleMessage((msg) => {
      if (msg.type === 'error') {
        console.error('🐛 Runtime error detected:', msg.message);
        if (msg.stackTrace) {
          console.error('Stack trace:', msg.stackTrace);
        }
        // AI agent can analyze error and auto-fix
        analyzeAndFixError(msg.message, msg.stackTrace);
      } else if (msg.type === 'warn') {
        console.warn('⚠️ Warning:', msg.message);
      }
    });

    return url;
  } catch (error) {
    console.error('Failed to start project:', error);
    // Error contains details from dev server worker:
    // - "Port 5173 is already in use"
    // - "node_modules not found and npm install failed"
    // - "package.json not found"
    // - "Vite server failed to start"
    throw error;
  } finally {
    // Cleanup subscriptions when done
    logDisposable.dispose();
    statusDisposable.dispose();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCENARIO: Check if project is already running before starting
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function smartStartProject(projectPath: string) {
  const bridge = await vscode.commands.executeCommand('roopik.getBridge') as RoopikBridge;

  // Check if this project is already running
  const status = await bridge.getProjectStatus(projectPath);
  if (status?.state === 'running' && status.url) {
    console.log(`Project already running at ${status.url}`);
    return status.url;
  }

  // Check if a DIFFERENT project is running
  const runningProject = await bridge.getRunningProject();
  if (runningProject) {
    console.log(`Stopping previous project: ${runningProject.projectRoot}`);
    await bridge.stopProject(runningProject.projectRoot);
  }

  // Start the project
  return await bridge.startProject({ projectPath });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCENARIO: Detect framework before generating code
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function analyzeProject(projectPath: string) {
  const bridge = await vscode.commands.executeCommand('roopik.getBridge') as RoopikBridge;

  const framework = await bridge.detectFramework(projectPath);
  console.log(`Framework: ${framework.displayName}`);
  console.log(`Supported: ${framework.supported}`);
  console.log(`Click-to-source: ${framework.supportsClickToSource}`);

  if (!framework.supported) {
    console.warn('⚠️ Framework not fully supported, some features may not work');
  }

  return framework;
}
```

---

## 6. Key Technical Details

### Single Server Constraint

⚠️ **Only ONE dev server can run at a time globally**

- Enforced in both `devServerService.ts` (main process) and `editor.ts` (renderer)
- If agent tries to start project B while project A is running, core **automatically stops A first**
- Agent should check `getRunningProject()` before starting to provide better UX
- This constraint exists because:
  - Multiple Vite servers can conflict on ports
  - Resource management (each server uses significant memory)
  - Single browser view in UI (one project at a time)

**Code Location:**
```typescript
// devServerService.ts lines 108-119
for (const [otherRoot, instance] of this.servers.entries()) {
  if (otherRoot !== normalizedRoot && (instance.state === 'running' || instance.state === 'starting')) {
    this.log(normalizedRoot, 'warn', `Another server running at ${otherRoot}, stopping it first`);
    await this.stopServer(otherRoot);
  }
}
```

### Dev Server Worker Architecture

```
Main Process (DevServerService)
  └─ Forks: devServerWorker.mjs (ES module child process)
      ├─ Checks prerequisites:
      │   ├─ package.json exists?
      │   ├─ node_modules exists?
      │   └─ If missing → run npm install
      ├─ Detects framework (reads package.json dependencies)
      ├─ Starts Vite server programmatically
      ├─ Waits for server ready
      └─ Sends IPC message: { type: 'READY', url, port, framework }
```

**Agent Observability:**
- `onDevServerLog` captures **ALL stdout/stderr** from worker
- Agent sees npm install progress (can take 1-5 minutes for fresh installs)
- Agent knows **exact moment** server is ready via status events
- Logs include:
  - Prerequisite checks
  - npm install output (if needed)
  - Framework detection result
  - Vite startup messages
  - Error messages with stack traces

**Worker Location:**
- `src/vs/workbench/contrib/roopik/electron-main/projectMode/devServer/devServerWorker.mjs`

### Port Detection

- **Default port:** `5173` (Vite default)
- **Auto-increment:** If port busy → tries 5174, 5175, 5176, etc.
- **Final port returned in:**
  - Promise resolution from `startServer()`
  - `READY` IPC message from worker
  - `onDevServerStatusChanged` event

**Code Logic:**
```javascript
// Worker attempts to start on specified port
// If port busy, Vite automatically tries next port
// Worker reports actual port in READY message
```

### Framework Detection

**Detection Logic:**

Reads `package.json` dependencies to identify framework:

```typescript
Framework Detection Rules:
├─ "react" + "vite" → 'react-vite'
├─ "vue" + "vite" → 'vue-vite'
├─ "svelte" + "vite" → 'svelte-vite'
├─ "@solidjs/core" + "vite" → 'solid-vite'
├─ "next" → 'nextjs'
├─ "nuxt" → 'nuxt'
├─ "@sveltejs/kit" → 'sveltekit'
├─ "react-scripts" → 'react-cra'
├─ "react" + "webpack" → 'react-webpack'
├─ "vue" + "webpack" → 'vue-webpack'
└─ None match → 'unknown'
```

**Returns:**
```typescript
{
  framework: 'react-vite',
  displayName: 'React + Vite',
  supported: true,
  supportsClickToSource: true  // Has Vite plugin support
}
```

**Code Location:**
- `src/vs/workbench/contrib/roopik/electron-main/projectMode/devServer/devServerService.ts` (lines 369-436)

### CDP Integration

**Available CDP Domains:**
- **Console** - Console logs, warnings, errors
- **Network** - Network requests, responses, timing
- **Runtime** - JavaScript execution, evaluate expressions
- **DOM** - DOM tree access, mutations
- **CSS** - Style inspection, modifications
- **Page** - Screenshots, navigation, lifecycle
- **Log** - General browser logs

**CDP Access Methods:**
1. **High-level APIs** - `enableConsoleLogging()`, `onConsoleMessage`
2. **Raw CDP** - `sendCDPCommand('Runtime.evaluate', {...})`
3. **MCP Integration** - `getCDPDebugUrl()` returns WebSocket URL

**WebSocket URL Format:**
```
ws://127.0.0.1:9222/devtools/page/{guid}
```

**Use Case for MCP:**
- MCP CDP server can connect directly to browser
- Agent sends CDP commands via MCP protocol
- No need to expose every CDP domain individually

---

## 7. Project Status Persistence Strategy

### Problem Statement

**Challenge:** How do we track which project is currently running across sessions?

Current limitations:
- Dev server status only exists in memory (lost on restart)
- No persistent record of active project
- Cannot determine if metadata is stale (port occupied by different process)
- Extension needs reliable way to query active project

### Solution: Enhanced Metadata with Self-Healing

**Storage Location:** `.roopik/projects/projects.json`

**Enhanced Schema:**
```typescript
interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  framework?: string;
  frameworkDisplayName?: string;
  updatedAt: string;

  // NEW: Active server status
  activeServer?: {
    port: number;
    url: string;
    pid?: number;           // Process ID (for verification)
    startedAt: string;      // ISO timestamp
    lastHealthCheck?: string;  // Last verified alive
  };
}
```

**Example:**
```json
{
  "projects": [
    {
      "id": "abc123",
      "name": "my-react-app",
      "path": "/home/user/projects/my-react-app",
      "framework": "react-vite",
      "frameworkDisplayName": "React + Vite",
      "updatedAt": "2025-12-21T10:30:00Z",
      "activeServer": {
        "port": 5173,
        "url": "http://localhost:5173",
        "pid": 12345,
        "startedAt": "2025-12-21T10:30:00Z",
        "lastHealthCheck": "2025-12-21T10:35:00Z"
      }
    }
  ]
}
```

### Implementation Strategy

#### 1. Update Metadata on Server Lifecycle

**Location:** `devServerService.ts`

```typescript
async startServer(options: DevServerStartOptions): Promise<string> {
  // ... existing startup code ...

  // On READY message from worker:
  if (msg.type === 'READY') {
    // Update in-memory state
    instance.state = 'running';
    instance.url = msg.url;
    instance.port = msg.port;

    // NEW: Update metadata file
    await this.projectStorageService.setActiveServer(normalizedRoot, {
      port: msg.port,
      url: msg.url,
      pid: workerProcess.pid,
      startedAt: new Date().toISOString()
    });
  }
}

async stopServer(projectRoot: string): Promise<void> {
  // ... existing stop code ...

  // NEW: Clear active server from metadata
  await this.projectStorageService.clearActiveServer(projectRoot);
}
```

#### 2. Self-Healing Status Verification

**Add to `IProjectStorageService`:**

```typescript
interface IProjectStorageService {
  // ... existing methods ...

  /**
   * Set active server status for a project
   */
  setActiveServer(projectPath: string, status: {
    port: number;
    url: string;
    pid?: number;
    startedAt: string;
  }): Promise<void>;

  /**
   * Clear active server status
   */
  clearActiveServer(projectPath: string): Promise<void>;

  /**
   * Get active project with health check
   * Verifies port is actually listening before returning
   * Auto-fixes stale metadata if port is dead
   */
  getActiveProjectWithHealthCheck(): Promise<{
    projectId: string;
    path: string;
    port: number;
    url: string;
    framework?: string;
  } | undefined>;
}
```

**Self-Healing Logic:**

```typescript
async getActiveProjectWithHealthCheck(): Promise<ActiveProject | undefined> {
  // 1. Find project with activeServer in metadata
  const projects = await this.getRecentProjects(100);
  const activeProject = projects.find(p => p.activeServer);

  if (!activeProject?.activeServer) {
    return undefined;
  }

  // 2. First check: Verify PID is still running (fast check)
  if (activeProject.activeServer.pid) {
    const processAlive = await this.checkPidAlive(activeProject.activeServer.pid);
    if (!processAlive) {
      // Process was killed externally, clear metadata immediately
      console.warn(`[ProjectStorage] Process ${activeProject.activeServer.pid} no longer running, clearing active status`);
      await this.clearActiveServer(activeProject.path);
      return undefined;
    }
  }

  // 3. Second check: Verify port is actually listening (confirms server is responding)
  const isAlive = await this.checkPortAlive(activeProject.activeServer.port);

  if (isAlive) {
    // 4a. Port is alive - update lastHealthCheck
    await this.updateHealthCheck(activeProject.path);
    return {
      projectId: activeProject.id,
      path: activeProject.path,
      port: activeProject.activeServer.port,
      url: activeProject.activeServer.url,
      framework: activeProject.framework
    };
  } else {
    // 4b. Port is dead - fix stale metadata
    console.warn(`[ProjectStorage] Stale metadata detected for ${activeProject.name}, clearing active status`);
    await this.clearActiveServer(activeProject.path);
    return undefined;
  }
}

/**
 * Check if a process with given PID is still running
 * Works cross-platform (Windows, macOS, Linux)
 */
private async checkPidAlive(pid: number): Promise<boolean> {
  try {
    // process.kill(pid, 0) doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    // ESRCH = No such process
    // EPERM = Process exists but we don't have permission (still alive!)
    if (error.code === 'ESRCH') {
      return false;
    }
    // EPERM means process exists but we can't signal it - still alive
    return error.code === 'EPERM';
  }
}

private async checkPortAlive(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(port, '127.0.0.1');
  });
}
```

### Benefits

✅ **Persistence:** Active project survives IDE restart
✅ **Self-Healing:** Auto-detects and fixes stale metadata
✅ **Reliable:** Extension always gets accurate project status
✅ **Simple:** Single source of truth in projects.json
✅ **Observable:** Health checks update lastHealthCheck timestamp

### Continuous Health Monitoring

While a project is running, the service should periodically verify server health:

```typescript
/**
 * Start background health monitoring for running server
 * Detects crashes and updates status accordingly
 */
private startHealthMonitoring(projectPath: string, port: number, pid?: number): void {
  // Clear any existing monitor
  if (this.healthMonitors.has(projectPath)) {
    clearInterval(this.healthMonitors.get(projectPath)!);
  }

  const monitor = setInterval(async () => {
    // Check PID first (fast)
    if (pid) {
      const processAlive = await this.checkPidAlive(pid);
      if (!processAlive) {
        console.warn(`[HealthMonitor] Server process ${pid} died unexpectedly`);
        await this.handleServerCrash(projectPath);
        return;
      }
    }

    // Check port (confirms server is responding)
    const portAlive = await this.checkPortAlive(port);
    if (!portAlive) {
      console.warn(`[HealthMonitor] Server on port ${port} stopped responding`);
      await this.handleServerCrash(projectPath);
      return;
    }

    // Update lastHealthCheck timestamp
    await this.updateHealthCheck(projectPath);
  }, 30000);  // Check every 30 seconds

  this.healthMonitors.set(projectPath, monitor);
}

private async handleServerCrash(projectPath: string): Promise<void> {
  // 1. Stop health monitoring
  const monitor = this.healthMonitors.get(projectPath);
  if (monitor) {
    clearInterval(monitor);
    this.healthMonitors.delete(projectPath);
  }

  // 2. Clear active server metadata
  await this.clearActiveServer(projectPath);

  // 3. Fire status changed event
  this._onDevServerStatusChanged.fire({
    projectRoot: projectPath,
    state: 'error',
    error: 'Server unexpectedly stopped'
  });
}

private stopHealthMonitoring(projectPath: string): void {
  const monitor = this.healthMonitors.get(projectPath);
  if (monitor) {
    clearInterval(monitor);
    this.healthMonitors.delete(projectPath);
  }
}
```

**When to Start/Stop Monitoring:**
- Start: After server READY message received
- Stop: On `stopServer()` or `forceStopProject()` call
- Auto-stop: When crash detected

---

## 8. Chat Session Integration Architecture

### Overview

**Requirement:** Per-project chat sessions with rich context injection

Each project maintains its own chat history, ensuring:
- Relevant context stays scoped to the project
- Previous conversations remain available
- Backend injects rich context (clicked element, file location, styles)
- AI agent has full project context for accurate responses

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Interaction                            │
│  • Click element in Inspect Mode                                 │
│  • Type message in chat input box                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Rich Context Collection                        │
│  Backend automatically gathers:                                  │
│  • Clicked element selector (CSS selector, XPath)                │
│  • Exact file location (component source)                        │
│  • Line number in source file                                    │
│  • Computed styles (CSS properties)                              │
│  • Component tree context                                        │
│  • Framework-specific metadata (React props, Vue data)           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Project Chat Session                          │
│  Storage: .roopik/projects/{projectId}/chat/history.json         │
│                                                                   │
│  Message Structure:                                               │
│  {                                                                │
│    role: 'user',                                                  │
│    content: 'Change button color to blue',                       │
│    context: {                                                     │
│      type: 'inspect-click',                                       │
│      element: { selector: 'button.primary', ... },                │
│      file: { path: 'src/App.tsx', line: 42 },                    │
│      styles: { ... },                                             │
│      component: { ... }                                           │
│    },                                                             │
│    timestamp: '2025-12-21T10:30:00Z'                             │
│  }                                                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Roopik-Dio Agent                              │
│  • Receives full message with rich context                       │
│  • Has access to project chat history                            │
│  • Can fetch additional project files                            │
│  • Generates code changes                                        │
│  • Applies changes to correct file + line                        │
└─────────────────────────────────────────────────────────────────┘
```

### Chat Message Schema

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;

  // Rich context (only for user messages from inspect mode)
  context?: InspectContext;
}

interface InspectContext {
  type: 'inspect-click' | 'manual-input';

  // Clicked element details (from inspect mode)
  element?: {
    selector: string;           // CSS selector: "button.primary"
    xpath?: string;             // XPath: "/html/body/div/button[1]"
    tagName: string;            // "BUTTON"
    className?: string;         // "primary large"
    id?: string;                // "submit-btn"
    textContent?: string;       // "Submit"
    attributes?: Record<string, string>;
  };

  // Source file location (Roopik advantage!)
  file?: {
    path: string;               // "src/components/Button.tsx"
    line: number;               // 42
    column?: number;            // 15
    componentName?: string;     // "PrimaryButton"
  };

  // Computed styles (from CDP CSS domain)
  styles?: {
    computed: Record<string, string>;  // All computed styles
    matched: Array<{                   // Matched CSS rules
      selector: string;
      source: string;                  // File path or <style>
      properties: Record<string, string>;
    }>;
  };

  // Component tree context (for framework-aware editing)
  component?: {
    framework: 'react' | 'vue' | 'svelte';
    props?: Record<string, any>;      // React props
    state?: Record<string, any>;      // Component state
    parent?: string;                  // Parent component name
    children?: string[];              // Child components
  };

  // Project metadata
  project: {
    id: string;
    path: string;
    framework: string;
    url: string;                      // Running dev server URL
    port: number;
  };

  // Git context (helps agent decide whether to modify or warn)
  git?: {
    branch: string;                   // Current branch name
    modified: boolean;                // Is file dirty (uncommitted changes)?
    staged: boolean;                  // Is file staged for commit?
    lastCommit?: {
      hash: string;                   // Short commit hash
      message: string;                // Commit message
      author: string;                 // Commit author
      date: string;                   // Commit date
    };
  };
}
```

### Storage Structure

```
.roopik/
├── projects/
│   ├── projects.json              # Project registry with active status
│   └── {projectId}/
│       └── chat/
│           ├── history.json       # Chat message history
│           └── sessions/          # Future: Multiple sessions per project
│               └── session-1.json
│
└── canvases/
    ├── canvases.json              # Canvas registry (with chatTaskId)
    └── {canvasId}/
        ├── components/            # Component storage
        └── chat/
            ├── history.json       # Canvas-specific chat history
            └── sessions/
                └── session-1.json
```

### Storage Pattern Consistency

Both Projects and Canvases follow the same storage pattern for predictability:

| Storage | Projects | Canvases |
|---------|----------|----------|
| **Registry** | `.roopik/projects/projects.json` | `.roopik/canvases/canvases.json` |
| **Per-item folder** | `.roopik/projects/{projectId}/` | `.roopik/canvases/{canvasId}/` |
| **Chat history** | `.roopik/projects/{projectId}/chat/history.json` | `.roopik/canvases/{canvasId}/chat/history.json` |
| **Active status** | `activeServer` field in registry | `chatTaskId` field in registry |

**Benefits of Consistent Pattern:**
- ✅ Predictable file locations
- ✅ Same code can handle both modes
- ✅ Easy to extend (add more per-item storage)
- ✅ Clear separation between modes

### Bridge API Extensions

```typescript
interface RoopikBridge {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 10. CHAT SESSION MANAGEMENT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Get chat history for a project
   * Returns all messages with rich context preserved
   */
  getChatHistory(projectId: string): Promise<ChatMessage[]>;

  /**
   * Append message to project chat history
   * Used when user sends message from inspect mode or manual input
   */
  appendChatMessage(projectId: string, message: ChatMessage): Promise<void>;

  /**
   * Clear chat history for a project (or start new session)
   */
  clearChatHistory(projectId: string): Promise<void>;

  /**
   * Get current inspect context (when user clicked element)
   * This is called before sending chat message to gather rich context
   */
  getCurrentInspectContext(): Promise<InspectContext | undefined>;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 11. RICH CONTEXT COLLECTION (Roopik Advantage)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Get element source location (file + line)
   * Uses data-roopik-source attribute or source map resolution
   */
  getElementSourceLocation(selector: string): Promise<{
    path: string;
    line: number;
    column?: number;
    componentName?: string;
  } | undefined>;

  /**
   * Get element styles with source information
   * Already exists in IProjectModeService.getElementStyles()
   */
  getElementStyles(selector: string): Promise<StyleInfo>;

  /**
   * Get component tree context (framework-specific)
   * Uses React Fiber, Vue __vue__, etc.
   */
  getComponentContext(selector: string): Promise<ComponentContext | undefined>;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 12. FRAMEWORK-SPECIFIC CONTEXT (Advanced)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Get React-specific component information
   * Uses React DevTools globals (__REACT_DEVTOOLS_GLOBAL_HOOK__)
   *
   * Extracts:
   * - Component name from Fiber node
   * - Props (current values)
   * - Hooks state (useState, useReducer, etc.)
   * - Context values
   */
  getReactComponentInfo(selector: string): Promise<{
    componentName: string;
    props: Record<string, any>;
    hooks: Array<{
      name: string;           // 'useState', 'useEffect', etc.
      value: any;             // Current hook value
      deps?: any[];           // Dependencies (for useEffect, useMemo, etc.)
    }>;
    context: Record<string, any>;  // React Context values
    fiber?: any;                   // Raw fiber for advanced use
  } | undefined>;

  /**
   * Get Vue-specific component information
   * Uses Vue's __vue__ or __vueParentComponent property
   *
   * Extracts:
   * - Component name
   * - Props (passed from parent)
   * - Data (reactive state)
   * - Computed properties
   * - Methods list
   */
  getVueComponentInfo(selector: string): Promise<{
    componentName: string;
    props: Record<string, any>;
    data: Record<string, any>;
    computed: Record<string, any>;
    methods: string[];             // List of method names
    emits: string[];               // Emitted events
  } | undefined>;

  /**
   * Get Svelte-specific component information
   * Uses Svelte's $$  internal properties
   */
  getSvelteComponentInfo(selector: string): Promise<{
    componentName: string;
    props: Record<string, any>;
    state: Record<string, any>;    // $: reactive statements
  } | undefined>;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 13. GIT CONTEXT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Get git status for a specific file
   * Used to warn agent about uncommitted changes
   */
  getFileGitStatus(filePath: string): Promise<{
    branch: string;
    modified: boolean;
    staged: boolean;
    lastCommit?: {
      hash: string;
      message: string;
      author: string;
      date: string;
    };
  } | undefined>;
}
```

### Implementation Flow

#### 1. User Clicks Element in Inspect Mode

```typescript
// In inspect mode feature (Project Mode editor)
async handleElementClick(selector: string) {
  // 1. Collect rich context
  const context: InspectContext = {
    type: 'inspect-click',

    // Element details (from CDP DOM)
    element: await this.getElementDetails(selector),

    // Source location (Roopik's click-to-source)
    file: await this.getElementSourceLocation(selector),

    // Computed styles (from CDP CSS)
    styles: await this.browserService.getElementStyles({
      selector,
      projectRoot: this.currentProjectRoot!
    }),

    // Component context (framework-specific)
    component: await this.getComponentContext(selector),

    // Project metadata
    project: {
      id: this.currentProjectId!,
      path: this.currentProjectRoot!,
      framework: this.currentFramework!,
      url: this.currentServerUrl!,
      port: this.currentServerPort!
    }
  };

  // 2. Store context temporarily for chat input
  this.pendingInspectContext = context;

  // 3. Show chat input box with context indicator
  this.showChatInputWithContext(context);
}
```

#### 2. User Types Message and Submits

```typescript
async handleChatSubmit(userMessage: string) {
  const bridge = await this.getProjectModeBridge();

  // 1. Create chat message with rich context
  const message: ChatMessage = {
    id: generateId(),
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
    context: this.pendingInspectContext  // Rich context from click
  };

  // 2. Append to project chat history
  await bridge.appendChatMessage(this.currentProjectId!, message);

  // 3. Send to Roopik-Dio agent
  await this.sendToAgent(message);

  // 4. Clear pending context
  this.pendingInspectContext = undefined;
}
```

#### 3. Dio Agent Processes Message

```typescript
// In roopik-dio extension
async handleUserMessage(message: ChatMessage) {
  const bridge = await getProjectModeBridge();

  // 1. Load full chat history for context
  const history = await bridge.getChatHistory(message.context!.project.id);

  // 2. Extract rich context from message
  const { element, file, styles, component, project } = message.context!;

  // 3. Construct AI prompt with all context
  const prompt = `
User Request: ${message.content}

Project Context:
- Framework: ${project.framework}
- Running at: ${project.url}

Element Context:
- Selector: ${element.selector}
- Source File: ${file.path} (line ${file.line})
- Component: ${file.componentName}

Current Styles:
${JSON.stringify(styles.computed, null, 2)}

Component State:
${JSON.stringify(component, null, 2)}

Previous Conversation:
${history.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}
  `;

  // 4. Send to LLM with rich context
  const response = await this.llm.chat(prompt);

  // 5. Parse and apply code changes
  await this.applyChanges(response, file.path, file.line);

  // 6. Save assistant response to history
  await bridge.appendChatMessage(project.id, {
    id: generateId(),
    role: 'assistant',
    content: response,
    timestamp: new Date().toISOString()
  });
}
```

### Advantages of This Architecture

✅ **Scoped Context:** Each project has isolated chat history
✅ **Rich Context:** Backend provides exact file, line, styles, component info
✅ **Click-to-Source:** Roopik's advantage - knows exactly where code is
✅ **Framework-Aware:** Can access React props, Vue data, etc.
✅ **Persistent History:** Conversations survive IDE restart
✅ **Accurate Edits:** Agent knows exact file + line to modify
✅ **No Ambiguity:** No need to search for code - context provides location

### Future Enhancements

⏳ **Multiple Sessions:** Allow user to start new chat session within project
⏳ **Session Branching:** Fork conversation at any point
⏳ **Context Filtering:** User can choose which context to include
⏳ **Cross-Project Context:** Reference code from other projects (with user permission)

---

## 9. Next Steps - Implementation Phases

> **Note:** Timeline references (Week 1, Day 1-2, etc.) are for relative ordering only - focus on what needs to be done, not when.

---

### Phase 1: Project Status Persistence (Foundation)

**Goal:** Enable persistent tracking of running dev servers across IDE restarts

#### 1.1 Enhance Project Storage Schema
- **File:** `src/vs/workbench/contrib/roopik/common/storage/storageTypes.ts`
- **Add:** `activeServer` field to `ProjectInfo` interface
- **Fields:** port, url, pid, startedAt, lastHealthCheck

#### 1.2 Implement Status Tracking Methods
- **File:** `src/vs/workbench/contrib/roopik/electron-main/projectStorage/projectStorageService.ts`
- **Add methods:**
  - `setActiveServer(projectPath, status)`
  - `clearActiveServer(projectPath)`
  - `getActiveProjectWithHealthCheck()`
  - `checkPortAlive(port)` - TCP socket check
  - `checkPidAlive(pid)` - Process existence check

#### 1.3 Integrate with DevServer Lifecycle
- **File:** `src/vs/workbench/contrib/roopik/electron-main/projectMode/devServer/devServerService.ts`
- **Update:** Call `setActiveServer()` on server start (when READY message received)
- **Update:** Call `clearActiveServer()` on server stop
- **Update:** Check health before returning status

---

### Phase 2: Bridge Service Setup

**Goal:** Create type-safe bridge between Extension and Core

#### 2.1 Core Bridge Commands
- **File:** `src/vs/workbench/contrib/roopik/browser/commands/projectModeCommands.ts`
- **Register commands:**
  - `roopik.core.startProject`
  - `roopik.core.stopProject`
  - `roopik.core.getProjectStatus`
  - `roopik.core.getRunningProject`
  - `roopik.core.detectFramework`
  - `roopik.core.retryStartProject`
  - `roopik.core.forceStopProject`

#### 2.2 Event Forwarding
- **File:** `src/vs/workbench/contrib/roopik/browser/projectMode/eventBridge.ts`
- **Purpose:** Forward Core events to Extension
- **Events:**
  - `onDevServerStatusChanged`
  - `onDevServerLog`
  - `onConsoleMessage`

---

### Phase 3: Core Lifecycle APIs

**Goal:** Implement all project lifecycle functionality

- ✅ `startProject()` - Calls `devServerService.startServer()` + `editor.startProjectPreview()`
- ✅ `stopProject()` - Calls `devServerService.stopServer()`
- ✅ `getProjectStatus()` - Uses `getActiveProjectWithHealthCheck()` with self-healing
- ✅ `getRunningProject()` - Calls enhanced storage service
- ✅ `detectFramework()` - Calls `devServerService.detectFramework()`
- ✅ `retryStartProject()` - Clears state and retries
- ✅ `forceStopProject()` - Sends SIGKILL instead of SIGTERM

---

### Phase 4: Navigation & Visual APIs

**Goal:** Enable AI agent to interact with and verify browser preview

#### 4.1 Navigation Commands
- **File:** `src/vs/workbench/contrib/roopik/browser/commands/projectModeCommands.ts`
- **Add commands:**
  - `roopik.core.navigate`
  - `roopik.core.reload`
  - `roopik.core.getCurrentUrl`

#### 4.2 Screenshot Capture
- **File:** `src/vs/workbench/contrib/roopik/electron-main/projectMode/browserViewService.ts`
- **Add method:** `takeScreenshot(options)` using `webContents.capturePage()`
- **Returns:** Base64 encoded PNG/JPEG

---

### Phase 5: CDP Integration

**Goal:** Enable console logging and advanced debugging

#### 5.1 Console Logging
- `enableConsoleLogging()` - Attach debugger + enable Console domain
- `onConsoleMessage` - Subscribe to CDP Console events

#### 5.2 CDP Access
- `getCDPDebugUrl()` - Return WebSocket URL for MCP integration
- `sendCDPCommand()` - Execute arbitrary CDP commands

#### 5.3 Network Monitoring (Optional)
- `enableNetworkMonitoring()`
- `onNetworkRequest`, `onNetworkResponse`

---

### Phase 6: Chat Session Storage

**Goal:** Persist per-project chat history with rich context

#### 6.1 Chat History Storage Service
- **File:** `src/vs/workbench/contrib/roopik/electron-main/projectStorage/chatHistoryService.ts`
- **Storage:** `.roopik/projects/{projectId}/chat/history.json`
- **Methods:**
  - `getChatHistory(projectId)`
  - `appendChatMessage(projectId, message)`
  - `clearChatHistory(projectId)`

#### 6.2 Rich Context Collection
- **File:** `src/vs/workbench/contrib/roopik/browser/projectMode/contextCollector.ts`
- **Purpose:** Gather element, file, style, component, git context
- **Methods:**
  - `getElementDetails(selector)`
  - `getElementSourceLocation(selector)`
  - `getElementStyles(selector)`
  - `getComponentContext(selector)`
  - `getFileGitStatus(filePath)`

#### 6.3 Inspect Mode Integration
- **File:** `src/vs/workbench/contrib/roopik/browser/projectMode/features/inspectMode.ts`
- **Update:** Store pending context on element click
- **Add:** `getCurrentInspectContext()` method for bridge
- **Add:** Chat input box with context indicator UI

---

### Phase 7: Framework-Specific Context

**Goal:** Extract React/Vue/Svelte component information

#### 7.1 React Context Extraction
- **File:** `src/vs/workbench/contrib/roopik/browser/projectMode/frameworks/reactInspector.ts`
- **Uses:** `__REACT_DEVTOOLS_GLOBAL_HOOK__`
- **Extracts:** Component name, props, hooks, context

#### 7.2 Vue Context Extraction
- **File:** `src/vs/workbench/contrib/roopik/browser/projectMode/frameworks/vueInspector.ts`
- **Uses:** `__vue__` or `__vueParentComponent`
- **Extracts:** Component name, props, data, computed, methods

#### 7.3 Svelte Context Extraction
- **File:** `src/vs/workbench/contrib/roopik/browser/projectMode/frameworks/svelteInspector.ts`
- **Uses:** Svelte's `$$` internals
- **Extracts:** Component name, props, state

---

### Phase 8: Extension Integration

**Goal:** Connect Dio agent to Project Mode via bridge

#### 8.1 Dio Agent Chat Handler
- **File:** `extensions/roopik-dio/src/chat/projectChatHandler.ts`
- **Purpose:** Handle messages with rich context from Project Mode
- **Features:**
  - Load chat history for context
  - Extract rich context (element, file, styles)
  - Construct AI prompt with all context
  - Apply code changes to exact file + line
  - Save response to chat history

#### 8.2 Context-Aware Code Generation
- **File:** `extensions/roopik-dio/src/services/contextAwareGenerator.ts`
- **Purpose:** Use rich context for precise code edits
- **Features:**
  - Parse file location from context
  - Apply changes at exact line number
  - Preserve surrounding code
  - Framework-aware transformations

---

### Phase 9: Testing

**Goal:** Ensure reliability across all scenarios

#### Unit Tests
- ✅ Project status persistence (set/clear/healthCheck/pidCheck)
- ✅ Chat history storage (append/retrieve/clear)
- ✅ Context collection (element/file/styles/component/git)
- ✅ Self-healing metadata logic

#### Integration Tests
- ✅ Project startup → status persists → verify after restart
- ✅ Element click → context gathered → chat message created
- ✅ Chat message → agent receives → code applied → history saved
- ✅ Stale metadata → health check fails → auto-fixes
- ✅ Screenshot capture → returns valid base64 image

#### E2E Tests
- ✅ Full flow: Start project → click element → chat → code change → verify
- ✅ Error scenarios: Port conflict, missing dependencies, stale metadata
- ✅ Multiple projects: Switch between projects, chat history isolated
- ✅ Session persistence: Restart IDE, chat history preserved
- ✅ Visual verification: Agent takes screenshot → analyzes result

---

## 10. Summary of Key Decisions

### 1. Project Status Persistence ✅
**Decision:** Store active server status in `.roopik/projects/projects.json`
**Rationale:** Single source of truth, survives IDE restart, enables self-healing
**Implementation:** Add `activeServer` field with port, url, pid, timestamps

### 2. Self-Healing Metadata ✅
**Decision:** Verify port is actually listening before returning status
**Rationale:** Prevents stale metadata issues (process killed externally)
**Implementation:** TCP socket check in `getActiveProjectWithHealthCheck()`

### 3. Per-Project Chat Sessions ✅
**Decision:** Isolate chat history per project with rich context injection
**Rationale:** Relevant context stays scoped, previous conversations preserved
**Storage:** `.roopik/projects/{projectId}/chat/history.json`

### 4. Rich Context from Backend ✅
**Decision:** Backend automatically collects element, file, style, component context
**Rationale:** Roopik advantage - knows exact code location from click-to-source
**Benefits:** No ambiguity, accurate edits, framework-aware changes

### 5. Bridge API Architecture ✅
**Decision:** Individual granular commands instead of single bridge object
**Rationale:** Follows existing patterns (componentCommands.ts), allows finer-grained permission control, easier to test
**Commands:** Individual `roopik.core.*` commands (see Phase 2)

### 6. Command Registration Pattern ✅
**Decision:** Use individual commands matching existing `componentCommands.ts` pattern
**Rationale:** Consistent with codebase, auditable, testable

```typescript
// ✅ PREFERRED: Individual commands (granular, easier to audit)
'roopik.core.startProject'
'roopik.core.stopProject'
'roopik.core.getProjectStatus'
'roopik.core.getRunningProject'
'roopik.core.detectFramework'
'roopik.core.navigate'
'roopik.core.reload'
'roopik.core.takeScreenshot'
'roopik.core.enableConsoleLogging'
'roopik.core.getCDPDebugUrl'
// ... etc

// Extension calls individual commands
const url = await vscode.commands.executeCommand<string>(
  'roopik.core.startProject',
  { projectPath: '/path/to/project' }
);

// ❌ AVOID: Single bridge object (harder to audit permissions)
// const bridge = await vscode.commands.executeCommand('roopik.getProjectModeBridge');
// bridge.startProject(...);
```

**Benefits:**
- ✅ Matches existing `componentCommands.ts` pattern
- ✅ Each command can have individual permission checks
- ✅ Easier to test commands in isolation
- ✅ Clear audit trail of what extension can do
- ✅ Type-safe with generics: `executeCommand<ReturnType>('command', params)`

---

## Related Documentation

- [Canvas Mode API Analysis](./CANVAS_MODE_API_ANALYSIS.md) - Next to analyze
- [Roopik VS Code Modifications](./VSCODE_MODIFICATIONS.md) - Core architecture overview
- [Mode 2 Security](./MODE2_SECURITY.md) - Security considerations for Project Mode
- [Plugin Architecture](./PLUGIN_ARCHITECTURE.md) - Vite plugin integration

---

**Status:** ✅ Analysis Complete + Enhanced with Persistence & Chat ArchitecturetProjectModeBridge');
  }
  ```

### Phase 2: Implement Core APIs (Week 1-2)

- ✅ `startProject()` - Calls `devServerService.startServer()` + `editor.startProjectPreview()`
- ✅ `stopProject()` - Calls `devServerService.stopServer()`
- ✅ `getProjectStatus()` - Calls `devServerService.getServerInfo()`
- ✅ `getRunningProject()` - Calls `devServerService.getRunningServer()`
- ✅ `detectFramework()` - Calls `devServerService.detectFramework()`
- ✅ Event forwarding: `onDevServerStatusChanged`, `onDevServerLog`

### Phase 3: CDP Integration (Week 2)

- ✅ `enableConsoleLogging()` - Attach debugger + enable Console domain
- ✅ `onConsoleMessage` - Subscribe to CDP Console events
- ✅ `getCDPDebugUrl()` - Return WebSocket URL for MCP
- ⏳ Network monitoring (future)

### Phase 4: Documentation (Week 2)

- ✅ API reference for Dio agent developers
- ✅ Example usage patterns (see section 5)
- ✅ Error handling guide
- ⏳ Integration with Dio agent architecture

### Phase 5: Testing (Week 2-3)

- Unit tests for bridge service
- Integration tests for project startup flow
- E2E tests with actual Vite projects
- Error scenario testing (port conflicts, missing dependencies, etc.)

---

## File Locations Reference

### Core Services (Main Process)

| Service | File Path |
|---------|-----------|
| IDevServerService | `src/vs/workbench/contrib/roopik/electron-main/projectMode/devServer/devServerService.ts` |
| IProjectModeService | `src/vs/workbench/contrib/roopik/electron-main/projectMode/browserViewService.ts` |
| IProjectStorageService | `src/vs/workbench/contrib/roopik/electron-main/projectStorage/projectStorageService.ts` |
| Dev Server Worker | `src/vs/workbench/contrib/roopik/electron-main/projectMode/devServer/devServerWorker.mjs` |

### Renderer Services (Browser Process)

| Service | File Path |
|---------|-----------|
| Project Mode Editor | `src/vs/workbench/contrib/roopik/browser/projectMode/editor.ts` |
| Service Bridge | `src/vs/workbench/contrib/roopik/browser/projectMode/serviceBridge.ts` |
| DevServer Bridge | `src/vs/workbench/contrib/roopik/browser/projectMode/devServerBridge.ts` |

### Common/Types

| Type Definition | File Path |
|-----------------|-----------|
| IDevServerService (interface) | `src/vs/workbench/contrib/roopik/common/projectMode/devServer.ts` |
| IProjectModeService (interface) | `src/vs/workbench/contrib/roopik/common/projectMode/ipc.ts` |
| IProjectStorageService (interface) | `src/vs/workbench/contrib/roopik/common/projectStorage/projectStorageService.ts` |
| Project Types | `src/vs/workbench/contrib/roopik/common/projectMode/types.ts` |

### Storage

| Storage | Location |
|---------|----------|
| Project Registry | `.roopik/projects/projects.json` |
| Project Metadata | Stored per project entry in registry |

---

## Related Documentation

- [Canvas Mode API Analysis](./CANVAS_MODE_API_ANALYSIS.md) - Next to analyze
- [Roopik VS Code Modifications](./VSCODE_MODIFICATIONS.md) - Core architecture overview
- [Mode 2 Security](./MODE2_SECURITY.md) - Security considerations for Project Mode
- [Plugin Architecture](./PLUGIN_ARCHITECTURE.md) - Vite plugin integration

---

**Status:** ✅ Analysis Complete + Enhanced with All Improvements
**Last Updated:** December 21, 2025
**Next:** Begin Phase 1 Implementation (Project Status Persistence)
