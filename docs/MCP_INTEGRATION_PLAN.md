# Roopik MCP Integration Plan

> **Goal:** Enable AI agents (internal Dio + external Claude Code/Copilot) to control Roopik IDE via standard MCP protocol.

---

## 1. Architecture Overview

### The "Internal Bridge" Model

Instead of tightly coupling AI agents to internal scripts, Roopik uses a **Server-Client Architecture** where the IDE itself acts as a host for all AI interactions.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ROOPIK IDE (Electron)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    MAIN PROCESS (Node.js)                        │   │
│  │                                                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │ DevServer   │  │ BrowserView │  │ ProjectStorage          │  │   │
│  │  │ Service     │  │ Service     │  │ Service                 │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │   │
│  │         │                │                      │                │   │
│  │         └────────────────┴──────────────────────┘                │   │
│  │                          │                                       │   │
│  │                          ▼                                       │   │
│  │              ┌───────────────────────┐                           │   │
│  │              │   MCP HTTP Server     │◄──── localhost:3333       │   │
│  │              │   (StreamableHTTP)    │                           │   │
│  │              └───────────────────────┘                           │   │
│  │                          │                                       │   │
│  └──────────────────────────┼───────────────────────────────────────┘   │
│                             │                                           │
│  ┌──────────────────────────┼───────────────────────────────────────┐   │
│  │            RENDERER PROCESS (Browser)                            │   │
│  │                          │                                       │   │
│  │  ┌─────────────┐  ┌──────┴──────┐  ┌─────────────────────────┐  │   │
│  │  │ Canvas      │  │ Project     │  │ Chat UI                 │  │   │
│  │  │ Editor      │  │ Preview     │  │ (Bidirectional)         │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
    │ Dio Agent   │     │ Claude Code │     │ GitHub Copilot  │
    │ (Built-in)  │     │ (External)  │     │ (External)      │
    └─────────────┘     └─────────────┘     └─────────────────┘
```

### Why This Architecture?

| Problem | Solution |
|---------|----------|
| AI Agents live in Extension Host (sandboxed) | MCP Server in Main Process bridges the gap |
| Multiple agents need same IDE state | Single HTTP server, shared state |
| External agents need access | Standard MCP protocol, discoverable tools |
| Security concerns | Only exposed tools are callable, no arbitrary code |

---

## 2. Communication Protocol

### Standard: Model Context Protocol (MCP)

- **Why:** Decouples tool definition (JSON schema) from tool execution (code)
- **Discovery:** Agents discover features dynamically via `tools/list`
- **SDK:** `@modelcontextprotocol/sdk` (official TypeScript SDK)

### Transport: HTTP with Streamable HTTP

- **Endpoint:** `http://localhost:3333/mcp`
- **Why HTTP over stdio:**
  - Multiple agents connect to same IDE instance
  - Shared state and memory
  - Works for both internal (Dio) and external (Claude Code) agents

```typescript
// Agent configuration for external tools (Claude Code, etc.)
{
  "mcpServers": {
    "roopik": {
      "url": "http://localhost:3333/mcp",
      "transport": "streamableHttp"
    }
  }
}
```

---

## 3. Bidirectional Communication

MCP enables **two-way** communication, not just agent → IDE:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     COMMUNICATION PATTERNS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Pattern A: Agent → MCP → IDE (Tool Execution)                         │
│  ──────────────────────────────────────────────────────────────────     │
│  Agent discovers tools → calls roopik.startProject → gets result       │
│                                                                         │
│  Pattern B: IDE → Agent → MCP → IDE (Full Loop)                        │
│  ──────────────────────────────────────────────────────────────────     │
│  User clicks element → Chat opens → User types → Agent processes       │
│  → Agent calls MCP tools → Changes applied → User continues chat       │
│                                                                         │
│  Pattern C: IDE pushes context TO Agent (SSE Notifications)            │
│  ──────────────────────────────────────────────────────────────────     │
│  User clicks element → IDE sends context via SSE → Agent receives      │
│  element details, file location, styles, git status automatically      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. MCP Tools to Expose

