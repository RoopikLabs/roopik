# Agent-DIO Architecture & Roopik Integration

> Complete technical documentation for agent-dio's tool system and the plan to integrate Roopik IDE tools via IPC.

---

## Table of Contents

1. [Overall Architecture](#1-overall-architecture)
2. [Tool Execution Flow](#2-tool-execution-flow)
3. [Tool System Deep Dive](#3-tool-system-deep-dive)
4. [Current Browser Tools (Puppeteer)](#4-current-browser-tools-puppeteer)
5. [Current MCP Tool System](#5-current-mcp-tool-system)
6. [Integration Plan: IPC for Roopik Tools](#6-integration-plan-ipc-for-roopik-tools)
7. [Implementation Steps](#7-implementation-steps)
8. [Browser Tool Replacement Strategy](#8-browser-tool-replacement-strategy)
9. [Tool Definitions for LLM](#9-tool-definitions-for-llm)
10. [Key Files Reference](#10-key-files-reference)

---

## 1. Overall Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         agent-dio Extension                              │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │   LLM Provider  │    │   Task Engine   │    │   Tool System   │     │
│  │  (Anthropic,    │◄──►│  (Task.ts)      │◄──►│  (BaseTool,     │     │
│  │   OpenAI, etc)  │    │                 │    │   Handlers)     │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│           │                     │                      │               │
│           │                     ▼                      ▼               │
│           │            ┌─────────────────┐    ┌─────────────────┐     │
│           │            │ Message Parser  │    │ Tool Executors  │     │
│           │            │ (Native/XML)    │    │ - File tools    │     │
│           │            └─────────────────┘    │ - Browser tools │     │
│           │                                   │ - MCP tools     │     │
│           │                                   └────────┬────────┘     │
│           │                                            │               │
│           ▼                                            ▼               │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                        Services Layer                            │  │
│  ├──────────────┬──────────────┬──────────────┬────────────────────┤  │
│  │  McpHub      │ BrowserSession│ CodeIndex   │ Terminal Service   │  │
│  │ (MCP client) │ (Puppeteer)   │ (Search)    │ (Shell commands)   │  │
│  └──────┬───────┴──────┬────────┴─────────────┴────────────────────┘  │
│         │              │                                               │
└─────────┼──────────────┼───────────────────────────────────────────────┘
          │              │
          ▼              ▼
┌─────────────────┐  ┌─────────────────────────────────────────────────┐
│  MCP Servers    │  │            Roopik Core (electron-main)          │
│  (External)     │  │  ┌─────────────────────────────────────────────┐│
│  - HTTP/SSE     │  │  │  Services: BrowserView, Component, Canvas   ││
│  - Stdio        │  │  │  MCP Server: rpk_* tools                    ││
└─────────────────┘  │  └─────────────────────────────────────────────┘│
                     └─────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Task Engine** | `src/core/task/Task.ts` | Main agentic loop, manages conversation state |
| **Tool System** | `src/core/tools/` | Tool definitions and handlers |
| **Message Parser** | `src/core/assistant-message/` | Parses LLM responses (Native/XML protocols) |
| **McpHub** | `src/services/mcp/McpHub.ts` | Manages MCP server connections |
| **BrowserSession** | `src/services/browser/BrowserSession.ts` | Puppeteer browser control |

---

## 2. Tool Execution Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           TOOL EXECUTION FLOW                            │
└──────────────────────────────────────────────────────────────────────────┘

1. LLM Response (with tool calls)
   │
   ▼
2. Parse Response
   ├─ Native Protocol: NativeToolCallParser.ts
   │  └─ Typed args: { tool_name, arguments: {...} }
   │
   └─ XML Protocol: AssistantMessageParser.ts
      └─ String params: <tool_name><param>value</param></tool_name>
   │
   ▼
3. presentAssistantMessage.ts (Tool Dispatcher)
   │
   ├─ Validate tool exists
   ├─ Check mode restrictions
   ├─ Check tool repetition limits
   │
   ▼
4. Tool Handler Execution
   │
   ├─ Native Tools (BaseTool subclasses)
   │  ├─ ReadFileTool
   │  ├─ WriteToFileTool
   │  ├─ ExecuteCommandTool
   │  ├─ BrowserActionTool      ◄── TO BE REPLACED WITH ROOPIK IPC
   │  ├─ UseMcpToolTool         ◄── TO BE ENHANCED FOR ROOPIK TOOLS
   │  └─ ... 20+ more tools
   │
   └─ MCP Tools (via McpHub)
      ├─ Server connection management
      ├─ Tool call via SDK client
      └─ Result formatting
   │
   ▼
5. Push Tool Result
   │
   ├─ Text result
   └─ Image blocks (screenshots)
   │
   ▼
6. Continue LLM Loop
```

---

## 3. Tool System Deep Dive

### 3.1 Two-Protocol Support

Agent-dio supports **two distinct tool protocols**:

#### A. Native Protocol (OpenAI-style function calling)

```typescript
// LLM returns structured tool calls
{
  "tool_calls": [{
    "id": "call_123",
    "function": {
      "name": "read_file",
      "arguments": "{\"files\": [{\"path\": \"src/index.ts\"}]}"
    }
  }]
}
```

- Tools called with typed, structured arguments
- Each tool call has an ID for tracking
- Supports partial streaming of tool call arguments

#### B. XML/Legacy Protocol (Anthropic XML tags)

```xml
<tool_use>
  <read_file>
    <path>src/index.ts</path>
  </read_file>
</tool_use>
```

- Tools called within `<tool_use>` XML tags
- Arguments passed as XML text content
- Fallback for older models

### 3.2 BaseTool Architecture

All native tools extend `BaseTool<ToolName>`:

```typescript
// File: src/core/tools/BaseTool.ts

abstract class BaseTool<TName extends ToolName> {
  abstract readonly name: TName

  // Parse XML/legacy string params to typed params
  abstract parseLegacy(params: Partial<Record<string, string>>): ToolParams<TName>

  // Execute with typed params
  abstract execute(params: ToolParams<TName>, task: Task, callbacks: ToolCallbacks): Promise<void>

  // Handle streaming partial messages (optional override)
  async handlePartial(task: Task, block: ToolUse<TName>): Promise<void> { }

  // Main entry point - routes protocol and calls execute
  async handle(task: Task, block: ToolUse<TName>, callbacks: ToolCallbacks): Promise<void> {
    if (block.partial) {
      await this.handlePartial(task, block)
      return
    }

    // Parse parameters based on protocol
    let params
    if (block.nativeArgs !== undefined) {
      params = block.nativeArgs  // Native protocol: typed args
    } else {
      params = this.parseLegacy(block.params)  // XML protocol: parse strings
    }

    await this.execute(params, task, callbacks)
  }
}
```

### 3.3 Tool Callbacks

Every tool receives these callbacks:

```typescript
interface ToolCallbacks {
  askApproval(type: ClineAsk, message?: string): Promise<boolean>
  handleError(action: string, error: Error): Promise<void>
  pushToolResult(content: ToolResponse): void
  removeClosingTag(tag: string, text?: string): string
  toolProtocol: ToolProtocol
  toolCallId?: string
}
```

### 3.4 Typed Tool Arguments

```typescript
// File: src/shared/tools.ts

type NativeToolArgs = {
  read_file: { files: FileEntry[] }
  write_to_file: { path: string; content: string }
  apply_diff: { path: string; diff: string }
  execute_command: { command: string; cwd?: string }
  search_files: { path: string; regex: string; file_pattern?: string | null }
  browser_action: BrowserActionParams
  use_mcp_tool: { server_name: string; tool_name: string; arguments?: Record<string, unknown> }
  // ... more tools
}
```

---

## 4. Current Browser Tools (Puppeteer)

### Location

`src/services/browser/BrowserSession.ts`

### Current Architecture

```typescript
class BrowserSession {
  private browser?: Browser           // Puppeteer browser instance
  private page?: Page                 // Active page

  // Lifecycle
  async launchBrowser(): Promise<void>
  async closeBrowser(): Promise<BrowserActionResult>

  // Navigation
  async navigateToUrl(url: string): Promise<BrowserActionResult>

  // Interactions
  async click(coordinate: string): Promise<BrowserActionResult>
  async type(text: string): Promise<BrowserActionResult>
  async press(key: string): Promise<BrowserActionResult>
  async hover(coordinate: string): Promise<BrowserActionResult>

  // Scrolling
  async scrollDown(): Promise<BrowserActionResult>
  async scrollUp(): Promise<BrowserActionResult>

  // Viewport
  async resize(size: string): Promise<BrowserActionResult>

  // Screenshots
  async saveScreenshot(filePath: string, cwd: string): Promise<BrowserActionResult>
}
```

### BrowserActionResult

```typescript
interface BrowserActionResult {
  screenshot?: string        // Base64 encoded image
  logs?: string              // Console logs
  currentUrl?: string        // Current page URL
  currentMousePosition?: string
  viewportWidth?: number
  viewportHeight?: number
}
```

### Problems with Current Approach

1. **Separate Browser** - Puppeteer launches its own Chromium, not the IDE's integrated browser
2. **No DevTools** - Cannot access CDP for deep inspection
3. **No CSS Source Mapping** - Cannot trace styles back to source files
4. **Duplicate Resource** - Downloads and runs separate Chromium instance
5. **No Integration** - Changes in IDE browser not visible to agent

---

## 5. Current MCP Tool System

### Location

`src/services/mcp/McpHub.ts` (2000+ lines)

### How MCP Tools Work

```
1. Tool Registration (MCP Server side - Roopik Core)
   └─ server.tool('rpk_screenshot', '...', {}, async () => {...})

2. Tool Discovery (agent-dio)
   └─ const tools = await mcpClient.request({ method: 'tools/list' })

3. Tools Added to System Prompt
   └─ const allTools = [...nativeTools, ...mcpTools]

4. LLM Calls Tool
   └─ Response: { tool_name: "mcp_roopik-ide_rpk_screenshot", arguments: {} }

5. UseMcpToolTool Executes via McpHub
   └─ await mcpHub.callTool('roopik-ide', 'rpk_screenshot', {})
```

### Connection Types

```typescript
// Stdio - spawns process (most stable)
new StdioClientTransport({ command: 'node', args: ['server.js'] })

// SSE - HTTP streaming (can timeout)
new SSEClientTransport(new URL('http://localhost:3000/sse'))

// Streamable HTTP - Current Roopik MCP (TIMEOUTS AFTER FEW MINUTES)
new StreamableHTTPClientTransport({ url: 'http://127.0.0.1:3010/mcp' })
```

### The Timeout Problem

Current Roopik MCP uses `StreamableHTTPServerTransport` which:
- Uses Server-Sent Events (SSE) under the hood
- SSE connections have inherent timeout issues
- Browser/client-side timeouts close idle connections
- No built-in heartbeat mechanism

**Result:** `Transport error: SSE stream disconnected` after few minutes of inactivity

---

## 6. Integration Plan: IPC for Roopik Tools

### Goal

Replace MCP HTTP with direct IPC for Roopik tools:
- **Faster** - No HTTP overhead
- **No timeouts** - IPC is persistent
- **Same process tree** - Direct communication

### New Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         agent-dio Extension                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                      Tool System                                     ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ ││
│  │  │ Native Tools│  │ MCP Tools   │  │ Roopik Tools (NEW - IPC)   │ ││
│  │  │ (file, cmd) │  │ (external)  │  │ rpk_screenshot, rpk_inspect│ ││
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────┬───────────────┘ ││
│  │         │                │                       │                  ││
│  │         ▼                ▼                       ▼                  ││
│  │  ┌──────────┐     ┌──────────┐          ┌──────────────────┐       ││
│  │  │ Local FS │     │ McpHub   │          │ RoopikToolClient │       ││
│  │  │ Terminal │     │ (HTTP)   │          │ (IPC Channel)    │       ││
│  │  └──────────┘     └──────────┘          └────────┬─────────┘       ││
│  └─────────────────────────────────────────────────┼──────────────────┘│
└────────────────────────────────────────────────────┼────────────────────┘
                                                     │ IPC (persistent)
                                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Roopik Core (electron-main)                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                    RoopikToolsChannel (NEW)                         ││
│  │  Handles: rpk_screenshot, rpk_navigate, rpk_inspectElement,         ││
│  │           rpk_getErrors, rpk_addComponent, etc.                     ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                              │                                          │
│  ┌───────────────┬───────────┴───────────┬────────────────────────────┐│
│  │BrowserViewSvc │  ComponentService     │  CanvasService             ││
│  │DevServerSvc   │  McpServerService     │  CDP Tools                 ││
│  └───────────────┴───────────────────────┴────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### Benefits

| Aspect | MCP HTTP (Current) | IPC (Proposed) |
|--------|-------------------|----------------|
| **Connection** | Can timeout/disconnect | Always connected |
| **Latency** | HTTP overhead (~10-50ms) | Direct memory (~1ms) |
| **Complexity** | SDK, ports, reconnection | Simple channel.call() |
| **Debugging** | Network inspector | VSCode IPC logs |
| **Reliability** | Fragile | Rock solid |

---

## 7. Implementation Steps

### Step 1: Create RoopikToolsChannel (Core Side)

**File:** `src/vs/workbench/contrib/roopik/electron-main/channel/roopikToolsChannel.ts`

```typescript
import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { Event } from '../../../../../base/common/event.js';

export const ROOPIK_TOOLS_CHANNEL_NAME = 'roopik.tools';

export class RoopikToolsChannel implements IServerChannel {
  constructor(
    private browserViewService: BrowserViewService,
    private componentService: ComponentService,
    private canvasService: ICanvasService,
    private devServerService: DevServerService,
    private storageService: IRoopikStorageService
  ) {}

  async call(command: string, arg: any): Promise<any> {
    switch (command) {
      // ============================================================
      // Browser Tools (5)
      // ============================================================
      case 'rpk_screenshot':
        return this.handleScreenshot();
      case 'rpk_navigate':
        return this.handleNavigate(arg);
      case 'rpk_reload':
        return this.handleReload(arg);
      case 'rpk_executeScript':
        return this.handleExecuteScript(arg);
      case 'rpk_inspectElement':
        return this.handleInspectElement(arg);

      // ============================================================
      // CDP Tools (2)
      // ============================================================
      case 'rpk_getErrors':
        return this.handleGetErrors(arg);
      case 'rpk_getConsoleLogs':
        return this.handleGetConsoleLogs(arg);

      // ============================================================
      // Project Tools (3)
      // ============================================================
      case 'rpk_getActiveProject':
        return this.handleGetActiveProject();
      case 'rpk_startProject':
        return this.handleStartProject(arg);
      case 'rpk_stopProject':
        return this.handleStopProject();

      // ============================================================
      // Workspace Tools (3)
      // ============================================================
      case 'rpk_listCanvases':
        return this.handleListCanvases(arg);
      case 'rpk_getActiveCanvas':
        return this.handleGetActiveCanvas();
      case 'rpk_createCanvas':
        return this.handleCreateCanvas(arg);

      // ============================================================
      // Component Tools (6)
      // ============================================================
      case 'rpk_addComponent':
        return this.handleAddComponent(arg);
      case 'rpk_addComponents':
        return this.handleAddComponents(arg);
      case 'rpk_removeComponent':
        return this.handleRemoveComponent(arg);
      case 'rpk_getComponentInfo':
        return this.handleGetComponentInfo(arg);
      case 'rpk_listComponents':
        return this.handleListComponents(arg);
      case 'rpk_rebuildComponent':
        return this.handleRebuildComponent(arg);

      default:
        throw new Error(`Unknown Roopik tool: ${command}`);
    }
  }

  listen(event: string): Event<any> {
    throw new Error(`Unknown event: ${event}`);
  }

  // Implementation methods...
  private async handleScreenshot() {
    const browserViewId = this.browserViewService.getActiveBrowserViewId();
    if (!browserViewId) {
      return { success: false, error: 'No browser is open' };
    }
    const image = await this.browserViewService.takeScreenshot(browserViewId);
    return { success: true, image, format: 'data-url' };
  }

  // ... more handlers
}
```

### Step 2: Register Channel in Main Process

**File:** `src/vs/workbench/contrib/roopik/electron-main/roopikMainService.ts`

```typescript
import { RoopikToolsChannel, ROOPIK_TOOLS_CHANNEL_NAME } from './channel/roopikToolsChannel.js';

// In initialization:
const roopikToolsChannel = new RoopikToolsChannel(
  browserViewService,
  componentService,
  canvasService,
  devServerService,
  storageService
);
mainProcessService.registerChannel(ROOPIK_TOOLS_CHANNEL_NAME, roopikToolsChannel);
```

### Step 3: Create RoopikToolClient (Extension Side)

**File:** `extensions/roopik-dio/src/services/roopik/RoopikToolClient.ts`

```typescript
import * as vscode from 'vscode';

export interface RoopikToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class RoopikToolClient {
  private static instance: RoopikToolClient;

  static getInstance(): RoopikToolClient {
    if (!RoopikToolClient.instance) {
      RoopikToolClient.instance = new RoopikToolClient();
    }
    return RoopikToolClient.instance;
  }

  async callTool(toolName: string, args: any = {}): Promise<RoopikToolResult> {
    try {
      // Use VSCode commands to bridge to main process
      const result = await vscode.commands.executeCommand(
        'roopik.executeTool',
        toolName,
        args
      );
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Convenience methods
  async screenshot(): Promise<RoopikToolResult> {
    return this.callTool('rpk_screenshot');
  }

  async navigate(url: string): Promise<RoopikToolResult> {
    return this.callTool('rpk_navigate', { url });
  }

  async inspectElement(selector: string, includeInherited = true): Promise<RoopikToolResult> {
    return this.callTool('rpk_inspectElement', { selector, includeInherited });
  }

  async getErrors(limit = 50): Promise<RoopikToolResult> {
    return this.callTool('rpk_getErrors', { limit });
  }

  async getConsoleLogs(limit = 50, type?: string): Promise<RoopikToolResult> {
    return this.callTool('rpk_getConsoleLogs', { limit, type });
  }

  async getActiveProject(): Promise<RoopikToolResult> {
    return this.callTool('rpk_getActiveProject');
  }

  async startProject(projectPath: string, port?: number): Promise<RoopikToolResult> {
    return this.callTool('rpk_startProject', { projectPath, port });
  }

  async stopProject(): Promise<RoopikToolResult> {
    return this.callTool('rpk_stopProject');
  }

  async reload(ignoreCache = false): Promise<RoopikToolResult> {
    return this.callTool('rpk_reload', { ignoreCache });
  }

  async executeScript(script: string): Promise<RoopikToolResult> {
    return this.callTool('rpk_executeScript', { script });
  }

  // Canvas tools
  async listCanvases(options?: { nameFilter?: string; sortBy?: string }): Promise<RoopikToolResult> {
    return this.callTool('rpk_listCanvases', options);
  }

  async getActiveCanvas(): Promise<RoopikToolResult> {
    return this.callTool('rpk_getActiveCanvas');
  }

  async createCanvas(name: string): Promise<RoopikToolResult> {
    return this.callTool('rpk_createCanvas', { name });
  }

  // Component tools
  async addComponent(options: {
    folderPath: string;
    canvasId?: string;
    name?: string;
    entryFile?: string;
    framework?: string;
  }): Promise<RoopikToolResult> {
    return this.callTool('rpk_addComponent', options);
  }

  async addComponents(components: Array<{
    folderPath: string;
    canvasId?: string;
    name?: string;
  }>): Promise<RoopikToolResult> {
    return this.callTool('rpk_addComponents', { components });
  }

  async removeComponent(componentId: string): Promise<RoopikToolResult> {
    return this.callTool('rpk_removeComponent', { componentId });
  }

  async getComponentInfo(componentId: string): Promise<RoopikToolResult> {
    return this.callTool('rpk_getComponentInfo', { componentId });
  }

  async listComponents(canvasId: string): Promise<RoopikToolResult> {
    return this.callTool('rpk_listComponents', { canvasId });
  }

  async rebuildComponent(componentId: string): Promise<RoopikToolResult> {
    return this.callTool('rpk_rebuildComponent', { componentId });
  }
}
```

### Step 4: Create Roopik Tool Handler

**File:** `extensions/roopik-dio/src/core/tools/RoopikToolHandler.ts`

```typescript
import { Task } from '../task/Task';
import { ToolUse, ToolCallbacks, ToolResponse } from '../../shared/tools';
import { RoopikToolClient } from '../../services/roopik/RoopikToolClient';
import { Anthropic } from '@anthropic-ai/sdk';

export class RoopikToolHandler {
  private client: RoopikToolClient;

  constructor() {
    this.client = RoopikToolClient.getInstance();
  }

  async handle(
    task: Task,
    block: ToolUse,
    callbacks: ToolCallbacks
  ): Promise<void> {
    const { askApproval, pushToolResult, handleError } = callbacks;
    const toolName = block.name;
    const args = block.nativeArgs || block.params;

    try {
      // Ask for approval
      const approved = await askApproval(
        'roopik_tool' as any,
        `Execute Roopik tool: ${toolName}`
      );
      if (!approved) return;

      // Execute tool
      const result = await this.client.callTool(toolName, args);

      if (!result.success) {
        await handleError(`executing ${toolName}`, new Error(result.error));
        return;
      }

      // Format result based on tool type
      const response = this.formatResult(toolName, result.data);
      pushToolResult(response);

    } catch (error) {
      await handleError(
        `executing ${toolName}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  private formatResult(toolName: string, data: any): ToolResponse {
    // Handle screenshot - return image block
    if (toolName === 'rpk_screenshot' && data?.image) {
      const blocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: data.image.replace(/^data:image\/\w+;base64,/, '')
          }
        },
        {
          type: 'text',
          text: 'Screenshot captured from Roopik IDE browser.'
        }
      ];
      return blocks;
    }

    // Default: return JSON
    return JSON.stringify(data, null, 2);
  }
}
```

### Step 5: Register Tools in build-tools.ts

**File:** `extensions/roopik-dio/src/core/task/build-tools.ts`

```typescript
import { ROOPIK_TOOL_DEFINITIONS } from '../tools/roopik/definitions';

async function buildNativeToolsArray(options: BuildToolsOptions) {
  const nativeTools = getNativeTools();
  const mcpTools = await getMcpServerTools();

  // Add Roopik tools if IDE is active
  const roopikTools = isRoopikActive() ? ROOPIK_TOOL_DEFINITIONS : [];

  return [...nativeTools, ...roopikTools, ...mcpTools];
}
```

### Step 6: Add Tool Dispatch

**File:** `extensions/roopik-dio/src/core/assistant-message/presentAssistantMessage.ts`

```typescript
import { RoopikToolHandler } from '../tools/RoopikToolHandler';

const roopikToolHandler = new RoopikToolHandler();

// In the switch statement:
switch (block.name) {
  // ... existing tools ...

  // Roopik Tools (19 total)
  case 'rpk_screenshot':
  case 'rpk_navigate':
  case 'rpk_reload':
  case 'rpk_executeScript':
  case 'rpk_inspectElement':
  case 'rpk_getErrors':
  case 'rpk_getConsoleLogs':
  case 'rpk_getActiveProject':
  case 'rpk_startProject':
  case 'rpk_stopProject':
  case 'rpk_listCanvases':
  case 'rpk_getActiveCanvas':
  case 'rpk_createCanvas':
  case 'rpk_addComponent':
  case 'rpk_addComponents':
  case 'rpk_removeComponent':
  case 'rpk_getComponentInfo':
  case 'rpk_listComponents':
  case 'rpk_rebuildComponent':
    await roopikToolHandler.handle(cline, block, callbacks);
    break;
}
```

---

## 8. Browser Tool Replacement Strategy

### Mapping: browser_action → Roopik Tools

| Current `browser_action` | New Roopik Tool | Implementation |
|--------------------------|-----------------|----------------|
| `launch` + `url` | `rpk_startProject` + `rpk_navigate` | Uses IDE browser |
| `click` | `rpk_executeScript` | `document.querySelector().click()` |
| `type` | `rpk_executeScript` | Focus + inject text via JS |
| `scroll_down` | `rpk_executeScript` | `window.scrollBy(0, height)` |
| `scroll_up` | `rpk_executeScript` | `window.scrollBy(0, -height)` |
| `screenshot` | `rpk_screenshot` | Built-in screenshot |
| `close` | `rpk_stopProject` | Stops dev server |
| N/A | `rpk_inspectElement` | **NEW** - CSS inspection with source maps |
| N/A | `rpk_getErrors` | **NEW** - Console + Network errors |

### Benefits of Roopik Browser Tools

| Feature | Puppeteer (Current) | Roopik (New) |
|---------|---------------------|--------------|
| Browser instance | Separate Chromium | IDE's BrowserView |
| DevTools access | Limited | Full CDP |
| CSS source mapping | None | Complete |
| Network errors | Basic | Full with request details |
| Console logs | Basic | Full with stack traces |
| Live preview | No | Yes (same as user sees) |
| Resource usage | High (separate browser) | Low (shared browser) |

---

## 9. Tool Definitions for LLM

These definitions will be included in the system prompt so the LLM knows about Roopik tools:

**File:** `extensions/roopik-dio/src/core/tools/roopik/definitions.ts`

```typescript
export const ROOPIK_TOOL_DEFINITIONS = [
  // ============================================================
  // Browser Tools (5)
  // ============================================================
  {
    name: 'rpk_screenshot',
    description: '[Roopik IDE] Capture a screenshot of the IDE browser. Returns base64-encoded image. Use this for visual verification after making UI changes.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'rpk_navigate',
    description: '[Roopik IDE] Navigate the IDE browser to a URL. Use this to load specific pages in the project (e.g., /login, /dashboard) or external URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' }
      },
      required: ['url']
    }
  },
  {
    name: 'rpk_reload',
    description: '[Roopik IDE] Reload the current page in the IDE browser. Use ignoreCache=true for hard reload after changing assets.',
    inputSchema: {
      type: 'object',
      properties: {
        ignoreCache: { type: 'boolean', description: 'If true, clears cache before reloading' }
      }
    }
  },
  {
    name: 'rpk_executeScript',
    description: '[Roopik IDE] Execute JavaScript in the browser context. Use for DOM queries, checking state, clicking elements, or any browser-side logic.',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'JavaScript code to execute' }
      },
      required: ['script']
    }
  },
  {
    name: 'rpk_inspectElement',
    description: '[Roopik IDE] Deep CSS inspection for an element. Returns matched CSS rules with source file locations (file:line:column), computed styles, and specificity. THE KEY TOOL for understanding exactly which CSS file/line defines each style.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to find element' },
        includeInherited: { type: 'boolean', description: 'Include inherited styles from parents (default: true)' }
      },
      required: ['selector']
    }
  },

  // ============================================================
  // CDP/Debugging Tools (2)
  // ============================================================
  {
    name: 'rpk_getErrors',
    description: '[Roopik IDE] Get all errors from the browser: console errors (JavaScript exceptions, console.error) AND failed network requests (4xx, 5xx, network failures). This is the primary debugging tool.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum errors to return (default: 50)' }
      }
    }
  },
  {
    name: 'rpk_getConsoleLogs',
    description: '[Roopik IDE] Get console output from the browser (console.log, warn, error, etc.). Use type filter to focus on specific log types.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum logs to return (default: 50)' },
        type: { type: 'string', enum: ['log', 'debug', 'info', 'warn', 'error'], description: 'Filter by log type' }
      }
    }
  },

  // ============================================================
  // Project Tools (3)
  // ============================================================
  {
    name: 'rpk_getActiveProject',
    description: '[Roopik IDE] Get the currently running project. Returns dev server URL, port, framework, and project path. Use this to check if a project is running.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'rpk_startProject',
    description: '[Roopik IDE] Start a dev server for a project and open it in the IDE browser. The browser will automatically navigate to the dev server URL.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Absolute path to the project folder' },
        port: { type: 'number', description: 'Preferred port number (optional)' }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'rpk_stopProject',
    description: '[Roopik IDE] Stop the currently running dev server.',
    inputSchema: { type: 'object', properties: {} }
  },

  // ============================================================
  // Workspace/Canvas Tools (3)
  // ============================================================
  {
    name: 'rpk_listCanvases',
    description: '[Roopik IDE] List all Canvases in the workspace. Canvases are visual workspaces where components are displayed for live preview.',
    inputSchema: {
      type: 'object',
      properties: {
        nameFilter: { type: 'string', description: 'Optional filter to search canvas names' },
        sortBy: { type: 'string', enum: ['name', 'updatedAt', 'createdAt', 'componentCount'] }
      }
    }
  },
  {
    name: 'rpk_getActiveCanvas',
    description: '[Roopik IDE] Get the Canvas currently open/focused in the IDE. Use this to know which Canvas the user is viewing.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'rpk_createCanvas',
    description: '[Roopik IDE] Create a new Canvas for organizing and previewing components. If a Canvas with the same name exists, returns the existing one.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Canvas display name' }
      },
      required: ['name']
    }
  },

  // ============================================================
  // Component Tools (6)
  // ============================================================
  {
    name: 'rpk_addComponent',
    description: '[Roopik IDE] Add a component to the visual Canvas for live preview. Auto-detects entry file and framework from the folder.',
    inputSchema: {
      type: 'object',
      properties: {
        folderPath: { type: 'string', description: 'Absolute path to component folder or file' },
        canvasId: { type: 'string', description: 'Canvas ID (optional, uses active canvas)' },
        name: { type: 'string', description: 'Component name (optional, auto-detected)' },
        entryFile: { type: 'string', description: 'Entry file (optional, auto-detected)' },
        framework: { type: 'string', enum: ['react', 'vue', 'svelte', 'solid', 'preact', 'html'] }
      },
      required: ['folderPath']
    }
  },
  {
    name: 'rpk_addComponents',
    description: '[Roopik IDE] Batch add multiple components to the Canvas. Efficient for adding component variants.',
    inputSchema: {
      type: 'object',
      properties: {
        components: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              folderPath: { type: 'string' },
              canvasId: { type: 'string' },
              name: { type: 'string' }
            },
            required: ['folderPath']
          }
        }
      },
      required: ['components']
    }
  },
  {
    name: 'rpk_removeComponent',
    description: '[Roopik IDE] Remove a component from the Canvas. Does not delete source files.',
    inputSchema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', description: 'Component ID to remove' }
      },
      required: ['componentId']
    }
  },
  {
    name: 'rpk_getComponentInfo',
    description: '[Roopik IDE] Get full component status: build state (building/ready/error), error details, CDN URLs. Use this to check if a component built successfully.',
    inputSchema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', description: 'Component ID' }
      },
      required: ['componentId']
    }
  },
  {
    name: 'rpk_listComponents',
    description: '[Roopik IDE] List all components on a Canvas. Returns IDs, names, frameworks, and build states.',
    inputSchema: {
      type: 'object',
      properties: {
        canvasId: { type: 'string', description: 'Canvas ID to list components from' }
      },
      required: ['canvasId']
    }
  },
  {
    name: 'rpk_rebuildComponent',
    description: '[Roopik IDE] Trigger a rebuild of a component. Use after fixing code errors to refresh the live preview.',
    inputSchema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', description: 'Component ID to rebuild' }
      },
      required: ['componentId']
    }
  }
];
```

---

## 10. Key Files Reference

### agent-dio Extension

| File | Purpose |
|------|---------|
| `src/extension/index.ts` | Extension entry point |
| `src/activate/index.ts` | Activation logic |
| `src/core/task/Task.ts` | Main task loop and state |
| `src/core/task/build-tools.ts` | Tool array builder |
| `src/core/assistant-message/presentAssistantMessage.ts` | Tool dispatcher |
| `src/core/assistant-message/NativeToolCallParser.ts` | Native protocol parser |
| `src/core/tools/BaseTool.ts` | Base class for tools |
| `src/core/tools/BrowserActionTool.ts` | Current browser tool |
| `src/services/browser/BrowserSession.ts` | Puppeteer browser |
| `src/services/mcp/McpHub.ts` | MCP server manager |
| `src/shared/tools.ts` | Tool type definitions |

### Roopik Core (for reference)

| File | Purpose |
|------|---------|
| `electron-main/mcp/mcpServerService.ts` | MCP server (HTTP) |
| `electron-main/mcp/tools/browserTools.ts` | Browser MCP tools |
| `electron-main/mcp/tools/cdpTools.ts` | CDP/debugging tools |
| `electron-main/mcp/tools/projectTools.ts` | Project tools |
| `electron-main/mcp/tools/canvasTools.ts` | Component tools |
| `electron-main/mcp/tools/workspaceTools.ts` | Canvas tools |
| `electron-main/projectMode/browserViewService.ts` | BrowserView service |
| `electron-main/component/componentService.ts` | Component service |

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Browser** | Puppeteer (separate) | Roopik BrowserView (integrated) |
| **Connection** | MCP HTTP (timeouts) | IPC (persistent) |
| **CSS Inspection** | None | Full source mapping |
| **Error Capture** | Basic console | Console + Network + CDP |
| **Tool Count** | browser_action (1) | 19 specialized rpk_ tools |
| **Latency** | ~50ms (HTTP) | ~1ms (IPC) |
| **Reliability** | Fragile (timeouts) | Rock solid |

This architecture gives agent-dio full access to Roopik's design IDE capabilities while maintaining the existing tool system structure.
