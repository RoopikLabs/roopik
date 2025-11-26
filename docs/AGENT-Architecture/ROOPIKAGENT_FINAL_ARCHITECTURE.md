# RoopikAgent: Final Architecture Design

**Version**: 1.0
**Date**: November 24, 2025
**Status**: Design Specification

---

## Executive Summary

This document synthesizes insights from three comprehensive research sources to design RoopikAgent, a next-generation AI coding assistant for Roopik - a designer-first IDE built on VSCode:

1. **Online Research** ([ROOPIKAGENT_ARCHITECTURE.md](./ROOPIKAGENT_ARCHITECTURE.md)) - Industry best practices from Cursor, Windsurf, GitHub Copilot, Cline, Aider, OpenHands
2. **GitHub Copilot Chat Analysis** ([GITHUB_COPILOT_CHAT_ANALYSIS.md](./GITHUB_COPILOT_CHAT_ANALYSIS.md)) - Production-grade architecture patterns from Microsoft
3. **Void Agent Analysis** ([VOID_AGENT_ANALYSIS.md](./VOID_AGENT_ANALYSIS.md)) - Historical innovations and anti-patterns to avoid

**Key Design Principles**:
- ✅ **Production-Ready**: Use GitHub Copilot's service-oriented architecture with dependency injection
- ✅ **Reactive**: Observable-based programming for real-time UI updates
- ✅ **Type-Safe**: End-to-end type safety with Zod schemas and TypeScript
- ✅ **Extensible**: MCP protocol for tool integration, content parts for rendering
- ✅ **Designer-First**: Visual context understanding, canvas tool integration
- ✅ **Multi-Agent**: Git worktree orchestration for parallel workflows
- ✅ **Safe**: Graduated permission system with approval flows
- ✅ **Modern**: tRPC (not manual IPC), Vercel AI SDK (not custom streaming), Zod validation

---

## Table of Contents

