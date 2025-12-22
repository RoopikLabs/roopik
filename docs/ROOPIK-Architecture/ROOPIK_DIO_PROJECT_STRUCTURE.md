# Roopik-Dio Project Structure & Architecture

> **Clean, modular, agent-first architecture for Dio in VSCode core**

---

## 🔍 Key Insight: How VSCode Chat Works with GitHub Copilot

### **The Architecture Pattern**

VSCode's `chat` contrib is a **framework/platform**, not a specific AI:

```
┌─────────────────────────────────────────────────────────────┐
│          contrib/chat (CORE - Framework)                    │
│                                                             │
│  • IChatService - Session management                        │
│  • IChatAgentService - Agent registration/routing           │
│  • Chat UI widgets (chatWidget, chatInputPart, etc.)        │
│  • Storage (chatSessionStore, chatModelStore)               │
│  • Tools infrastructure (languageModelToolsService)         │
└────────────────────────────────────┬────────────────────────┘
                                     │
                                     │ registerAgent()
                                     │ registerAgentImplementation()
                                     ↓
┌─────────────────────────────────────────────────────────────┐
│      Extensions (GitHub Copilot, etc.)                      │
│                                                             │
│  • Register as "chat participant"                           │
│  • Provide IChatAgentImplementation                         │
│  • Handle invoke(), provideFollowups(), etc.                │
│  • Make API calls to their AI service                       │
└─────────────────────────────────────────────────────────────┘
```

**Key Properties in Agent Registration**:
```typescript
interface IChatAgentData {
  id: string                    // "github.copilot"
  extensionId: ExtensionIdentifier
  isDefault?: boolean           // Default agent when no @ mention
  isDynamic?: boolean           // Registered at runtime (not package.json)
  isCore?: boolean              // Built into VSCode core (not extension)
}
```

### **Dio's Approach: Separate, Purpose-Built**

We're NOT using the generic chat framework. Dio is **purpose-built for Roopik**:

```
contrib/chat         → Generic chat framework (Copilot, etc.)
contrib/roopikDio    → Purpose-built canvas agent (Dio)
```

**Why separate?**
- ✅ Dio is deeply integrated with canvas (not generic chat)
- ✅ Simpler architecture (no extension registration overhead)
- ✅ Full control over UI/UX
- ✅ Canvas context is first-class citizen
- ✅ Users can use BOTH (Copilot for generic, Dio for canvas)

---

## 📁 Recommended Project Structure

### **Layer Breakdown**

| Layer | Purpose | Can Import |
|-------|---------|------------|
| `common/` | Types, interfaces, constants | Only base VSCode utilities |
| `browser/` | UI, DOM, rendering, browser services | common/ |
| `node/` | Node.js operations (file I/O, native) | common/ |
| `electron-main/` | Main process operations | common/, node/ |

### **Complete Folder Structure**

```
src/vs/workbench/contrib/roopikDio/
│
├── common/                              # Shared (browser + node)
│   ├── roopikDio.ts                    # Main service interface
│   ├── roopikDioTypes.ts               # Core types (Task, Message, Context)
│   ├── roopikDioTools.ts               # MCP tool definitions
│   ├── roopikDioMode.ts                # Mode definitions (designer, coder, etc.)
│   ├── roopikDioContextKeys.ts         # Context keys for when clauses
│   └── roopikDioConstants.ts           # Constants, enums
│
├── browser/                             # Renderer process (UI)
│   ├── roopikDio.contribution.ts       # Main registration file
│   │
│   ├── services/                        # Browser-side services
│   │   ├── dioService.ts               # Main Dio service implementation
│   │   ├── dioTaskManager.ts           # Task lifecycle management
│   │   ├── dioContextBuilder.ts        # Build context for AI
│   │   ├── dioToolExecutor.ts          # Execute MCP tools
│   │   └── dioModeService.ts           # Mode switching logic
│   │
│   ├── views/                           # UI Views
│   │   ├── dioViewPane.ts              # Main chat view (sidebar/panel)
│   │   ├── dioEditor.ts                # Chat as editor pane
│   │   └── dioEditorInput.ts           # Editor input model
│   │
│   ├── widgets/                         # UI Components
│   │   ├── dioInputWidget.ts           # Chat input box
│   │   ├── dioMessageList.ts           # Message list renderer
│   │   ├── dioMessageItem.ts           # Individual message
│   │   ├── dioToolCallWidget.ts        # Tool call visualization
│   │   └── dioContextBadge.ts          # Canvas/component context badge
│   │
│   ├── actions/                         # Commands & actions
│   │   ├── dioActions.ts               # Main actions (send, clear, etc.)
│   │   ├── dioModeActions.ts           # Mode switching actions
│   │   └── dioToolActions.ts           # Tool-related actions
│   │
│   └── media/                           # CSS, icons
│       └── dio.css
│
├── node/                                # Node.js (file operations)
│   ├── dioPersistence.ts               # Save/load tasks to disk
│   ├── dioStorageManager.ts            # File system operations
│   └── dioApiClient.ts                 # AI API calls (Anthropic, etc.)
│
└── electron-main/                       # Main process (if needed)
    └── dioMainService.ts               # Native operations
```