### Category 1: Project Lifecycle

```typescript
// Start/stop dev servers, manage project state
'roopik.startProject'        // Start dev server + browser preview
'roopik.stopProject'         // Stop dev server
'roopik.getProjectStatus'    // Check if running, get URL/port
'roopik.getRunningProject'   // Get currently active project
'roopik.detectFramework'     // Detect React/Vue/Svelte/etc.
```

### Category 2: Component Operations (Canvas Mode)

```typescript
// Create and manage components in Canvas Mode
'roopik.createCanvas'        // Create new canvas
'roopik.createComponent'     // Create component in canvas
'roopik.deleteComponent'     // Delete component
'roopik.updateComponentSource' // Edit component code
'roopik.rebuildComponent'    // Rebuild after changes
'roopik.getBundledCode'      // Get compiled output
'roopik.getComponentSource'  // Get source files
```

### Category 3: Visual Verification (AI's "Eyes")

```typescript
// Enable AI to SEE results - Roopik's competitive advantage
'roopik.takeScreenshot'      // Capture current browser view
'roopik.navigate'            // Go to URL/route
'roopik.reload'              // Refresh page
'roopik.getCurrentUrl'       // Get current URL
```

### Category 4: Element Inspection

```typescript
// Rich context for precise edits - THE MOAT
'roopik.inspectElement'      // Get element details + source location
'roopik.getElementStyles'    // Computed styles + CSS source mapping
'roopik.getComponentContext' // React/Vue component info (props, state)
```

### Category 5: File Operations

```typescript
// File management for agents
'roopik.readFile'            // Read file contents
'roopik.writeFile'           // Write/update file
'roopik.createProject'       // Scaffold new project from template
```

---

## 5. Implementation Phases

---

### Phase 1: MCP Server Foundation

**Goal:** Get a working MCP HTTP server that agents can connect to and discover tools.

#### 1.1 Create MCP Server Service

**File:** `src/vs/workbench/contrib/roopik/electron-main/mcp/mcpServerService.ts`

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

export interface IMcpServerService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPort(): number;
}

export class McpServerService implements IMcpServerService {
  private server: McpServer;
  private app: express.Express;
  private httpServer: any;
  private readonly port = 3333;

  constructor(
    @IDevServerService private readonly devServerService: IDevServerService,
    @IComponentService private readonly componentService: IComponentService,
    @IBrowserViewService private readonly browserViewService: IBrowserViewService,
  ) {
    this.server = new McpServer({
      name: "roopik-ide",
      version: "1.0.0",
    });
    this.app = express();
    this.registerTools();
  }

  private registerTools(): void {
    // Tool registration happens here (see 1.2)
  }

  async start(): Promise<void> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => undefined, // Stateless mode
    });

    this.app.use(express.json());
    this.app.post("/mcp", async (req, res) => {
      await transport.handleRequest(req, res, this.server);
    });

    this.httpServer = this.app.listen(this.port, () => {
      console.log(`[MCP] Server running on http://localhost:${this.port}/mcp`);
    });
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      this.httpServer.close();
    }
  }

  getPort(): number {
    return this.port;
  }
}
```

#### 1.2 Register Initial Tools (Project Lifecycle)

```typescript
private registerTools(): void {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PROJECT LIFECYCLE TOOLS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  this.server.tool(
    "roopik.startProject",
    {
      projectPath: z.string().describe("Absolute path to project folder"),
      port: z.number().optional().describe("Preferred port (default: auto)"),
    },
    async ({ projectPath, port }) => {
      try {
        const url = await this.devServerService.startServer(projectPath, port);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, url, projectPath }),
          }],
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: false, error: error.message }),
          }],
          isError: true,
        };
      }
    }
  );

  this.server.tool(
    "roopik.stopProject",
    {
      projectPath: z.string().describe("Path to project to stop"),
    },
    async ({ projectPath }) => {
      await this.devServerService.stopServer(projectPath);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, stopped: projectPath }),
        }],
      };
    }
  );

  this.server.tool(
    "roopik.getProjectStatus",
    {
      projectPath: z.string().describe("Path to check status for"),
    },
    async ({ projectPath }) => {
      const status = await this.devServerService.getServerStatus(projectPath);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(status),
        }],
      };
    }
  );

  this.server.tool(
    "roopik.detectFramework",
    {
      projectPath: z.string().describe("Path to analyze"),
    },
    async ({ projectPath }) => {
      const framework = await this.devServerService.detectFramework(projectPath);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ framework }),
        }],
      };
    }
  );
}
```

#### 1.3 Register as Workbench Contribution

**File:** `src/vs/workbench/contrib/roopik/electron-main/roopik.contribution.ts`

```typescript
import { McpServerService, IMcpServerService } from './mcp/mcpServerService.js';