1. [Three-Source Synthesis](#three-source-synthesis)
2. [Core Architecture](#core-architecture)
3. [Service Layer Design](#service-layer-design)
4. [Agent Loop Implementation](#agent-loop-implementation)
5. [Tool System Architecture](#tool-system-architecture)
6. [Multi-Agent Orchestration](#multi-agent-orchestration)
7. [UI Architecture](#ui-architecture)
8. [Context Management](#context-management)
9. [Permission & Safety System](#permission--safety-system)
10. [Designer-First Features](#designer-first-features)
11. [Technology Stack](#technology-stack)
12. [Implementation Roadmap](#implementation-roadmap)
13. [Comparison with Competitors](#comparison-with-competitors)

---

## Three-Source Synthesis

### What We Learned from Each Source

| **Aspect** | **Online Research** | **GitHub Copilot Chat** | **Void Agent** |
|------------|---------------------|-------------------------|----------------|
| **Architecture Pattern** | ReAct loop, multi-agent system | Service-oriented with DI | Monolithic (anti-pattern) |
| **State Management** | Streaming with events | Observable-based reactive | Manual state tracking |
| **Tool Calling** | MCP protocol | Tool invocation state machine | Approval system ✅ |
| **IPC Communication** | Not specified | Native VSCode services | Manual Electron IPC (anti-pattern) |
| **Editing Strategy** | Semantic diff generation | Chat editing sessions | Search/replace ✅ |
| **Context Management** | AST + embeddings + search | Dynamic context with attachments | Manual context building |
| **Permission System** | Ask/Edit/Build modes | Tool confirmation flow | Auto-approve settings ✅ |
| **UI Rendering** | Streaming with progressive | Content parts architecture | Custom rendering (outdated) |
| **Code Quality** | Industry best practices | Production-grade ⭐⭐⭐⭐⭐ | Monolithic files (anti-pattern) |
| **Testing** | Comprehensive | Extensive test coverage | No tests (anti-pattern) |
| **Modularity** | Microservices | Small focused files | 2,465-line files (anti-pattern) |

### Combined Best Practices

**✅ Adopt from GitHub Copilot Chat**:
- Service-oriented architecture with dependency injection
- Observable-based reactive programming
- Content parts architecture for extensible rendering
- Session persistence with reference counting
- Tool invocation state machine
- Small modular files (< 500 lines)

**✅ Adopt from Void**:
- Tool approval system with auto-approve settings
- Search/replace editing for precise modifications
- Checkpoint system for time-travel debugging
- Three-tier modes (normal/gather/agent)

**✅ Adopt from Online Research**:
- ReAct loop (Reason → Act → Observe → Repeat)
- Multi-agent orchestration with git worktrees
- MCP protocol for tool extensibility
- Semantic diff generation (two-model approach)
- Prompt caching strategies (10x cost reduction)
- Streaming with progressive rendering

**❌ Avoid from Void**:
- ❌ Forking VSCode (use extensions + contributions)
- ❌ Monolithic files (keep files < 500 lines)
- ❌ Manual Electron IPC (use VSCode services)
- ❌ No tests (comprehensive test coverage required)
- ❌ Manual streaming (use Vercel AI SDK)

---

## Core Architecture

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                         Roopik IDE (VSCode)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────┐    ┌──────────────────────────────┐    │
│  │   UI Layer         │    │   Service Layer              │    │
│  │   (Browser)        │◄───┤   (Browser + Main Process)   │    │
│  ├────────────────────┤    ├──────────────────────────────┤    │
│  │ • ChatWidget       │    │ • RoopikAgentService         │    │
│  │ • ContentParts     │    │ • ContextService             │    │
│  │ • ToolConfirmation │    │ • ToolExecutionService       │    │
│  │ • DesignCanvas     │    │ • MultiAgentOrchestrator     │    │
│  │ • ObservableUI     │    │ • MCPBridgeService           │    │
│  └────────────────────┘    └──────────────────────────────┘    │
│                                      │                           │
│  ┌──────────────────────────────────┼────────────────────────┐ │
│  │              Agent Core           │                        │ │
│  ├──────────────────────────────────┼────────────────────────┤ │
│  │ ┌──────────────┐  ┌─────────────┴────────┐  ┌──────────┐ │ │
│  │ │ ReAct Loop   │  │  Tool System (MCP)   │  │ Context  │ │ │
│  │ │ Engine       │◄─┤  • Search Code       │◄─┤ Manager  │ │ │
│  │ │              │  │  • Edit File         │  │          │ │ │
│  │ │ Reason       │  │  • Run Terminal      │  │ • AST    │ │ │
│  │ │   ↓          │  │  • Canvas Tools      │  │ • RAG    │ │ │
│  │ │ Act          │  │  • Browser Preview   │  │ • Search │ │ │
│  │ │   ↓          │  └──────────────────────┘  └──────────┘ │ │
│  │ │ Observe      │                                          │ │
│  │ │   ↓          │                                          │ │
│  │ │ Repeat       │                                          │ │
│  │ └──────────────┘                                          │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │            Multi-Agent Orchestrator (Git Worktrees)        │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  Main Agent       Sub-Agent 1        Sub-Agent 2           │ │
│  │  (main branch)    (worktree-1)       (worktree-2)          │ │
│  │       │                 │                   │              │ │
│  │       └─────────────────┴───────────────────┘              │ │
│  │              (Parallel execution)                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Architecture Layers

#### 1. **UI Layer** (Browser Process)
- Observable-based reactive rendering
- Content parts architecture for extensible UI
- Tool confirmation dialogs
- Design canvas integration
- Real-time streaming updates

#### 2. **Service Layer** (Browser + Main Process)
- Dependency injection for loose coupling
- Service-oriented architecture
- Session management with persistence
- tRPC for type-safe communication
- Observable state for reactive updates

#### 3. **Agent Core**
- ReAct loop engine for reasoning
- Tool system with MCP integration
- Context manager with AST + RAG
- Permission system with approval flows

#### 4. **Multi-Agent Orchestrator**
- Git worktree management
- Parallel agent execution
- Result merging and conflict resolution

---

## Service Layer Design

### Core Services Architecture

Following GitHub Copilot Chat's service-oriented pattern with dependency injection:

```typescript
// src/vs/workbench/contrib/roopikAgent/common/roopikAgentService.ts

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../base/common/event.js';

export const IRoopikAgentService = createDecorator<IRoopikAgentService>('roopikAgentService');

export interface IRoopikAgentService {
    readonly _serviceBrand: undefined;

    // Observable state
    readonly sessions: IObservable<IRoopikAgentSession[]>;
    readonly activeSession: IObservable<IRoopikAgentSession | undefined>;
    readonly isProcessing: IObservable<boolean>;

    // Events
    readonly onDidChangeSession: Event<IRoopikAgentSession>;
    readonly onDidReceiveResponse: Event<IRoopikAgentResponse>;

    // Session management
    createSession(mode: AgentMode): Promise<IRoopikAgentSession>;
    getSession(sessionId: string): IRoopikAgentSession | undefined;
    deleteSession(sessionId: string): Promise<void>;

    // Agent interaction
    sendRequest(sessionId: string, request: IRoopikAgentRequest): Promise<void>;
    cancelRequest(sessionId: string, requestId: string): Promise<void>;

    // Tool execution
    approveTool(sessionId: string, toolId: string): Promise<void>;
    rejectTool(sessionId: string, toolId: string): Promise<void>;
}

export interface IRoopikAgentSession {
    readonly id: string;
    readonly mode: AgentMode;
    readonly createdAt: Date;
    readonly requests: IRoopikAgentRequest[];
    readonly context: ISessionContext;
}

export type AgentMode = 'ask' | 'gather' | 'agent' | 'edit' | 'build';

export interface IRoopikAgentRequest {
    readonly id: string;
    readonly message: string;
    readonly attachments: IContextAttachment[];
    readonly response?: IRoopikAgentResponse;
}

export interface IRoopikAgentResponse {
    readonly id: string;
    readonly content: IContentPart[];
    readonly toolInvocations: IToolInvocation[];
    readonly status: 'streaming' | 'completed' | 'error';
}
```

### Service Dependencies

```typescript
// src/vs/workbench/contrib/roopikAgent/browser/roopikAgentService.ts

export class RoopikAgentService extends Disposable implements IRoopikAgentService {
    declare readonly _serviceBrand: undefined;

    private readonly _sessions = observableValue<IRoopikAgentSession[]>('sessions', []);
    public readonly sessions: IObservable<IRoopikAgentSession[]> = this._sessions;

    private readonly _activeSession = observableValue<IRoopikAgentSession | undefined>('activeSession', undefined);
    public readonly activeSession: IObservable<IRoopikAgentSession | undefined> = this._activeSession;

    private readonly _isProcessing = observableValue<boolean>('isProcessing', false);
    public readonly isProcessing: IObservable<boolean> = this._isProcessing;

    private readonly _onDidChangeSession = this._register(new Emitter<IRoopikAgentSession>());
    public readonly onDidChangeSession = this._onDidChangeSession.event;

    private readonly _onDidReceiveResponse = this._register(new Emitter<IRoopikAgentResponse>());
    public readonly onDidReceiveResponse = this._onDidReceiveResponse.event;

    constructor(
        @IContextService private readonly contextService: IContextService,
        @IToolExecutionService private readonly toolExecutionService: IToolExecutionService,
        @IModelService private readonly modelService: IModelService,
        @IStorageService private readonly storageService: IStorageService,
        @ILogService private readonly logService: ILogService,
        @ITelemetryService private readonly telemetryService: ITelemetryService,
        @IMultiAgentOrchestrator private readonly orchestrator: IMultiAgentOrchestrator,
        @IMCPBridgeService private readonly mcpBridge: IMCPBridgeService
    ) {
        super();
        this.initialize();
    }

    private async initialize(): Promise<void> {
        // Load persisted sessions
        const persistedSessions = this.loadPersistedSessions();
        this._sessions.set(persistedSessions, undefined);

        // Register tool listeners
        this._register(this.toolExecutionService.onDidExecuteTool(e => {
            this.handleToolExecution(e);
        }));

        this.logService.info('[RoopikAgent] Service initialized');
    }

    public async sendRequest(sessionId: string, request: IRoopikAgentRequest): Promise<void> {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        this._isProcessing.set(true, undefined);

        try {
            // Get context for request
            const context = await this.contextService.buildContext(request, session);

            // Start ReAct loop
            const response = await this.runReActLoop(request, context, session);

            // Update session with response
            session.requests.push({ ...request, response });
            this._onDidReceiveResponse.fire(response);

            // Persist session
            await this.persistSession(session);

        } catch (error) {
            this.logService.error('[RoopikAgent] Request failed', error);
            throw error;
        } finally {
            this._isProcessing.set(false, undefined);
        }
    }

    private async runReActLoop(
        request: IRoopikAgentRequest,
        context: ISessionContext,
        session: IRoopikAgentSession
    ): Promise<IRoopikAgentResponse> {
        // ReAct loop implementation (see next section)
        // ...
    }
}
```

### Additional Core Services

```typescript
// Service registry
export const IContextService = createDecorator<IContextService>('contextService');
export const IToolExecutionService = createDecorator<IToolExecutionService>('toolExecutionService');
export const IMultiAgentOrchestrator = createDecorator<IMultiAgentOrchestrator>('multiAgentOrchestrator');
export const IMCPBridgeService = createDecorator<IMCPBridgeService>('mcpBridgeService');
export const ICheckpointService = createDecorator<ICheckpointService>('checkpointService');
export const IDesignContextService = createDecorator<IDesignContextService>('designContextService');
```

---

## Agent Loop Implementation

### ReAct Loop Architecture

Combining online research ReAct pattern with GitHub Copilot's streaming and Void's checkpoint system:

```typescript
// src/vs/workbench/contrib/roopikAgent/common/reactLoop.ts

export interface IReActLoopStep {
    readonly type: 'reason' | 'act' | 'observe';
    readonly timestamp: Date;
    readonly data: any;
}

export class ReActLoopEngine extends Disposable {
    private readonly maxIterations = 10;
    private readonly _onDidStep = this._register(new Emitter<IReActLoopStep>());
    public readonly onDidStep = this._onDidStep.event;

    constructor(
        @IModelService private readonly modelService: IModelService,
        @IToolExecutionService private readonly toolExecutionService: IToolExecutionService,
        @ICheckpointService private readonly checkpointService: ICheckpointService,
        @ILogService private readonly logService: ILogService
    ) {
        super();
    }

    public async execute(
        request: IRoopikAgentRequest,
        context: ISessionContext,
        session: IRoopikAgentSession
    ): Promise<IRoopikAgentResponse> {

        const steps: IReActLoopStep[] = [];
        let iteration = 0;
        let isComplete = false;

        // Create checkpoint before starting
        const checkpointId = await this.checkpointService.createCheckpoint({
            sessionId: session.id,
            requestId: request.id,
            description: 'Before ReAct loop'
        });

        while (!isComplete && iteration < this.maxIterations) {
            iteration++;

            // 1. REASON: Generate reasoning and determine next action
            const reasonStep = await this.reason(request, context, steps);
            steps.push(reasonStep);
            this._onDidStep.fire(reasonStep);

            if (reasonStep.data.isComplete) {
                isComplete = true;
                break;
            }

            // 2. ACT: Execute the planned action (tool invocation)
            const actStep = await this.act(reasonStep.data.action, context, session);
            steps.push(actStep);
            this._onDidStep.fire(actStep);

            // Create checkpoint after action
            await this.checkpointService.createCheckpoint({
                sessionId: session.id,
                requestId: request.id,
                description: `After iteration ${iteration}: ${reasonStep.data.action.tool}`
            });

            // 3. OBSERVE: Collect results from action
            const observeStep = await this.observe(actStep.data.result);
            steps.push(observeStep);
            this._onDidStep.fire(observeStep);

            // Update context with observations
            context = this.updateContext(context, observeStep.data);
        }

        // Generate final response
        const finalResponse = await this.generateFinalResponse(steps, context);

        return finalResponse;
    }

    private async reason(
        request: IRoopikAgentRequest,
        context: ISessionContext,
        previousSteps: IReActLoopStep[]
    ): Promise<IReActLoopStep> {

        const prompt = this.buildReasoningPrompt(request, context, previousSteps);

        const response = await this.modelService.generateCompletion({
            model: 'claude-sonnet-4-5',
            messages: [{ role: 'user', content: prompt }],
            tools: this.getAvailableTools(),
            stream: false
        });

        // Parse reasoning output
        const reasoning = this.parseReasoning(response);

        return {
            type: 'reason',
            timestamp: new Date(),
            data: {
                thought: reasoning.thought,
                action: reasoning.action,
                isComplete: reasoning.isComplete
            }
        };
    }

    private async act(
        action: IPlannedAction,
        context: ISessionContext,
        session: IRoopikAgentSession
    ): Promise<IReActLoopStep> {

        // Check permission system
        const needsApproval = await this.needsApproval(action, session.mode);

        if (needsApproval) {
            // Wait for user approval
            const approved = await this.requestApproval(action, session);
            if (!approved) {
                throw new Error('Tool execution rejected by user');
            }
        }

        // Execute tool via MCP bridge
        const result = await this.toolExecutionService.executeTool({
            tool: action.tool,
            parameters: action.parameters,
            context
        });

        return {
            type: 'act',
            timestamp: new Date(),
            data: {
                action,
                result,
                approved: needsApproval ? true : 'auto'
            }
        };
    }

    private async observe(result: IToolExecutionResult): Promise<IReActLoopStep> {
        // Extract observations from tool result
        const observations = {
            success: result.success,
            output: result.output,
            error: result.error,
            metadata: result.metadata
        };

        return {
            type: 'observe',
            timestamp: new Date(),
            data: observations
        };
    }

    private buildReasoningPrompt(
        request: IRoopikAgentRequest,
        context: ISessionContext,
        previousSteps: IReActLoopStep[]
    ): string {

        let prompt = `You are RoopikAgent, an AI coding assistant for a designer-first IDE.

User Request: ${request.message}

Current Context:
${this.formatContext(context)}

Available Tools:
${this.formatTools()}
`;

        if (previousSteps.length > 0) {
            prompt += `\nPrevious Steps:\n`;
            for (const step of previousSteps) {
                prompt += `- ${step.type.toUpperCase()}: ${JSON.stringify(step.data)}\n`;
            }
        }

        prompt += `\nThink step by step:
1. What information do I need?
2. What action should I take?
3. Am I ready to provide a final answer?

Respond with:
- Thought: Your reasoning
- Action: The tool to use (or "answer" if ready to respond)
- Parameters: Tool parameters (if applicable)
`;

        return prompt;
    }
}
```

### Streaming Response Handling

Using Vercel AI SDK for modern streaming:

```typescript
// src/vs/workbench/contrib/roopikAgent/common/streaming.ts

import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export class StreamingResponseHandler extends Disposable {
    private readonly _onDidReceiveChunk = this._register(new Emitter<IResponseChunk>());
    public readonly onDidReceiveChunk = this._onDidReceiveChunk.event;

    constructor(
        @ILogService private readonly logService: ILogService
    ) {
        super();
    }

    public async streamResponse(
        messages: any[],
        tools: any[],
        onToolCall: (tool: any) => Promise<any>
    ): Promise<void> {

        const result = await streamText({
            model: anthropic('claude-sonnet-4-5-20250929'),
            messages,
            tools,
            maxSteps: 10, // Enable multi-step tool calling
            onFinish: async ({ usage, finishReason }) => {
                this.logService.info('[RoopikAgent] Stream finished', {
                    usage,
                    finishReason
                });
            }
        });

        // Stream text chunks
        for await (const chunk of result.textStream) {
            this._onDidReceiveChunk.fire({
                type: 'text',
                content: chunk
            });
        }

        // Handle tool calls
        for await (const toolCall of result.toolCalls) {
            const toolResult = await onToolCall(toolCall);
            this._onDidReceiveChunk.fire({
                type: 'tool',
                content: toolResult
            });
        }
    }
}
```

---

## Tool System Architecture

### MCP Integration

Using Model Context Protocol for extensible tool system:

```typescript
// src/vs/workbench/contrib/roopikAgent/common/mcpBridge.ts

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface IMCPTool {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: any;
    readonly category: 'code' | 'terminal' | 'design' | 'browser';
}

export class MCPBridgeService extends Disposable implements IMCPBridgeService {
    declare readonly _serviceBrand: undefined;

    private mcpServers = new Map<string, Client>();
    private availableTools = new Map<string, IMCPTool>();

    constructor(
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService
    ) {
        super();
        this.initialize();
    }

    private async initialize(): Promise<void> {
        // Load MCP server configurations
        const serverConfigs = this.configService.getValue<any>('roopikAgent.mcpServers');

        for (const [name, config] of Object.entries(serverConfigs)) {
            await this.connectToServer(name, config as any);
        }
    }

    private async connectToServer(name: string, config: any): Promise<void> {
        try {
            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args,
                env: config.env
            });

            const client = new Client({
                name: 'roopik-agent',
                version: '1.0.0'
            }, {
                capabilities: {
                    tools: {},
                    prompts: {},
                    resources: {}
                }
            });

            await client.connect(transport);
            this.mcpServers.set(name, client);

            // Load tools from server
            const tools = await client.listTools();
            for (const tool of tools.tools) {
                this.availableTools.set(`${name}:${tool.name}`, {
                    name: `${name}:${tool.name}`,
                    description: tool.description || '',
                    inputSchema: tool.inputSchema,
                    category: this.categorizeTool(tool.name)
                });
            }

            this.logService.info(`[RoopikAgent MCP] Connected to server: ${name}`);

        } catch (error) {
            this.logService.error(`[RoopikAgent MCP] Failed to connect to ${name}`, error);
        }
    }

    public async executeTool(toolName: string, args: any): Promise<any> {
        const [serverName, localToolName] = toolName.split(':');
        const client = this.mcpServers.get(serverName);

        if (!client) {
            throw new Error(`MCP server not found: ${serverName}`);
        }

        const result = await client.callTool({
            name: localToolName,
            arguments: args
        });

        return result;
    }

    public getAvailableTools(): IMCPTool[] {
        return Array.from(this.availableTools.values());
    }

    private categorizeTool(toolName: string): 'code' | 'terminal' | 'design' | 'browser' {
        if (toolName.includes('edit') || toolName.includes('search') || toolName.includes('read')) {
            return 'code';
        } else if (toolName.includes('terminal') || toolName.includes('command')) {
            return 'terminal';
        } else if (toolName.includes('canvas') || toolName.includes('design') || toolName.includes('visual')) {
            return 'design';
        } else if (toolName.includes('browser') || toolName.includes('preview')) {
            return 'browser';
        }
        return 'code';
    }
}
```

### Built-in Tool Definitions

```typescript
// src/vs/workbench/contrib/roopikAgent/common/builtinTools.ts

export const BUILTIN_TOOLS: IMCPTool[] = [
    {
        name: 'search_code',
        description: 'Search for code patterns using regex or keywords',
        category: 'code',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Search pattern (regex or keyword)' },
                fileGlob: { type: 'string', description: 'File glob pattern (e.g., "**/*.ts")' },
                caseSensitive: { type: 'boolean', description: 'Case sensitive search' }
            },
            required: ['pattern']
        }
    },
    {
        name: 'read_file',
        description: 'Read contents of a file',
        category: 'code',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path relative to workspace root' },
                startLine: { type: 'number', description: 'Start line (optional)' },
                endLine: { type: 'number', description: 'End line (optional)' }
            },
            required: ['path']
        }
    },
    {
        name: 'edit_file',
        description: 'Edit file using search/replace with diff preview',
        category: 'code',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path' },
                edits: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            search: { type: 'string', description: 'Code to search for' },
                            replace: { type: 'string', description: 'Code to replace with' }
                        },
                        required: ['search', 'replace']
                    }
                }
            },
            required: ['path', 'edits']
        }
    },
    {
        name: 'run_terminal_command',
        description: 'Execute a terminal command',
        category: 'terminal',
        inputSchema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'Command to execute' },
                cwd: { type: 'string', description: 'Working directory (optional)' }
            },
            required: ['command']
        }
    },
    {
        name: 'create_canvas_component',
        description: 'Create a design component on the canvas',
        category: 'design',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['button', 'input', 'card', 'layout'] },
                properties: { type: 'object', description: 'Component properties' },
                position: {
                    type: 'object',
                    properties: {
                        x: { type: 'number' },
                        y: { type: 'number' }
                    }
                }
            },
            required: ['type', 'properties']
        }
    },
    {
        name: 'open_browser_preview',
        description: 'Open URL in browser preview pane',
        category: 'browser',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to open' }
            },
            required: ['url']
        }
    }
];
```

### Tool Execution Service

```typescript
// src/vs/workbench/contrib/roopikAgent/common/toolExecution.ts

export interface IToolExecutionResult {
    readonly success: boolean;
    readonly output: any;
    readonly error?: string;
    readonly metadata?: any;
}

export class ToolExecutionService extends Disposable implements IToolExecutionService {
    declare readonly _serviceBrand: undefined;

    private readonly _onDidExecuteTool = this._register(new Emitter<IToolExecutionEvent>());
    public readonly onDidExecuteTool = this._onDidExecuteTool.event;

    constructor(
        @IMCPBridgeService private readonly mcpBridge: IMCPBridgeService,
        @IFileService private readonly fileService: IFileService,
        @ITerminalService private readonly terminalService: ITerminalService,
        @IDesignContextService private readonly designContext: IDesignContextService,
        @ILogService private readonly logService: ILogService
    ) {
        super();
    }

    public async executeTool(request: IToolExecutionRequest): Promise<IToolExecutionResult> {
        this.logService.info(`[RoopikAgent] Executing tool: ${request.tool}`);

        try {
            let result: any;

            // Check if built-in tool or MCP tool
            if (this.isBuiltinTool(request.tool)) {
                result = await this.executeBuiltinTool(request);
            } else {
                result = await this.mcpBridge.executeTool(request.tool, request.parameters);
            }

            const executionResult: IToolExecutionResult = {
                success: true,
                output: result,
                metadata: {
                    tool: request.tool,
                    executedAt: new Date()
                }
            };

            this._onDidExecuteTool.fire({
                tool: request.tool,
                result: executionResult
            });

            return executionResult;

        } catch (error) {
            this.logService.error(`[RoopikAgent] Tool execution failed: ${request.tool}`, error);

            return {
                success: false,
                output: null,
                error: String(error)
            };
        }
    }

    private async executeBuiltinTool(request: IToolExecutionRequest): Promise<any> {
        switch (request.tool) {
            case 'search_code':
                return this.searchCode(request.parameters);

            case 'read_file':
                return this.readFile(request.parameters);

            case 'edit_file':
                return this.editFile(request.parameters);

            case 'run_terminal_command':
                return this.runTerminalCommand(request.parameters);

            case 'create_canvas_component':
                return this.createCanvasComponent(request.parameters);

            case 'open_browser_preview':
                return this.openBrowserPreview(request.parameters);

            default:
                throw new Error(`Unknown built-in tool: ${request.tool}`);
        }
    }

    private async editFile(params: any): Promise<any> {
        // Use search/replace strategy from Void
        const { path, edits } = params;

        const uri = URI.file(path);
        const content = await this.fileService.readFile(uri);
        let updatedContent = content.value.toString();

        const diffParts: IDiffPart[] = [];

        for (const edit of edits) {
            const { search, replace } = edit;

            // Find search string
            const index = updatedContent.indexOf(search);
            if (index === -1) {
                throw new Error(`Search string not found in ${path}: ${search.substring(0, 50)}...`);
            }

            // Create diff part for preview
            diffParts.push({
                type: 'replace',
                original: search,
                updated: replace,
                lineNumber: this.getLineNumber(updatedContent, index)
            });

            // Apply replacement
            updatedContent = updatedContent.substring(0, index) + replace + updatedContent.substring(index + search.length);
        }

        // Write updated content
        await this.fileService.writeFile(uri, VSBuffer.fromString(updatedContent));

        return {
            success: true,
            path,
            edits: diffParts
        };
    }
}
```

---

## Multi-Agent Orchestration

### Git Worktree Management

Following online research pattern for parallel multi-agent execution:

```typescript
// src/vs/workbench/contrib/roopikAgent/common/multiAgentOrchestrator.ts

export interface ISubAgent {
    readonly id: string;
    readonly worktreePath: string;
    readonly task: string;
    readonly status: 'pending' | 'running' | 'completed' | 'failed';
}

export class MultiAgentOrchestrator extends Disposable implements IMultiAgentOrchestrator {
    declare readonly _serviceBrand: undefined;

    private subAgents = new Map<string, ISubAgent>();
    private readonly _onDidChangeAgentStatus = this._register(new Emitter<ISubAgent>());
    public readonly onDidChangeAgentStatus = this._onDidChangeAgentStatus.event;

    constructor(
        @IRoopikAgentService private readonly agentService: IRoopikAgentService,
        @IFileService private readonly fileService: IFileService,
        @ITerminalService private readonly terminalService: ITerminalService,
        @ILogService private readonly logService: ILogService
    ) {
        super();
    }

    /**
     * Spawn multiple sub-agents to work on tasks in parallel using git worktrees
     */
    public async spawnSubAgents(tasks: string[]): Promise<ISubAgent[]> {
        const subAgents: ISubAgent[] = [];

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            const agentId = `sub-agent-${Date.now()}-${i}`;
            const worktreePath = await this.createWorktree(agentId);

            const subAgent: ISubAgent = {
                id: agentId,
                worktreePath,
                task,
                status: 'pending'
            };

            this.subAgents.set(agentId, subAgent);
            subAgents.push(subAgent);
        }

        // Execute all sub-agents in parallel
        await Promise.all(subAgents.map(agent => this.executeSubAgent(agent)));

        return subAgents;
    }

    private async createWorktree(agentId: string): Promise<string> {
        const worktreePath = path.join(this.getWorkspaceRoot(), '.roopik', 'worktrees', agentId);

        // Create git worktree
        await this.executeGitCommand(`worktree add ${worktreePath} -b ${agentId}`);

        this.logService.info(`[RoopikAgent] Created worktree for ${agentId}: ${worktreePath}`);

        return worktreePath;
    }

    private async executeSubAgent(agent: ISubAgent): Promise<void> {
        try {
            agent.status = 'running';
            this._onDidChangeAgentStatus.fire(agent);

            // Create new agent session scoped to worktree
            const session = await this.agentService.createSession('agent');

            // Send task request
            await this.agentService.sendRequest(session.id, {
                id: generateUuid(),
                message: agent.task,
                attachments: [{
                    type: 'workspace',
                    uri: URI.file(agent.worktreePath)
                }]
            });

            agent.status = 'completed';
            this._onDidChangeAgentStatus.fire(agent);

        } catch (error) {
            this.logService.error(`[RoopikAgent] Sub-agent ${agent.id} failed`, error);
            agent.status = 'failed';
            this._onDidChangeAgentStatus.fire(agent);
        }
    }

    /**
     * Merge results from all sub-agents back to main branch
     */
    public async mergeSubAgents(agents: ISubAgent[]): Promise<void> {
        for (const agent of agents) {
            if (agent.status !== 'completed') {
                this.logService.warn(`[RoopikAgent] Skipping merge for failed agent: ${agent.id}`);
                continue;
            }

            try {
                // Merge worktree branch to main
                await this.executeGitCommand(`merge ${agent.id} --no-ff -m "Merge ${agent.id}: ${agent.task}"`);

                // Remove worktree
                await this.executeGitCommand(`worktree remove ${agent.worktreePath}`);

                this.logService.info(`[RoopikAgent] Merged and cleaned up ${agent.id}`);

            } catch (error) {
                this.logService.error(`[RoopikAgent] Failed to merge ${agent.id}`, error);
                throw error;
            }
        }
    }

    private async executeGitCommand(command: string): Promise<string> {
        // Execute git command via terminal service
        // Implementation details...
    }

    private getWorkspaceRoot(): string {
        // Get current workspace root
        // Implementation details...
    }
}
```

### Multi-Agent Use Cases

```typescript
// Example: Parallel feature implementation
async function implementFeatureWithSubAgents(
    featureRequest: string,
    orchestrator: IMultiAgentOrchestrator
): Promise<void> {

    // Break down feature into parallel tasks
    const tasks = [
        'Implement backend API endpoints for user authentication',
        'Create frontend components for login form',
        'Write unit tests for authentication service'
    ];

    // Spawn sub-agents
    const subAgents = await orchestrator.spawnSubAgents(tasks);

    // Wait for all to complete
    await new Promise<void>(resolve => {
        const checkCompletion = () => {
            const allComplete = subAgents.every(agent =>
                agent.status === 'completed' || agent.status === 'failed'
            );
            if (allComplete) {
                resolve();
            } else {
                setTimeout(checkCompletion, 1000);
            }
        };
        checkCompletion();
    });

    // Merge results
    await orchestrator.mergeSubAgents(subAgents);

    console.log('Feature implementation completed with sub-agents!');
}
```

---

## UI Architecture

### Chat Widget with Content Parts

Following GitHub Copilot Chat's content parts architecture:

```typescript
// src/vs/workbench/contrib/roopikAgent/browser/chatWidget.ts

export class RoopikAgentChatWidget extends Disposable {
    private container: HTMLElement;
    private messageList: HTMLElement;
    private inputArea: ChatInputArea;

    private readonly _onDidSubmit = this._register(new Emitter<string>());
    public readonly onDidSubmit = this._onDidSubmit.event;

    constructor(
        private readonly session: IRoopikAgentSession,
        @IRoopikAgentService private readonly agentService: IRoopikAgentService,
        @IInstantiationService private readonly instantiationService: IInstantiationService,
        @IThemeService private readonly themeService: IThemeService
    ) {
        super();
        this.container = document.createElement('div');
        this.container.className = 'roopik-agent-chat-widget';

        this.render();
        this.setupListeners();
    }

    private render(): void {
        // Message list
        this.messageList = document.createElement('div');
        this.messageList.className = 'message-list';
        this.container.appendChild(this.messageList);

        // Render existing messages
        for (const request of this.session.requests) {
            this.renderRequest(request);
        }

        // Input area
        this.inputArea = this.instantiationService.createInstance(ChatInputArea);
        this.container.appendChild(this.inputArea.domNode);
    }

    private renderRequest(request: IRoopikAgentRequest): void {
        // User message
        const userMessage = document.createElement('div');
        userMessage.className = 'user-message';
        userMessage.textContent = request.message;
        this.messageList.appendChild(userMessage);

        // Response (if available)
        if (request.response) {
            this.renderResponse(request.response);
        }
    }

    private renderResponse(response: IRoopikAgentResponse): void {
        const responseContainer = document.createElement('div');
        responseContainer.className = 'agent-response';

        // Render each content part
        for (const part of response.content) {
            const partElement = this.renderContentPart(part);
            responseContainer.appendChild(partElement);
        }

        // Render tool invocations
        if (response.toolInvocations.length > 0) {
            const toolsContainer = this.renderToolInvocations(response.toolInvocations);
            responseContainer.appendChild(toolsContainer);
        }

        this.messageList.appendChild(responseContainer);

        // Auto-scroll to bottom
        this.messageList.scrollTop = this.messageList.scrollHeight;
    }

    private renderContentPart(part: IContentPart): HTMLElement {
        const container = document.createElement('div');
        container.className = `content-part content-part-${part.type}`;

        switch (part.type) {
            case 'text':
                container.innerHTML = this.renderMarkdown(part.content);
                break;

            case 'code':
                container.appendChild(this.renderCodeBlock(part));
                break;

            case 'diff':
                container.appendChild(this.renderDiff(part));
                break;

            case 'image':
                container.appendChild(this.renderImage(part));
                break;

            case 'canvas':
                container.appendChild(this.renderCanvasPreview(part));
                break;
        }

        return container;
    }

    private renderToolInvocations(invocations: IToolInvocation[]): HTMLElement {
        const container = document.createElement('div');
        container.className = 'tool-invocations';

        for (const invocation of invocations) {
            const toolElement = this.renderToolInvocation(invocation);
            container.appendChild(toolElement);
        }

        return container;
    }

    private renderToolInvocation(invocation: IToolInvocation): HTMLElement {
        const container = document.createElement('div');
        container.className = `tool-invocation tool-invocation-${invocation.state}`;

        // Tool header
        const header = document.createElement('div');
        header.className = 'tool-header';

        const icon = document.createElement('span');
        icon.className = this.getToolIcon(invocation.tool);
        header.appendChild(icon);

        const name = document.createElement('span');
        name.textContent = invocation.tool;
        header.appendChild(name);

        const status = document.createElement('span');
        status.className = 'tool-status';
        status.textContent = this.getToolStatusText(invocation.state);
        header.appendChild(status);

        container.appendChild(header);

        // Tool parameters (collapsible)
        if (invocation.state === 'waitingForConfirmation') {
            const params = this.renderToolParameters(invocation);
            container.appendChild(params);

            // Approval buttons
            const actions = this.renderToolActions(invocation);
            container.appendChild(actions);
        }

        // Tool result (if completed)
        if (invocation.state === 'completed' && invocation.result) {
            const result = this.renderToolResult(invocation.result);
            container.appendChild(result);
        }

        return container;
    }

    private renderToolActions(invocation: IToolInvocation): HTMLElement {
        const container = document.createElement('div');
        container.className = 'tool-actions';

        const approveButton = document.createElement('button');
        approveButton.textContent = 'Approve';
        approveButton.className = 'approve-button';
        approveButton.onclick = () => {
            this.agentService.approveTool(this.session.id, invocation.id);
        };

        const rejectButton = document.createElement('button');
        rejectButton.textContent = 'Reject';
        rejectButton.className = 'reject-button';
        rejectButton.onclick = () => {
            this.agentService.rejectTool(this.session.id, invocation.id);
        };

        container.appendChild(approveButton);
        container.appendChild(rejectButton);

        return container;
    }

    private renderDiff(part: IContentPart): HTMLElement {
        // Render diff with syntax highlighting (similar to Void's streaming animation)
        const diffContainer = document.createElement('div');
        diffContainer.className = 'diff-container';

        // Use Monaco diff editor for rich diff visualization
        const diffEditor = this.instantiationService.createInstance(DiffEditor, diffContainer);

        diffEditor.setModel({
            original: part.original,
            modified: part.modified,
            language: part.language || 'typescript'
        });

        return diffContainer;
    }

    private setupListeners(): void {
        // Listen for new responses
        this._register(this.agentService.onDidReceiveResponse(response => {
            if (response.status === 'streaming') {
                this.updateStreamingResponse(response);
            } else {
                this.renderResponse(response);
            }
        }));

        // Handle input submission
        this._register(this.inputArea.onDidSubmit(message => {
            this._onDidSubmit.fire(message);
        }));
    }

    private updateStreamingResponse(response: IRoopikAgentResponse): void {
        // Progressive rendering for streaming responses
        // Implementation details...
    }
}
```

### Observable-Based Reactive UI

```typescript
// src/vs/workbench/contrib/roopikAgent/browser/chatViewModel.ts

export class RoopikAgentChatViewModel extends Disposable {
    // Observable state
    public readonly messages = observableValue<IChatMessage[]>('messages', []);
    public readonly isProcessing = observableValue<boolean>('isProcessing', false);
    public readonly currentToolInvocation = observableValue<IToolInvocation | undefined>('currentToolInvocation', undefined);

    // Derived observables
    public readonly hasMessages = derived(reader => {
        return this.messages.read(reader).length > 0;
    });

    public readonly canSendMessage = derived(reader => {
        return !this.isProcessing.read(reader);
    });

    constructor(
        private readonly session: IRoopikAgentSession,
        @IRoopikAgentService private readonly agentService: IRoopikAgentService
    ) {
        super();
        this.initialize();
    }

    private initialize(): void {
        // Sync observable state with service
        this._register(autorun(reader => {
            const serviceIsProcessing = this.agentService.isProcessing.read(reader);
            this.isProcessing.set(serviceIsProcessing, undefined);
        }));

        // Load messages from session
        this.loadMessages();
    }

    private loadMessages(): void {
        const messages = this.session.requests.flatMap(req => {
            const msgs: IChatMessage[] = [
                { role: 'user', content: req.message }
            ];
            if (req.response) {
                msgs.push({ role: 'assistant', content: req.response.content });
            }
            return msgs;
        });

        this.messages.set(messages, undefined);
    }

    public async sendMessage(message: string, attachments: IContextAttachment[] = []): Promise<void> {
        const request: IRoopikAgentRequest = {
            id: generateUuid(),
            message,
            attachments
        };

        await this.agentService.sendRequest(this.session.id, request);
    }
}
```

---

## Context Management

### Dynamic Context Building

Combining AST analysis, RAG embeddings, and search results:

```typescript
// src/vs/workbench/contrib/roopikAgent/common/contextService.ts

export interface ISessionContext {
    readonly workspace: IWorkspaceContext;
    readonly files: IFileContext[];
    readonly symbols: ISymbolContext[];
    readonly dependencies: IDependencyContext[];
    readonly design: IDesignContext;
    readonly history: IChatHistory[];
}

export class ContextService extends Disposable implements IContextService {
    declare readonly _serviceBrand: undefined;

    constructor(
        @IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
        @IFileService private readonly fileService: IFileService,
        @ILanguageService private readonly languageService: ILanguageService,
        @IDesignContextService private readonly designContext: IDesignContextService,
        @ISearchService private readonly searchService: ISearchService,
        @ILogService private readonly logService: ILogService
    ) {
        super();
    }

    public async buildContext(
        request: IRoopikAgentRequest,
        session: IRoopikAgentSession
    ): Promise<ISessionContext> {

        this.logService.info('[RoopikAgent] Building context for request');

        // 1. Workspace context
        const workspace = await this.buildWorkspaceContext();

        // 2. File context from attachments
        const files = await this.buildFileContext(request.attachments);

        // 3. Symbol context (AST analysis)
        const symbols = await this.buildSymbolContext(request.message, files);

        // 4. Dependency context
        const dependencies = await this.buildDependencyContext();

        // 5. Design context (canvas, screenshots)
        const design = await this.designContext.buildDesignContext();

        // 6. Chat history
        const history = this.buildHistoryContext(session);

        return {
            workspace,
            files,
            symbols,
            dependencies,
            design,
            history
        };
    }

    private async buildSymbolContext(
        query: string,
        files: IFileContext[]
    ): Promise<ISymbolContext[]> {

        const symbols: ISymbolContext[] = [];

        // Parse AST for each file
        for (const file of files) {
            const document = await this.languageService.getTextDocument(file.uri);
            if (!document) continue;

            // Get document symbols (functions, classes, variables)
            const documentSymbols = await this.languageService.provideDocumentSymbols(document);

            for (const symbol of documentSymbols) {
                symbols.push({
                    name: symbol.name,
                    kind: symbol.kind,
                    uri: file.uri,
                    range: symbol.range,
                    relevance: this.calculateRelevance(query, symbol.name)
                });
            }
        }

        // Sort by relevance and limit to top 50
        return symbols
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, 50);
    }

    private async buildWorkspaceContext(): Promise<IWorkspaceContext> {
        // Analyze workspace structure
        const workspaceFolders = this.workspaceService.getWorkspace().folders;
        const packageJsons = await this.findPackageJsons();
        const frameworkInfo = await this.detectFramework(packageJsons);

        return {
            folders: workspaceFolders,
            framework: frameworkInfo,
            languages: this.detectLanguages()
        };
    }

    private calculateRelevance(query: string, symbolName: string): number {
        // Simple relevance scoring (can be improved with embeddings)
        const queryLower = query.toLowerCase();
        const symbolLower = symbolName.toLowerCase();

        if (symbolLower === queryLower) return 1.0;
        if (symbolLower.includes(queryLower)) return 0.8;
        if (queryLower.includes(symbolLower)) return 0.6;

        // Levenshtein distance
        const distance = this.levenshteinDistance(queryLower, symbolLower);
        const maxLength = Math.max(queryLower.length, symbolLower.length);
        return 1.0 - (distance / maxLength);
    }
}
```

### RAG Integration

```typescript
// src/vs/workbench/contrib/roopikAgent/common/ragService.ts

import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

export class RAGService extends Disposable implements IRAGService {
    declare readonly _serviceBrand: undefined;

    private codebaseEmbeddings: Map<string, number[]> = new Map();

    constructor(
        @IFileService private readonly fileService: IFileService,
        @ILogService private readonly logService: ILogService
    ) {
        super();
    }

    /**
     * Index codebase by creating embeddings for all files
     */
    public async indexCodebase(workspaceRoot: URI): Promise<void> {
        this.logService.info('[RoopikAgent RAG] Indexing codebase...');

        // Find all code files
        const files = await this.findCodeFiles(workspaceRoot);

        // Create embeddings in batches
        const batchSize = 100;
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            await this.indexBatch(batch);
        }

        this.logService.info(`[RoopikAgent RAG] Indexed ${files.length} files`);
    }

    private async indexBatch(files: URI[]): Promise<void> {
        const contents = await Promise.all(
            files.map(uri => this.fileService.readFile(uri))
        );

        const texts = contents.map(content => content.value.toString());

        // Generate embeddings using Vercel AI SDK
        const { embeddings } = await embedMany({
            model: openai.embedding('text-embedding-3-small'),
            values: texts
        });

        // Store embeddings
        for (let i = 0; i < files.length; i++) {
            this.codebaseEmbeddings.set(files[i].toString(), embeddings[i]);
        }
    }

    /**
     * Find most relevant files for a query
     */
    public async findRelevantFiles(query: string, limit: number = 10): Promise<URI[]> {
        // Generate query embedding
        const { embedding: queryEmbedding } = await embed({
            model: openai.embedding('text-embedding-3-small'),
            value: query
        });

        // Calculate cosine similarity with all files
        const similarities: Array<{ uri: URI; similarity: number }> = [];

        for (const [uriString, fileEmbedding] of this.codebaseEmbeddings.entries()) {
            const similarity = this.cosineSimilarity(queryEmbedding, fileEmbedding);
            similarities.push({ uri: URI.parse(uriString), similarity });
        }

        // Sort by similarity and return top N
        return similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit)
            .map(item => item.uri);
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
        const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
        return dotProduct / (magnitudeA * magnitudeB);
    }
}
```

---

## Permission & Safety System

### Graduated Permission System

Combining online research Ask/Edit/Build modes with Void's auto-approve settings:

```typescript
// src/vs/workbench/contrib/roopikAgent/common/permissionService.ts

export type PermissionMode = 'ask' | 'gather' | 'edit' | 'agent' | 'build';

export interface IAutoApproveSettings {
    edits: boolean;
    terminal: boolean;
    mcpTools: boolean;
}

export class PermissionService extends Disposable implements IPermissionService {
    declare readonly _serviceBrand: undefined;

    private autoApproveSettings: IAutoApproveSettings = {
        edits: false,
        terminal: false,
        mcpTools: false
    };

    private readonly _onDidRequestApproval = this._register(new Emitter<IApprovalRequest>());
    public readonly onDidRequestApproval = this._onDidRequestApproval.event;

    constructor(
        @IConfigurationService private readonly configService: IConfigurationService,
        @INotificationService private readonly notificationService: INotificationService,
        @ILogService private readonly logService: ILogService
    ) {
        super();
        this.loadSettings();
    }

    private loadSettings(): void {
        const config = this.configService.getValue<any>('roopikAgent.autoApprove');
        if (config) {
            this.autoApproveSettings = {
                edits: config.edits ?? false,
                terminal: config.terminal ?? false,
                mcpTools: config.mcpTools ?? false
            };
        }
    }

    public async checkPermission(
        action: IToolExecutionRequest,
        mode: PermissionMode
    ): Promise<boolean> {

        // Ask mode: Always require approval
        if (mode === 'ask' || mode === 'gather') {
            return this.requestApproval(action);
        }

        // Edit mode: Auto-approve read-only tools, ask for writes
        if (mode === 'edit') {
            if (this.isReadOnlyTool(action.tool)) {
                return true;
            }
            if (action.tool === 'edit_file' && this.autoApproveSettings.edits) {
                return true;
            }
            return this.requestApproval(action);
        }

        // Agent mode: Auto-approve based on settings
        if (mode === 'agent') {
            if (this.shouldAutoApprove(action)) {
                return true;
            }
            return this.requestApproval(action);
        }

        // Build mode: Auto-approve everything (dangerous!)
        if (mode === 'build') {
            this.logService.warn('[RoopikAgent] Build mode: Auto-approving all tools');
            return true;
        }

        return false;
    }

    private shouldAutoApprove(action: IToolExecutionRequest): boolean {
        // Check auto-approve settings by tool category
        if (action.tool.includes('edit') && this.autoApproveSettings.edits) {
            return true;
        }

        if (action.tool.includes('terminal') && this.autoApproveSettings.terminal) {
            return true;
        }

        if (action.tool.startsWith('mcp:') && this.autoApproveSettings.mcpTools) {
            return true;
        }

        return this.isReadOnlyTool(action.tool);
    }

    private isReadOnlyTool(toolName: string): boolean {
        const readOnlyTools = [
            'search_code',
            'read_file',
            'list_files',
            'get_symbol',
            'analyze_dependencies'
        ];
        return readOnlyTools.includes(toolName);
    }

    private async requestApproval(action: IToolExecutionRequest): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            const request: IApprovalRequest = {
                id: generateUuid(),
                action,
                timestamp: new Date(),
                onApprove: () => resolve(true),
                onReject: () => resolve(false)
            };

            this._onDidRequestApproval.fire(request);

            // Show notification
            this.notificationService.prompt(
                Severity.Info,
                `RoopikAgent wants to ${action.tool}`,
                [
                    { label: 'Approve', run: request.onApprove },
                    { label: 'Reject', run: request.onReject }
                ],
                { sticky: true }
            );
        });
    }
}
```

### Security Sandbox

```typescript
// src/vs/workbench/contrib/roopikAgent/common/securitySandbox.ts

export class SecuritySandbox extends Disposable {

    /**
     * Validate tool parameters before execution
     */
    public validateToolParameters(tool: string, params: any): void {
        switch (tool) {
            case 'edit_file':
                this.validateFilePath(params.path);
                this.validateEdits(params.edits);
                break;

            case 'run_terminal_command':
                this.validateCommand(params.command);
                break;

            case 'read_file':
                this.validateFilePath(params.path);
                break;
        }
    }

    private validateFilePath(path: string): void {
        // Prevent path traversal attacks
        if (path.includes('..')) {
            throw new Error('Path traversal not allowed');
        }

        // Prevent access to sensitive files
        const blacklist = ['.env', '.git/config', 'id_rsa', '.ssh'];
        if (blacklist.some(blocked => path.includes(blocked))) {
            throw new Error('Access to sensitive files not allowed');
        }
    }

    private validateCommand(command: string): void {
        // Prevent dangerous commands
        const blacklist = ['rm -rf', 'del /f', 'format', 'shutdown'];
        if (blacklist.some(blocked => command.includes(blocked))) {
            throw new Error('Dangerous command not allowed');
        }

        // Warn on sudo/elevated commands
        if (command.startsWith('sudo')) {
            throw new Error('Elevated commands require manual execution');
        }
    }

    private validateEdits(edits: any[]): void {
        for (const edit of edits) {
            // Validate search string exists
            if (!edit.search || edit.search.trim().length === 0) {
                throw new Error('Empty search string not allowed');
            }

            // Validate replace string
            if (edit.replace === undefined) {
                throw new Error('Replace string required');
            }
        }
    }
}
```

---

## Designer-First Features

### Visual Context Understanding

Roopik-specific features that set it apart from code-only IDEs:

```typescript
// src/vs/workbench/contrib/roopikAgent/common/designContextService.ts

export interface IDesignContext {
    readonly canvasComponents: ICanvasComponent[];
    readonly screenshots: IScreenshot[];
    readonly figmaImports: IFigmaImport[];
    readonly colorPalette: IColorPalette;
    readonly typography: ITypography;
}

export class DesignContextService extends Disposable implements IDesignContextService {
    declare readonly _serviceBrand: undefined;

    constructor(
        @ICanvasService private readonly canvasService: ICanvasService,
        @IScreenshotService private readonly screenshotService: IScreenshotService,
        @IFigmaService private readonly figmaService: IFigmaService,
        @ILogService private readonly logService: ILogService
    ) {
        super();
    }

    public async buildDesignContext(): Promise<IDesignContext> {
        // Get canvas components
        const canvasComponents = await this.canvasService.getComponents();

        // Get recent screenshots
        const screenshots = await this.screenshotService.getRecentScreenshots();

        // Get Figma imports
        const figmaImports = await this.figmaService.getImports();

        // Extract design tokens
        const colorPalette = this.extractColorPalette(canvasComponents);
        const typography = this.extractTypography(canvasComponents);

        return {
            canvasComponents,
            screenshots,
            figmaImports,
            colorPalette,
            typography
        };
    }

    /**
     * Analyze screenshot and extract UI components using vision model
     */
    public async analyzeScreenshot(screenshot: IScreenshot): Promise<IUIAnalysis> {
        // Use Claude with vision to analyze screenshot
        const response = await this.modelService.generateCompletion({
            model: 'claude-sonnet-4-5',
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: screenshot.dataUrl },
                    { type: 'text', text: 'Analyze this UI screenshot and extract: 1) Components (buttons, inputs, cards), 2) Layout structure, 3) Color palette, 4) Typography' }
                ]
            }]
        });

        return this.parseUIAnalysis(response);
    }

    /**
     * Convert canvas component to code
     */
    public async componentToCode(
        component: ICanvasComponent,
        framework: 'react' | 'vue' | 'svelte'
    ): Promise<string> {

        const prompt = `Convert this design component to ${framework} code:

Component Type: ${component.type}
Properties:
${JSON.stringify(component.properties, null, 2)}

Style:
${JSON.stringify(component.style, null, 2)}

Generate clean, production-ready ${framework} code with proper TypeScript types.`;

        const response = await this.modelService.generateCompletion({
            model: 'claude-sonnet-4-5',
            messages: [{ role: 'user', content: prompt }]
        });

        return this.extractCode(response);
    }

    private extractColorPalette(components: ICanvasComponent[]): IColorPalette {
        const colors = new Set<string>();

        for (const component of components) {
            if (component.style.backgroundColor) {
                colors.add(component.style.backgroundColor);
            }
            if (component.style.color) {
                colors.add(component.style.color);
            }
        }

        return {
            primary: Array.from(colors),
            // Extract semantic colors (primary, secondary, accent, etc.)
        };
    }
}
```

### Canvas Tool Integration

```typescript
// src/vs/workbench/contrib/roopikAgent/common/canvasTools.ts

export const CANVAS_TOOLS: IMCPTool[] = [
    {
        name: 'create_component',
        description: 'Create a UI component on the design canvas',
        category: 'design',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['button', 'input', 'card', 'layout', 'navbar', 'footer'],
                    description: 'Component type'
                },
                properties: {
                    type: 'object',
                    description: 'Component properties (text, placeholder, etc.)'
                },
                style: {
                    type: 'object',
                    description: 'CSS style properties'
                },
                position: {
                    type: 'object',
                    properties: {
                        x: { type: 'number' },
                        y: { type: 'number' }
                    }
                }
            },
            required: ['type', 'properties']
        }
    },
    {
        name: 'modify_component',
        description: 'Modify existing component on canvas',
        category: 'design',
        inputSchema: {
            type: 'object',
            properties: {
                componentId: { type: 'string', description: 'Component ID' },
                updates: {
                    type: 'object',
                    description: 'Properties to update'
                }
            },
            required: ['componentId', 'updates']
        }
    },
    {
        name: 'export_to_code',
        description: 'Export canvas design to code (React/Vue/Svelte)',
        category: 'design',
        inputSchema: {
            type: 'object',
            properties: {
                framework: {
                    type: 'string',
                    enum: ['react', 'vue', 'svelte'],
                    description: 'Target framework'
                },
                componentIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Component IDs to export (empty = export all)'
                }
            },
            required: ['framework']
        }
    },
    {
        name: 'analyze_screenshot',
        description: 'Analyze screenshot and extract UI components',
        category: 'design',
        inputSchema: {
            type: 'object',
            properties: {
                screenshotPath: { type: 'string', description: 'Path to screenshot image' }
            },
            required: ['screenshotPath']
        }
    },
    {
        name: 'import_figma',
        description: 'Import design from Figma URL',
        category: 'design',
        inputSchema: {
            type: 'object',
            properties: {
                figmaUrl: { type: 'string', description: 'Figma file URL' },
                nodeIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Specific nodes to import (empty = import all)'
                }
            },
            required: ['figmaUrl']
        }
    }
];
```

---

## Technology Stack

### Core Technologies

| **Layer** | **Technology** | **Why** |
|-----------|----------------|---------|
| **AI Model** | Claude Sonnet 4.5 | Best-in-class coding (SOTA SWE-bench, HumanEval) |
| **Streaming** | Vercel AI SDK | Modern, type-safe streaming with tool calling |
| **IPC** | tRPC | Type-safe RPC, no manual Electron IPC |
| **Validation** | Zod | Runtime type validation for tool parameters |
| **State** | VSCode Observables | Reactive programming, efficient re-renders |
| **DI** | VSCode DI Container | Loose coupling, testability |
| **Tool Protocol** | MCP (Model Context Protocol) | Extensible tool system |
| **Embeddings** | OpenAI text-embedding-3-small | Fast, cheap embeddings for RAG |
| **Git** | Git Worktrees | Parallel multi-agent execution |
| **Testing** | VSCode Test Runner + Mocha | Comprehensive test coverage |
| **UI** | Content Parts Architecture | Extensible rendering (text, code, diff, canvas) |
| **Editing** | Search/Replace + Monaco Diff | Precise edits with visual preview |
| **Checkpoints** | Git + Metadata Store | Time-travel debugging |

### Package Dependencies

```json
{
  "dependencies": {
    "@ai-sdk/anthropic": "^1.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "@modelcontextprotocol/sdk": "^0.5.0",
    "@trpc/server": "^11.0.0",
    "@trpc/client": "^11.0.0",
    "ai": "^4.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.0",
    "@types/node": "^20.0.0",
    "@vscode/test-electron": "^2.4.0"
  }
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Goal**: Set up core architecture and services

- **Week 1-2: Service Layer**
  - [ ] Create service interfaces with dependency injection
  - [ ] Implement `RoopikAgentService` with observable state
  - [ ] Implement `ContextService` with AST analysis
  - [ ] Implement `PermissionService` with graduated modes
  - [ ] Set up tRPC for type-safe IPC

- **Week 3-4: Tool System**
  - [ ] Integrate MCP SDK
  - [ ] Implement `MCPBridgeService`
  - [ ] Create built-in tools (search, read, edit)
  - [ ] Implement `ToolExecutionService` with approval flow
  - [ ] Add security sandbox validation

**Deliverable**: Core services working, can execute simple tools with approval

### Phase 2: Agent Core (Weeks 5-8)

**Goal**: Implement ReAct loop and streaming

- **Week 5-6: ReAct Loop**
  - [ ] Implement `ReActLoopEngine`
  - [ ] Add reasoning step with Claude Sonnet 4.5
  - [ ] Add action execution with tool calling
  - [ ] Add observation collection
  - [ ] Integrate with checkpoint system

- **Week 7-8: Streaming & Response**
  - [ ] Integrate Vercel AI SDK for streaming
  - [ ] Implement `StreamingResponseHandler`
  - [ ] Add progressive UI rendering
  - [ ] Add multi-step tool calling support
  - [ ] Add prompt caching for cost optimization

**Deliverable**: Full ReAct loop working, streaming responses with tool execution

### Phase 3: UI Layer (Weeks 9-12)

**Goal**: Build chat widget with content parts

- **Week 9-10: Chat Widget**
  - [ ] Implement `RoopikAgentChatWidget`
  - [ ] Create content parts architecture
  - [ ] Add message list with streaming
  - [ ] Add input area with attachments
  - [ ] Integrate Monaco diff editor for code previews

- **Week 11-12: Tool Confirmation UI**
  - [ ] Create tool approval dialogs
  - [ ] Add diff visualization for edits
  - [ ] Add terminal command preview
  - [ ] Add auto-approve settings UI
  - [ ] Add checkpoint timeline UI

**Deliverable**: Full chat UI with tool confirmations and diff previews

### Phase 4: Designer Features (Weeks 13-16)

**Goal**: Integrate design canvas and visual context

- **Week 13-14: Design Context**
  - [ ] Implement `DesignContextService`
  - [ ] Add canvas component analysis
  - [ ] Add screenshot understanding with vision
  - [ ] Extract color palette and typography
  - [ ] Implement Figma import

- **Week 15-16: Canvas Tools**
  - [ ] Implement canvas tool execution
  - [ ] Add component creation on canvas
  - [ ] Add export to code (React/Vue/Svelte)
  - [ ] Add visual diff for design changes
  - [ ] Integrate with browser preview

**Deliverable**: Designer-first features working, can generate code from designs

### Phase 5: Multi-Agent System (Weeks 17-20)

**Goal**: Enable parallel task execution with git worktrees

- **Week 17-18: Orchestrator**
  - [ ] Implement `MultiAgentOrchestrator`
  - [ ] Add git worktree management
  - [ ] Add sub-agent spawning
  - [ ] Add parallel execution
  - [ ] Add result merging

- **Week 19-20: Advanced Features**
  - [ ] Add conflict resolution UI
  - [ ] Add multi-agent visualization
  - [ ] Add agent communication protocol
  - [ ] Add distributed task queue
  - [ ] Performance optimization

**Deliverable**: Multi-agent system working, can execute parallel tasks

### Phase 6: Context & RAG (Weeks 21-24)

**Goal**: Advanced context understanding with embeddings

- **Week 21-22: RAG System**
  - [ ] Implement `RAGService`
  - [ ] Add codebase indexing with embeddings
  - [ ] Add semantic search
  - [ ] Add relevance ranking
  - [ ] Optimize for large codebases (100k+ files)

- **Week 23-24: Smart Context**
  - [ ] Add dynamic context building
  - [ ] Add symbol graph analysis
  - [ ] Add dependency tracking
  - [ ] Add workspace understanding
  - [ ] Add context caching

**Deliverable**: Smart context system, finds relevant code automatically

### Phase 7: Polish & Testing (Weeks 25-28)

**Goal**: Production-ready quality

- **Week 25-26: Testing**
  - [ ] Unit tests for all services (80%+ coverage)
  - [ ] Integration tests for ReAct loop
  - [ ] UI tests for chat widget
  - [ ] End-to-end tests for full workflows
  - [ ] Performance benchmarks

- **Week 27-28: Polish**
  - [ ] Error handling and recovery
  - [ ] Logging and telemetry
  - [ ] Documentation
  - [ ] Performance optimization
  - [ ] Accessibility (ARIA, keyboard nav)

**Deliverable**: Production-ready RoopikAgent with comprehensive tests

### Phase 8: Advanced Features (Weeks 29-32)

**Goal**: Competitive differentiation

- **Week 29: Advanced Editing**
  - [ ] Semantic diff generation (two-model approach)
  - [ ] Batch edit operations
  - [ ] Undo/redo with checkpoints
  - [ ] Edit conflict resolution

- **Week 30: Advanced Tools**
  - [ ] Custom MCP server development
  - [ ] Browser automation tools
  - [ ] Database query tools
  - [ ] API testing tools

- **Week 31: Intelligence**
  - [ ] Long-term memory system
  - [ ] Learning from user feedback
  - [ ] Personalized suggestions
  - [ ] Code style adaptation

- **Week 32: Launch Prep**
  - [ ] Beta testing with designers
  - [ ] Performance optimization
  - [ ] Final bug fixes
  - [ ] Marketing materials

**Deliverable**: Feature-complete RoopikAgent ready for launch

---

## Comparison with Competitors

### RoopikAgent vs. Others

| **Feature** | **RoopikAgent** | **Cursor** | **GitHub Copilot** | **Windsurf** | **Void** |
|-------------|-----------------|------------|-------------------|--------------|----------|
| **Designer-First** | ✅ Canvas tools, visual context | ❌ | ❌ | ❌ | ❌ |
| **Multi-Agent** | ✅ Git worktrees | ✅ | ❌ | ✅ Flows | ❌ |
| **MCP Integration** | ✅ Native | ⚠️ Partial | ❌ | ✅ | ❌ |
| **Permission System** | ✅ 5 modes + auto-approve | ⚠️ Basic | ✅ Advanced | ✅ | ✅ |
| **Streaming** | ✅ Vercel AI SDK | ✅ Custom | ✅ | ✅ | ⚠️ Manual |
| **Tool Approval UI** | ✅ Diff preview | ✅ | ✅ | ✅ | ✅ |
| **Checkpoint System** | ✅ Git + metadata | ❌ | ❌ | ❌ | ✅ |
| **RAG** | ✅ Embeddings + AST | ✅ | ⚠️ Basic | ✅ | ❌ |
| **Code Quality** | ✅ Modular | ✅ | ⭐⭐⭐⭐⭐ | ✅ | ⚠️ Monolithic |
| **Testing** | ✅ Comprehensive | ✅ | ✅ | ✅ | ❌ |
| **Open Source** | ✅ | ❌ | ⚠️ Chat only | ❌ | ✅ (outdated) |
| **VSCode Native** | ✅ Extension | ❌ Fork | ✅ Extension | ❌ Fork | ❌ Fork |

### Unique Selling Points

**What makes RoopikAgent different?**

1. **Designer-First**: Only IDE with deep design tool integration (canvas, Figma, screenshots)
2. **Visual Context**: Understands UI screenshots and generates code from designs
3. **Component Export**: Convert canvas designs to React/Vue/Svelte code
4. **Production Architecture**: Uses GitHub Copilot's proven patterns, not custom implementations
5. **Modern Stack**: Vercel AI SDK, tRPC, Zod - not manual implementations
6. **True Extension**: No VSCode fork, fully portable and updatable
7. **MCP Native**: First-class MCP integration for extensibility
8. **Multi-Agent Ready**: Git worktree orchestration for parallel work

---

## Next Steps

### Immediate Actions

1. **Review & Approve Architecture**
   - Get stakeholder feedback on this design
   - Validate technology choices
   - Confirm timeline and priorities

2. **Set Up Development Environment**
   - Create feature branch `feature/roopik-agent`
   - Install dependencies (`@ai-sdk/anthropic`, `@modelcontextprotocol/sdk`, etc.)
   - Set up test infrastructure

3. **Start Phase 1: Foundation**
   - Begin with service interfaces
   - Implement dependency injection
   - Create basic tool execution

4. **Parallel Workstreams**
   - **Backend Team**: Service layer + ReAct loop
   - **Frontend Team**: Chat widget + content parts
   - **Design Team**: Canvas tool integration
   - **Research Team**: RAG and context optimization

### Success Metrics

**Week 8 (Phase 2 Complete)**:
- ✅ ReAct loop executing 10+ tool steps
- ✅ Streaming responses working
- ✅ Tool approval flow functional
- ✅ 50+ unit tests passing

**Week 16 (Phase 4 Complete)**:
- ✅ Full chat UI with diff previews
- ✅ Canvas integration working
- ✅ Screenshot to code working
- ✅ 200+ unit tests passing

**Week 24 (Phase 6 Complete)**:
- ✅ Multi-agent system functional
- ✅ RAG indexing 100k+ files
- ✅ Smart context building
- ✅ 500+ unit tests passing

**Week 32 (Launch)**:
- ✅ Beta with 100+ designers
- ✅ < 2s response time for 90% of requests
- ✅ 90%+ user satisfaction
- ✅ Production-ready quality

---

## Conclusion

RoopikAgent combines the best of three research sources:

1. **Industry Best Practices** (Online Research): ReAct loop, multi-agent, MCP, caching
2. **Production Patterns** (GitHub Copilot Chat): Service-oriented architecture, observables, DI
3. **Innovative Features** (Void): Tool approval, search/replace, checkpoints

**Key Design Decisions**:
- ✅ Use GitHub Copilot's architecture patterns (proven at scale)
- ✅ Adopt Void's innovative features (approval, checkpoints)
- ✅ Avoid Void's mistakes (no VSCode fork, no monoliths, comprehensive tests)
- ✅ Use modern tools (Vercel AI SDK, tRPC, Zod)
- ✅ Designer-first features (canvas, screenshots, Figma)
- ✅ Extensible via MCP protocol
- ✅ Safe with graduated permissions

**Timeline**: 32 weeks (8 months) to production-ready launch

**Competitive Advantage**: Only designer-first AI IDE with visual context understanding

---

**Let's build the future of AI-assisted design coding! 🚀**