---

## 🧩 What Goes Where (Layer Rules)

### **common/** - Pure TypeScript, No Dependencies

```typescript
// common/roopikDio.ts - Service Interface

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { DioTask, DioContext, DioMessage } from './roopikDioTypes.js';

export const IRoopikDioService = createDecorator<IRoopikDioService>('roopikDioService');

export interface IRoopikDioService {
  // Events
  readonly onDidChangeTask: Event<DioTask | undefined>;
  readonly onDidReceiveMessage: Event<DioMessage>;

  // Task management
  getCurrentTask(): DioTask | undefined;
  createTask(context: DioContext): Promise<DioTask>;
  loadTask(taskId: string): Promise<DioTask>;

  // Canvas integration
  openCanvasChat(options: {
    canvasId: string;
    canvasName: string;
    selectedComponent?: { id: string; name: string; code: string };
  }): Promise<void>;

  // Messaging
  sendMessage(text: string, images?: string[]): Promise<void>;

  // Mode
  switchMode(mode: string): Promise<void>;
}
```

```typescript
// common/roopikDioTypes.ts - Core Types

export interface DioTask {
  taskId: string;
  canvasId?: string;
  canvasName?: string;
  mode: string;
  status: DioTaskStatus;
  messages: DioMessage[];
  apiHistory: DioApiMessage[];
  createdAt: number;
  updatedAt: number;
}

export type DioTaskStatus = 'active' | 'paused' | 'completed' | 'error';

export interface DioMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: DioToolCall[];
  componentContext?: {
    id: string;
    name: string;
    codeSnapshot?: string;
  };
}

export interface DioToolCall {
  id: string;
  name: string;
  params: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'error';
}

export interface DioContext {
  canvas: {
    id: string;
    name: string;
    framework: string;
    componentCount: number;
  };
  selectedComponent?: {
    id: string;
    name: string;
    path: string;
    code: string;
    dependencies?: DioComponentDependency[];
  };
  allComponents: Array<{
    id: string;
    name: string;
    path: string;
  }>;
}

export interface DioApiMessage {
  role: 'user' | 'assistant';
  content: string | DioContentBlock[];
  ts?: number;
}

export interface DioContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  // ... specific properties per type
}
```

```typescript
// common/roopikDioTools.ts - MCP Tool Definitions

export interface DioToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const DIO_TOOLS: DioToolDefinition[] = [
  {
    name: 'create_component',
    description: 'Create a new React component in the active canvas',
    parameters: {
      type: 'object',
      properties: {
        componentId: {
          type: 'string',
          description: 'Unique component ID (PascalCase, e.g., "LoginForm", "Button_Primary")'
        },
        componentName: {
          type: 'string',
          description: 'Human-readable component name'
        },
        code: {
          type: 'string',
          description: 'Complete React component code with DEPENDENCIES manifest'
        }
      },
      required: ['componentId', 'componentName', 'code']
    }
  },
  {
    name: 'update_component',
    description: 'Update an existing component',
    parameters: {
      type: 'object',
      properties: {
        componentId: { type: 'string' },
        code: { type: 'string' }
      },
      required: ['componentId', 'code']
    }
  },
  {
    name: 'get_component_source',
    description: 'Read a component\'s current source code',
    parameters: {
      type: 'object',
      properties: {
        componentId: { type: 'string' }
      },
      required: ['componentId']
    }
  },
  {
    name: 'list_canvas_components',
    description: 'Get all components in the canvas',
    parameters: {
      type: 'object',
      properties: {}
    }
  }
];
```