// Register service
registerSingleton(IMcpServerService, McpServerService, InstantiationType.Eager);

// Start on window open
class McpServerContribution implements IWorkbenchContribution {
  constructor(
    @IMcpServerService private readonly mcpServer: IMcpServerService,
  ) {
    this.mcpServer.start();
  }
}

registerWorkbenchContribution2(
  McpServerContribution.ID,
  McpServerContribution,
  WorkbenchPhase.AfterRestored
);
```

#### 1.4 Add Dependencies

**File:** `package.json` (add to dependencies)

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.0",
    "express": "^4.18.2",
    "zod": "^3.25.0"
  }
}
```

#### Phase 1 Deliverables

- [ ] MCP HTTP Server starts on IDE launch (port 3333)
- [ ] Tools discoverable via `tools/list`
- [ ] Project lifecycle tools working: start, stop, status, detect
- [ ] External agents can connect and call tools

#### Testing Phase 1

```bash
# Test with curl
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Or use MCP Inspector
npx @anthropic/mcp-inspector http://localhost:3333/mcp
```

---

### Phase 2: Component & Visual Tools

**Goal:** Add Canvas Mode tools and visual verification (screenshots).

#### 2.1 Component Tools

```typescript
// Add to registerTools()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT TOOLS (Canvas Mode)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

this.server.tool(
  "roopik.createComponent",
  {
    canvasId: z.string().describe("Canvas to create component in"),
    name: z.string().describe("Component name"),
    code: z.string().optional().describe("Initial TSX code"),
  },
  async ({ canvasId, name, code }) => {
    const component = await this.componentService.createComponent({
      canvasId,
      name,
      code: code || `export default function ${name}() {\n  return <div>${name}</div>;\n}`,
    });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: true, componentId: component.id }),
      }],
    };
  }
);

this.server.tool(
  "roopik.updateComponentSource",
  {
    componentId: z.string().describe("Component ID to update"),
    files: z.record(z.string()).describe("Map of filename → content"),
  },
  async ({ componentId, files }) => {
    await this.componentService.updateComponentSource(componentId, files);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: true, updated: componentId }),
      }],
    };
  }
);

this.server.tool(
  "roopik.deleteComponent",
  {
    componentId: z.string().describe("Component ID to delete"),
  },
  async ({ componentId }) => {
    await this.componentService.deleteComponent(componentId);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: true, deleted: componentId }),
      }],
    };
  }
);

this.server.tool(
  "roopik.getComponentSource",
  {
    componentId: z.string().describe("Component ID"),
  },
  async ({ componentId }) => {
    const source = await this.componentService.getComponentSource(componentId);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(source),
      }],
    };
  }
);
```

#### 2.2 Visual Verification Tools

