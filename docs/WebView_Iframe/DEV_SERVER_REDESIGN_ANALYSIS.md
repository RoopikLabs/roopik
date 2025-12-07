# Dev Server Redesign: Tool-Calling Architecture & Log Streaming

## 🔍 Current Problem Analysis

### What We Have Now
- **Vite Programmatic API**: We use `createServer()` in a worker process
- **Custom Logs Only**: We only see our `console.log('[Roopik Worker]...')` statements
- **Missing Framework Logs**: Vite's internal logs (dependency optimization, HMR, etc.) are NOT captured
- **No npm Output**: We don't see `npm run dev` output (warnings, errors, dependency issues)

### Why This Happens
```javascript
// serverWorker.js - We use programmatic API
const server = await createServer({ ... });
await server.listen();
// Vite's logger goes to its own stream, not stdout!
```

**Vite's programmatic API uses a custom logger** that doesn't automatically go to stdout/stderr. We need to intercept it.

---

## 🎯 How Cursor/Copilot/Windsurf Do It

### Method 1: Spawn Terminal Commands
```typescript
// They spawn actual npm commands
const process = spawn('npm', ['run', 'dev'], {
  cwd: projectRoot,
  stdio: ['pipe', 'pipe', 'pipe']
});

// Capture ALL output
process.stdout.on('data', (data) => {
  // Stream to AI agent + UI
  streamLog(data.toString());
});

process.stderr.on('data', (data) => {
  // Stream errors
  streamError(data.toString());
});
```

### Method 2: VS Code Terminal API
```typescript
// Create terminal programmatically
const terminal = vscode.window.createTerminal({
  name: 'Dev Server',
  cwd: projectRoot
});

// Execute command
terminal.sendText('npm run dev');

// Capture output via terminal API
// (VS Code provides terminal output events)
```

### Method 3: Hybrid Approach (Best)
- Use `spawn()` for command execution
- Capture stdout/stderr directly
- Also create VS Code terminal for user visibility
- Stream logs to both UI and AI agent

---

## 🏗️ Recommended Architecture (2025 Best Practices)

### Tool-Calling Design Pattern

```typescript
// Tool definition (for AI agent)
interface DevServerTool {
  name: 'startDevServer';
  description: 'Start development server for project';
  parameters: {
    projectRoot: string;
    port?: number;
    framework?: string;
    mode?: 'programmatic' | 'npm-command';
  };
  returns: {
    url: string;
    processId: number;
    logStream: ReadableStream<string>;
  };
}
```

### Unified Service Layer

```typescript
// src/services/devServerService.ts
export class DevServerService {
  // Can be called from UI or AI agent
  async startServer(params: StartServerParams): Promise<ServerInstance> {
    // 1. Choose execution mode
    if (params.mode === 'npm-command') {
      return this.startViaNpmCommand(params);
    } else {
      return this.startViaProgrammaticAPI(params);
    }
  }

  // Method 1: npm command (captures ALL logs)
  private async startViaNpmCommand(params: StartServerParams) {
    const process = spawn('npm', ['run', 'dev'], {
      cwd: params.projectRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Stream logs
    const logStream = new EventEmitter();

    process.stdout.on('data', (data) => {
      const log = data.toString();
      logStream.emit('log', { level: 'info', message: log });
      this.broadcastLog('info', log); // To UI + AI agent
    });

    process.stderr.on('data', (data) => {
      const log = data.toString();
      logStream.emit('log', { level: 'error', message: log });
      this.broadcastLog('error', log); // To UI + AI agent
    });

    return {
      url: await this.waitForServerReady(process),
      processId: process.pid,
      logStream
    };
  }

  // Method 2: Programmatic API (with logger interception)
  private async startViaProgrammaticAPI(params: StartServerParams) {
    // Intercept Vite's logger
    const viteLogger = this.createViteLoggerInterceptor();

    const server = await createServer({
      ...config,
      customLogger: viteLogger // Use our logger
    });

    // Stream logs
    viteLogger.on('log', (log) => {
      this.broadcastLog(log.level, log.message);
    });

    return {
      url: await server.listen(),
      processId: process.pid,
      logStream: viteLogger.stream
    };
  }

  // Broadcast to UI + AI agent
  private broadcastLog(level: string, message: string) {
    // 1. Send to VS Code output channel
    this.outputChannel.append(`[${level}] ${message}`);

    // 2. Send to AI agent (if active)
    if (this.aiAgent) {
      this.aiAgent.receiveLog({ level, message, timestamp: Date.now() });
    }

    // 3. Send to webview (if preview panel open)
    if (this.previewPanel) {
      this.previewPanel.postMessage({
        type: 'dev-server-log',
        level,
        message
      });
    }
  }
}
```