---

### **browser/** - UI & Renderer Process Services

```typescript
// browser/roopikDio.contribution.ts - Main Registration

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';

import { IRoopikDioService } from '../common/roopikDio.js';
import { RoopikDioService } from './services/dioService.js';

// Register the main service
registerSingleton(IRoopikDioService, RoopikDioService, InstantiationType.Delayed);

// Register commands/actions
import './actions/dioActions.js';
import './actions/dioModeActions.js';

// Register views (if using viewlet)
// ... view registration
```

```typescript
// browser/services/dioService.ts - Main Service Implementation

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IFileService } from '../../../../platform/files/common/files.js';

import { IRoopikDioService } from '../common/roopikDio.js';
import { DioTask, DioContext, DioMessage } from '../common/roopikDioTypes.js';
import { IComponentService } from '../../roopik/common/roopik.js';  // Import roopik!

import { DioTaskManager } from './dioTaskManager.js';
import { DioContextBuilder } from './dioContextBuilder.js';
import { DioToolExecutor } from './dioToolExecutor.js';

export class RoopikDioService extends Disposable implements IRoopikDioService {

  private readonly _onDidChangeTask = this._register(new Emitter<DioTask | undefined>());
  readonly onDidChangeTask = this._onDidChangeTask.event;

  private readonly _onDidReceiveMessage = this._register(new Emitter<DioMessage>());
  readonly onDidReceiveMessage = this._onDidReceiveMessage.event;

  private readonly taskManager: DioTaskManager;
  private readonly contextBuilder: DioContextBuilder;
  private readonly toolExecutor: DioToolExecutor;

  constructor(
    @IFileService private readonly fileService: IFileService,
    @IComponentService private readonly componentService: IComponentService  // Inject roopik!
  ) {
    super();

    this.taskManager = this._register(new DioTaskManager(fileService));
    this.contextBuilder = new DioContextBuilder(componentService);
    this.toolExecutor = new DioToolExecutor(componentService);
  }

  getCurrentTask(): DioTask | undefined {
    return this.taskManager.getCurrentTask();
  }

  async openCanvasChat(options: {
    canvasId: string;
    canvasName: string;
    selectedComponent?: { id: string; name: string; code: string };
  }): Promise<void> {
    // 1. Get canvas from roopik service
    const canvas = await this.componentService.getCanvas(options.canvasId);

    // 2. Check if task exists for this canvas
    if (canvas.chatTaskId) {
      await this.taskManager.loadTask(canvas.chatTaskId);
    } else {
      // 3. Build context
      const context = await this.contextBuilder.buildContext(
        options.canvasId,
        options.selectedComponent
      );

      // 4. Create new task
      const task = await this.taskManager.createTask(context);

      // 5. Save taskId to canvas (via roopik service)
      await this.componentService.updateCanvasMetadata(options.canvasId, {
        chatTaskId: task.taskId
      });
    }

    this._onDidChangeTask.fire(this.taskManager.getCurrentTask());
  }

  async sendMessage(text: string, images?: string[]): Promise<void> {
    const task = this.getCurrentTask();
    if (!task) {
      throw new Error('No active task');
    }

    // 1. Add user message
    const userMessage = await this.taskManager.addUserMessage(task.taskId, text, images);
    this._onDidReceiveMessage.fire(userMessage);

    // 2. Get current context
    const context = await this.contextBuilder.buildContext(task.canvasId);

    // 3. Call AI API (via node layer)
    const response = await this.callAI(task, context, text);

    // 4. Handle tool calls if any
    if (response.toolCalls) {
      for (const toolCall of response.toolCalls) {
        const result = await this.toolExecutor.execute(toolCall, task.canvasId);
        // ... handle result
      }
    }

    // 5. Add assistant message
    const assistantMessage = await this.taskManager.addAssistantMessage(
      task.taskId,
      response.content,
      response.toolCalls
    );
    this._onDidReceiveMessage.fire(assistantMessage);
  }

  async switchMode(mode: string): Promise<void> {
    const task = this.getCurrentTask();
    if (task) {
      await this.taskManager.updateTaskMode(task.taskId, mode);
      this._onDidChangeTask.fire(this.getCurrentTask());
    }
  }

  private async callAI(task: DioTask, context: DioContext, text: string): Promise<any> {
    // This will be implemented in node layer and called via IPC or direct import
    // For now, placeholder
    return { content: 'AI response', toolCalls: [] };
  }
}
```