```typescript
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VISUAL VERIFICATION TOOLS (AI's "Eyes")
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

this.server.tool(
  "roopik.takeScreenshot",
  {
    format: z.enum(["png", "jpeg"]).optional().describe("Image format"),
    quality: z.number().min(0).max(100).optional().describe("JPEG quality"),
    fullPage: z.boolean().optional().describe("Capture full scrollable page"),
  },
  async ({ format = "png", quality = 80, fullPage = false }) => {
    const screenshot = await this.browserViewService.takeScreenshot({
      format,
      quality,
      fullPage,
    });
    return {
      content: [{
        type: "image",
        data: screenshot,
        mimeType: format === "png" ? "image/png" : "image/jpeg",
      }],
    };
  }
);

this.server.tool(
  "roopik.navigate",
  {
    url: z.string().describe("URL to navigate to"),
  },
  async ({ url }) => {
    await this.browserViewService.navigate(url);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: true, navigated: url }),
      }],
    };
  }
);

this.server.tool(
  "roopik.reload",
  {},
  async () => {
    await this.browserViewService.reload();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: true, reloaded: true }),
      }],
    };
  }
);

this.server.tool(
  "roopik.getCurrentUrl",
  {},
  async () => {
    const url = await this.browserViewService.getCurrentUrl();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ url }),
      }],
    };
  }
);
```

#### 2.3 Implement Screenshot in BrowserViewService

**File:** `src/vs/workbench/contrib/roopik/electron-main/projectMode/browserViewService.ts`

```typescript
async takeScreenshot(options: {
  format?: 'png' | 'jpeg';
  quality?: number;
  fullPage?: boolean;
}): Promise<string> {
  if (!this.browserView) {
    throw new Error('No browser view active');
  }

  const webContents = this.browserView.webContents;

  // For full page, we need to scroll and stitch
  // For now, just capture visible area
  const image = await webContents.capturePage();

  if (options.format === 'jpeg') {
    return image.toJPEG(options.quality || 80).toString('base64');
  }

  return image.toPNG().toString('base64');
}
```

#### Phase 2 Deliverables

- [ ] Component CRUD tools working
- [ ] Screenshot capture working (returns base64 image)
- [ ] Navigation tools working (navigate, reload, getCurrentUrl)
- [ ] AI can "see" results of changes

---

### Phase 3: Rich Context Tools (The Moat)

**Goal:** Add element inspection and context gathering - Roopik's competitive advantage.

#### 3.1 Element Inspection Tool

```typescript
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RICH CONTEXT TOOLS (Roopik's Advantage)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

this.server.tool(
  "roopik.inspectElement",
  {
    selector: z.string().describe("CSS selector for element"),
  },
  async ({ selector }) => {
    // Execute in browser context via CDP
    const result = await this.browserViewService.executeInBrowser(`
      (function() {
        const el = document.querySelector('${selector}');
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);

        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id || null,
          classes: Array.from(el.classList),
          attributes: Object.fromEntries(
            Array.from(el.attributes).map(a => [a.name, a.value])
          ),
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          text: el.textContent?.trim().slice(0, 100) || null,
          styles: {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            fontSize: computed.fontSize,
            fontFamily: computed.fontFamily,
            padding: computed.padding,
            margin: computed.margin,
          },
        };
      })()
    `);

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result),
      }],
    };
  }
);

this.server.tool(
  "roopik.getElementStyles",
  {
    selector: z.string().describe("CSS selector"),
  },
  async ({ selector }) => {
    // Get computed styles + CSS source mapping
    const styles = await this.browserViewService.executeInBrowser(`
      (function() {
        const el = document.querySelector('${selector}');
        if (!el) return null;

        const computed = window.getComputedStyle(el);
        const allStyles = {};

        for (let i = 0; i < computed.length; i++) {
          const prop = computed[i];
          allStyles[prop] = computed.getPropertyValue(prop);
        }

        return allStyles;
      })()
    `);

    // TODO: Add CSS source mapping (which file defines each style)
    return {
      content: [{
        type: "text",
        text: JSON.stringify(styles),
      }],
    };
  }
);
```

#### 3.2 React Component Context (Framework-Specific)