---

## 📊 Comparison: Programmatic vs npm Command

| Feature | Programmatic API | npm Command |
|---------|------------------|-------------|
| **Log Capture** | ❌ Need custom logger | ✅ Automatic |
| **Framework Logs** | ❌ Missing | ✅ Full output |
| **npm Warnings** | ❌ Missing | ✅ Captured |
| **Dependency Errors** | ❌ Missing | ✅ Captured |
| **Control** | ✅ Full control | ⚠️ Limited |
| **Plugin Injection** | ✅ Easy | ❌ Harder |
| **Performance** | ✅ Faster startup | ⚠️ Slower |

---

## 🎯 Recommended Solution: Hybrid Approach

### Strategy
1. **Default**: Use programmatic API (faster, more control)
2. **With Logger Interception**: Capture Vite's internal logs
3. **Fallback**: Use npm command if programmatic fails
4. **Tool-Callable**: Expose as function with parameters

### Implementation

```typescript
// src/services/devServerService.ts
export class DevServerService {
  private logEmitter = new EventEmitter();
  private activeServers = new Map<string, ServerInstance>();

  /**
   * Start dev server (callable from UI or AI agent)
   */
  async startServer(params: {
    projectRoot: string;
    port?: number;
    mode?: 'auto' | 'programmatic' | 'npm-command';
    streamLogs?: boolean; // For AI agent
  }): Promise<ServerInstance> {
    const mode = params.mode || 'auto';

    // Try programmatic first (faster)
    if (mode === 'auto' || mode === 'programmatic') {
      try {
        return await this.startProgrammatic(params);
      } catch (error) {
        if (mode === 'auto') {
          // Fallback to npm command
          return await this.startNpmCommand(params);
        }
        throw error;
      }
    } else {
      return await this.startNpmCommand(params);
    }
  }

  /**
   * Programmatic API with logger interception
   */
  private async startProgrammatic(params: StartServerParams) {
    const worker = fork(workerPath, [], {
      cwd: params.projectRoot,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    // Create log interceptor
    const logInterceptor = new LogInterceptor();

    // Intercept stdout/stderr
    worker.stdout.on('data', (data) => {
      const log = data.toString();
      logInterceptor.process(log, 'stdout');
      this.emitLog('info', log);
    });

    worker.stderr.on('data', (data) => {
      const log = data.toString();
      logInterceptor.process(log, 'stderr');
      this.emitLog('error', log);
    });

    // Send START command with logger config
    worker.send({
      type: 'START',
      payload: {
        ...params,
        interceptLogger: true // Tell worker to use our logger
      }
    });

    return {
      process: worker,
      logStream: logInterceptor.stream,
      url: await this.waitForReady(worker)
    };
  }

  /**
   * npm command (captures everything)
   */
  private async startNpmCommand(params: StartServerParams) {
    const npmProcess = spawn('npm', ['run', 'dev'], {
      cwd: params.projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    // Stream all output
    npmProcess.stdout.on('data', (data) => {
      this.emitLog('info', data.toString());
    });

    npmProcess.stderr.on('data', (data) => {
      this.emitLog('error', data.toString());
    });

    // Parse URL from output
    const url = await this.parseUrlFromOutput(npmProcess);

    return {
      process: npmProcess,
      logStream: this.createStreamFromProcess(npmProcess),
      url
    };
  }

  /**
   * Emit log to all subscribers (UI + AI agent)
   */
  private emitLog(level: 'info' | 'warn' | 'error', message: string) {
    const logEntry = {
      level,
      message,
      timestamp: Date.now(),
      source: 'dev-server'
    };

    // 1. Output channel
    this.outputChannel.append(`[${level.toUpperCase()}] ${message}`);

    // 2. AI agent (if active)
    this.aiAgent?.receiveLog(logEntry);

    // 3. Webview (if preview open)
    this.previewPanel?.postMessage({
      type: 'dev-server-log',
      ...logEntry
    });

    // 4. Event emitter (for tool calling)
    this.logEmitter.emit('log', logEntry);
  }

  /**
   * Get log stream (for AI agent)
   */
  getLogStream(serverId: string): ReadableStream<string> {
    const server = this.activeServers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    return server.logStream;
  }
}
```