```typescript
// browser/services/dioToolExecutor.ts - Execute MCP Tools

import { IComponentService } from '../../roopik/common/roopik.js';
import { DioToolCall } from '../common/roopikDioTypes.js';

export class DioToolExecutor {
  constructor(
    private readonly componentService: IComponentService
  ) {}

  async execute(toolCall: DioToolCall, canvasId?: string): Promise<unknown> {
    switch (toolCall.name) {
      case 'create_component':
        return this.createComponent(toolCall.params, canvasId);
      case 'update_component':
        return this.updateComponent(toolCall.params, canvasId);
      case 'get_component_source':
        return this.getComponentSource(toolCall.params, canvasId);
      case 'list_canvas_components':
        return this.listComponents(canvasId);
      default:
        throw new Error(`Unknown tool: ${toolCall.name}`);
    }
  }

  private async createComponent(params: any, canvasId?: string) {
    if (!canvasId) throw new Error('No canvas context');

    // Call roopik's component service!
    const result = await this.componentService.createComponent({
      canvasId,
      componentId: params.componentId,  // AI-provided ID
      componentName: params.componentName,
      code: params.code,
      dependencies: params.dependencies
    });

    return {
      success: true,
      componentId: result.id,
      path: result.path,
      filePath: result.filePath
    };
  }

  private async updateComponent(params: any, canvasId?: string) {
    if (!canvasId) throw new Error('No canvas context');

    await this.componentService.updateComponentCode(
      canvasId,
      params.componentId,
      params.code
    );

    return { success: true };
  }

  private async getComponentSource(params: any, canvasId?: string) {
    if (!canvasId) throw new Error('No canvas context');

    const code = await this.componentService.getComponentCode(
      canvasId,
      params.componentId
    );

    return { code };
  }

  private async listComponents(canvasId?: string) {
    if (!canvasId) throw new Error('No canvas context');

    const components = await this.componentService.listComponents(canvasId);
    return { components };
  }
}
```

---

### **node/** - File System & AI API

```typescript
// node/dioPersistence.ts - Task Storage

import * as fs from 'fs';
import * as path from 'path';
import { DioTask, DioMessage, DioApiMessage } from '../common/roopikDioTypes.js';

export class DioPersistence {

  /**
   * Get task directory path
   * Storage: .roopik/canvases/{canvasId}/dio/tasks/{taskId}/
   */
  getTaskDir(workspacePath: string, canvasId: string, taskId: string): string {
    return path.join(
      workspacePath,
      '.roopik',
      'canvases',
      canvasId,
      'dio',
      'tasks',
      taskId
    );
  }

  async saveTask(workspacePath: string, task: DioTask): Promise<void> {
    if (!task.canvasId) throw new Error('Task has no canvas context');

    const taskDir = this.getTaskDir(workspacePath, task.canvasId, task.taskId);
    await fs.promises.mkdir(taskDir, { recursive: true });

    // Save UI messages
    await fs.promises.writeFile(
      path.join(taskDir, 'ui_messages.json'),
      JSON.stringify(task.messages, null, 2)
    );

    // Save API history
    await fs.promises.writeFile(
      path.join(taskDir, 'api_conversation_history.json'),
      JSON.stringify(task.apiHistory, null, 2)
    );

    // Save metadata
    await fs.promises.writeFile(
      path.join(taskDir, 'task_metadata.json'),
      JSON.stringify({
        taskId: task.taskId,
        canvasId: task.canvasId,
        canvasName: task.canvasName,
        mode: task.mode,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      }, null, 2)
    );
  }

  async loadTask(workspacePath: string, canvasId: string, taskId: string): Promise<DioTask> {
    const taskDir = this.getTaskDir(workspacePath, canvasId, taskId);

    const [messagesRaw, apiHistoryRaw, metadataRaw] = await Promise.all([
      fs.promises.readFile(path.join(taskDir, 'ui_messages.json'), 'utf-8'),
      fs.promises.readFile(path.join(taskDir, 'api_conversation_history.json'), 'utf-8'),
      fs.promises.readFile(path.join(taskDir, 'task_metadata.json'), 'utf-8')
    ]);

    const messages: DioMessage[] = JSON.parse(messagesRaw);
    const apiHistory: DioApiMessage[] = JSON.parse(apiHistoryRaw);
    const metadata = JSON.parse(metadataRaw);

    return {
      ...metadata,
      messages,
      apiHistory
    };
  }
}
```