```typescript
this.server.tool(
  "roopik.getReactComponentInfo",
  {
    selector: z.string().describe("CSS selector for React component"),
  },
  async ({ selector }) => {
    const info = await this.browserViewService.executeInBrowser(`
      (function() {
        const el = document.querySelector('${selector}');
        if (!el) return null;

        // Find React Fiber node
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
        if (!fiberKey) return { error: 'Not a React component' };

        const fiber = el[fiberKey];
        if (!fiber) return null;

        // Extract component info
        const componentName = fiber.type?.displayName || fiber.type?.name || 'Unknown';
        const props = fiber.memoizedProps || {};

        // Extract hooks (simplified)
        const hooks = [];
        let hookFiber = fiber.memoizedState;
        while (hookFiber) {
          hooks.push({
            value: hookFiber.memoizedState,
          });
          hookFiber = hookFiber.next;
        }

        return {
          componentName,
          props: JSON.parse(JSON.stringify(props)), // Serialize
          hooks,
        };
      })()
    `);

    return {
      content: [{
        type: "text",
        text: JSON.stringify(info),
      }],
    };
  }
);
```

#### 3.3 File Operations

```typescript
this.server.tool(
  "roopik.readFile",
  {
    path: z.string().describe("Absolute file path"),
  },
  async ({ path }) => {
    const content = await fs.promises.readFile(path, 'utf-8');
    return {
      content: [{
        type: "text",
        text: content,
      }],
    };
  }
);

this.server.tool(
  "roopik.writeFile",
  {
    path: z.string().describe("Absolute file path"),
    content: z.string().describe("File content"),
  },
  async ({ path, content }) => {
    await fs.promises.writeFile(path, content, 'utf-8');
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: true, path }),
      }],
    };
  }
);
```

#### Phase 3 Deliverables

- [ ] Element inspection with full context
- [ ] Computed styles extraction
- [ ] React component info (props, hooks)
- [ ] File read/write operations
- [ ] AI can make precise edits based on context

---

## 6. Testing Strategy

### Manual Testing with MCP Inspector

```bash
# Install MCP Inspector
npm install -g @anthropic/mcp-inspector

# Connect to Roopik
mcp-inspector http://localhost:3333/mcp
```

### Test with Claude Code

Add to Claude Code's MCP settings:

```json
{
  "mcpServers": {
    "roopik": {
      "url": "http://localhost:3333/mcp"
    }
  }
}
```

Then ask Claude Code:
- "List available Roopik tools"
- "Start the project at /path/to/project"
- "Take a screenshot of the current page"
- "What React component is at selector '.btn-primary'?"

### Test Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| Start project | Returns URL like `http://localhost:5173` |
| Stop project | Server stops, status shows stopped |
| Take screenshot | Returns base64 PNG image |
| Inspect element | Returns tag, classes, styles, bounds |
| Update component | File changes, component rebuilds |

---

## 7. File Structure

```
src/vs/workbench/contrib/roopik/
├── electron-main/
│   ├── mcp/
│   │   ├── mcpServerService.ts      # Main MCP server
│   │   ├── tools/
│   │   │   ├── projectTools.ts      # Project lifecycle tools
│   │   │   ├── componentTools.ts    # Canvas mode tools
│   │   │   ├── visualTools.ts       # Screenshot, navigation
│   │   │   ├── inspectTools.ts      # Element inspection
│   │   │   └── fileTools.ts         # File operations
│   │   └── mcpTypes.ts              # TypeScript types
│   └── roopik.contribution.ts       # Register MCP service
```

---

## 8. Summary

### Phase 1: Foundation (Start Here)
- MCP HTTP server on port 3333
- Project lifecycle tools (start, stop, status)
- Basic tool discovery working

### Phase 2: Component & Visual
- Canvas mode tools (create, update, delete component)
- Screenshot capture
- Navigation tools

### Phase 3: Rich Context (The Moat)
- Element inspection with full context
- React/Vue component info extraction
- File operations
- CSS source mapping

### Success Criteria

After all phases:
- [ ] Claude Code can start/stop Roopik projects
- [ ] AI can take screenshots and "see" results
- [ ] AI can inspect elements and get exact source locations
- [ ] AI can make precise edits based on rich context
- [ ] Multiple agents can connect simultaneously

---

**Status:** Ready for Implementation
**Last Updated:** December 21, 2025
**Next:** Begin Phase 1 - MCP Server Foundation