---

## 🔧 Vite Logger Interception

### In serverWorker.js

```javascript
// serverWorker.js
const { createServer } = require('vite');

// Custom logger that forwards to parent
const customLogger = {
  info(msg) {
    console.log(`[Vite] ${msg}`);
    process.send({ type: 'LOG', level: 'info', message: msg });
  },
  warn(msg) {
    console.warn(`[Vite] ${msg}`);
    process.send({ type: 'LOG', level: 'warn', message: msg });
  },
  error(msg) {
    console.error(`[Vite] ${msg}`);
    process.send({ type: 'LOG', level: 'error', message: msg });
  }
};

async function startViteServer(config) {
  const server = await createServer({
    ...config,
    logLevel: 'info',
    customLogger: customLogger // Use our logger
  });

  await server.listen();
  return { url: `http://127.0.0.1:${server.config.server.port}` };
}
```

---

## 🤖 AI Agent Integration

### Tool Definition

```typescript
// src/ai/tools/startDevServer.ts
export const startDevServerTool = {
  name: 'startDevServer',
  description: 'Start development server for a project. Returns server URL and log stream.',
  parameters: {
    type: 'object',
    properties: {
      projectRoot: {
        type: 'string',
        description: 'Path to project root directory'
      },
      port: {
        type: 'number',
        description: 'Port number (default: 5173)'
      },
      mode: {
        type: 'string',
        enum: ['auto', 'programmatic', 'npm-command'],
        description: 'Execution mode'
      }
    },
    required: ['projectRoot']
  }
};

// Tool executor
export async function executeStartDevServer(params: any) {
  const service = DevServerService.getInstance();
  const instance = await service.startServer(params);

  // Return server info + log stream reference
  return {
    url: instance.url,
    processId: instance.processId,
    logStreamId: instance.logStreamId, // Reference for streaming
    message: `Dev server started at ${instance.url}`
  };
}
```

### Streaming Logs to AI Agent

```typescript
// AI agent can subscribe to logs
const logStream = devServerService.getLogStream(serverId);

for await (const log of logStream) {
  // AI agent receives logs in real-time
  await aiAgent.processLog(log);

  // Can react to errors
  if (log.level === 'error') {
    await aiAgent.handleError(log);
  }
}
```

---

## 📋 Implementation Checklist

### Phase 1: Logger Interception
- [ ] Create custom Vite logger in serverWorker.js
- [ ] Forward logs via IPC to extension
- [ ] Test that framework logs appear

### Phase 2: Unified Service
- [ ] Create `DevServerService` class
- [ ] Support both programmatic and npm modes
- [ ] Implement log streaming

### Phase 3: Tool Calling
- [ ] Define tool schema
- [ ] Implement tool executor
- [ ] Add log stream access

### Phase 4: AI Agent Integration
- [ ] Subscribe to log streams
- [ ] Handle errors automatically
- [ ] Stream logs to agent context

---

## 🎯 Benefits

1. **Full Log Capture**: See ALL logs (framework + npm + custom)
2. **Tool-Callable**: AI agent can start servers with parameters
3. **Streaming**: Real-time log delivery to UI + AI agent
4. **Flexible**: Works for both UI and programmatic use
5. **Error Handling**: AI agent can react to errors automatically

---

## 🚀 Next Steps

1. **Implement logger interception** in serverWorker.js
2. **Create DevServerService** with unified API
3. **Add tool calling support** for AI agent
4. **Test with real projects** to verify log capture

This architecture will give you the same capabilities as Cursor/Copilot while maintaining your custom plugin injection!