```typescript
// node/dioApiClient.ts - AI API Calls

import Anthropic from '@anthropic-ai/sdk';
import { DioTask, DioContext, DioApiMessage } from '../common/roopikDioTypes.js';
import { DIO_TOOLS } from '../common/roopikDioTools.js';

export interface DioApiConfig {
  provider: 'anthropic' | 'openai' | 'gemini';
  apiKey: string;
  modelId: string;
}

export class DioApiClient {
  private anthropic: Anthropic | null = null;

  constructor(private config: DioApiConfig) {
    if (config.provider === 'anthropic') {
      this.anthropic = new Anthropic({ apiKey: config.apiKey });
    }
  }

  async sendMessage(
    task: DioTask,
    context: DioContext,
    userMessage: string
  ): Promise<{ content: string; toolCalls?: any[] }> {

    const systemPrompt = this.buildSystemPrompt(context);
    const messages = this.buildMessages(task.apiHistory, userMessage);

    if (this.config.provider === 'anthropic' && this.anthropic) {
      const response = await this.anthropic.messages.create({
        model: this.config.modelId,
        max_tokens: 8192,
        system: systemPrompt,
        messages,
        tools: this.convertToolsToAnthropicFormat()
      });

      return this.parseAnthropicResponse(response);
    }

    throw new Error(`Provider ${this.config.provider} not implemented`);
  }

  private buildSystemPrompt(context: DioContext): string {
    return `
You are Dio, an AI agent for Roopik IDE - a design-to-code platform.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT CANVAS CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Canvas: "${context.canvas.name}" (ID: ${context.canvas.id})
🧩 Components: ${context.canvas.componentCount}
⚛️  Framework: ${context.canvas.framework}

${context.selectedComponent ? `
🎯 SELECTED COMPONENT: "${context.selectedComponent.name}"
📄 Path: ${context.selectedComponent.path}

\`\`\`tsx
${context.selectedComponent.code}
\`\`\`
` : '(No component selected)'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. When creating components, use PascalCase IDs (e.g., "LoginForm", "Button_Primary")
2. Always include DEPENDENCIES manifest comment in component code
3. When user says "this component", they mean the selected component above
`;
  }

  private buildMessages(history: DioApiMessage[], newMessage: string): any[] {
    const messages = history.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    messages.push({ role: 'user', content: newMessage });
    return messages;
  }

  private convertToolsToAnthropicFormat(): any[] {
    return DIO_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }));
  }

  private parseAnthropicResponse(response: any): { content: string; toolCalls?: any[] } {
    const content: string[] = [];
    const toolCalls: any[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          params: block.input
        });
      }
    }

    return {
      content: content.join('\n'),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }
}
```

---

## 🔗 Integration with Roopik

### **Update Roopik's IComponentService** (roopik/common/roopik.ts)

```typescript
// Add canvas metadata field
export interface CanvasMetadata {
  id: string;
  name: string;
  framework: string;
  createdAt: number;
  chatTaskId?: string;  // ✨ NEW: Link to Dio task
}

export interface IComponentService {
  // ... existing methods

  // ✨ NEW: Update canvas metadata
  updateCanvasMetadata(canvasId: string, updates: Partial<CanvasMetadata>): Promise<void>;
}
```

### **Use Dio from Canvas Editor** (roopik/browser/canvasEditor.ts)

```typescript
import { IRoopikDioService } from '../../roopikDio/common/roopikDio.js';

export class CanvasEditor extends EditorPane {
  constructor(
    @IComponentService private componentService: IComponentService,
    @IRoopikDioService private dioService: IRoopikDioService
  ) {
    super();
  }

  private async openDioChat(): Promise<void> {
    const selectedComponent = this.getSelectedComponent();

    await this.dioService.openCanvasChat({
      canvasId: this.canvasId,
      canvasName: this.canvasName,
      selectedComponent: selectedComponent ? {
        id: selectedComponent.id,
        name: selectedComponent.name,
        code: await this.componentService.getComponentCode(
          this.canvasId,
          selectedComponent.id
        )
      } : undefined
    });

    // Open Dio view/panel
    // ...
  }
}
```

---

## 📋 Storage Structure

```
.roopik/
├── canvases/
│   ├── canvases.json                    # Canvas registry
│   │   {
│   │     "canvases": [
│   │       {
│   │         "id": "test",
│   │         "name": "TEST",
│   │         "chatTaskId": "abc123..."   ✨ Link to Dio task
│   │       }
│   │     ]
│   │   }
│   │
│   └── test/
│       ├── canvas.json
│       ├── components/
│       │   └── ...
│       │
│       └── dio/                          ✨ Dio storage per canvas
│           └── tasks/
│               └── abc123.../
│                   ├── ui_messages.json
│                   ├── api_conversation_history.json
│                   └── task_metadata.json
```

---

## 🚀 Migration Path from Extension

### **What to Copy**

| From Extension | To Core |
|----------------|---------|
| `core/task/Task.ts` | `roopikDio/browser/services/dioTaskManager.ts` |
| `core/webview/ClineProvider.ts` | `roopikDio/browser/services/dioService.ts` |
| `core/task-persistence/` | `roopikDio/node/dioPersistence.ts` |
| `api/providers/*.ts` | `roopikDio/node/dioApiClient.ts` |
| `shared/modes.ts` | `roopikDio/common/roopikDioMode.ts` |
| `webview/src/components/chat/` | `roopikDio/browser/widgets/` |

### **What NOT to Copy**

- ❌ Cloud services (`@roo-code/cloud`) - Not needed
- ❌ Telemetry (`@roo-code/telemetry`) - Will use VSCode's telemetry
- ❌ Extension activation logic - Not an extension
- ❌ Webview infrastructure - Will use native VSCode widgets

### **Simplification**

The extension has ~35,000 tokens in ClineProvider alone. In core, we split it:

```
ClineProvider (35k tokens)
    ↓ Split into:
├── dioService.ts          (~2k tokens) - Main coordination
├── dioTaskManager.ts      (~3k tokens) - Task lifecycle
├── dioContextBuilder.ts   (~1k tokens) - Build context
├── dioToolExecutor.ts     (~2k tokens) - Tool execution
└── dioApiClient.ts        (~2k tokens) - API calls
```

**Total: ~10k tokens** (70% reduction!)

---

## 📝 Implementation Checklist

### **Phase 1: Foundation**
- [ ] Create folder structure
- [ ] Create `common/roopikDio.ts` (interface)
- [ ] Create `common/roopikDioTypes.ts` (types)
- [ ] Create `common/roopikDioTools.ts` (tool definitions)

### **Phase 2: Services**
- [ ] Create `browser/services/dioService.ts`
- [ ] Create `browser/services/dioTaskManager.ts`
- [ ] Create `browser/services/dioContextBuilder.ts`
- [ ] Create `browser/services/dioToolExecutor.ts`
- [ ] Create `node/dioPersistence.ts`
- [ ] Create `node/dioApiClient.ts`

### **Phase 3: Registration**
- [ ] Create `browser/roopikDio.contribution.ts`
- [ ] Register `IRoopikDioService` singleton
- [ ] Import in `workbench.common.main.ts`

### **Phase 4: Integration**
- [ ] Add `chatTaskId` to roopik canvas metadata
- [ ] Inject `IRoopikDioService` in CanvasEditor
- [ ] Implement `openDioChat()` in canvas

### **Phase 5: UI**
- [ ] Create `browser/views/dioViewPane.ts`
- [ ] Create chat widgets
- [ ] Add commands/actions

---

## ✅ Summary: Clean & Modular

| Layer | Responsibility | Dependencies |
|-------|---------------|--------------|
| **common/** | Types, interfaces, constants | None |
| **browser/** | UI, coordination, browser services | common/, roopik/ |
| **node/** | File I/O, API calls | common/ |
| **electron-main/** | Native operations (if needed) | common/, node/ |

**Key Principles**:
- ✅ Separate layers for different concerns
- ✅ Communication via VSCode DI
- ✅ Canvas context is first-class
- ✅ Minimal, focused code (~70% reduction from extension)
- ✅ Testable (each service can be mocked)

---

**Last Updated**: 2024-12-21
**Status**: Architecture Finalized ✅
**Next Step**: Create folder structure and start Phase 1
