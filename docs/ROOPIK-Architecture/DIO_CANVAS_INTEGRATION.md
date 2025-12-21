# Dio ↔ Canvas Integration Architecture

> **Deterministic, Event-Driven, AI-Native Design**
>
> **Philosophy**: Minimal changes to backend, maximum flexibility for AI, seamless UX

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Storage Architecture](#storage-architecture)
3. [Chat Session Management](#chat-session-management)
4. [Component Creation Flow](#component-creation-flow)
5. [MCP Tools for Dio](#mcp-tools-for-dio)
6. [Context Passing Strategy](#context-passing-strategy)
7. [UI/UX Design](#uiux-design)
8. [Implementation Steps](#implementation-steps)

---

## Core Principles

### 1. One Chat Session Per Canvas
- Each canvas has its own isolated chat history
- Chat context = Canvas context
- No cross-contamination between canvases

### 2. AI-Friendly Component IDs
- AI generates human-readable component IDs (e.g., `LoginForm`, `Button_Primary`)
- Backend uses AI-provided ID if present, otherwise falls back to random generation
- AI always knows where it created files

### 3. Deterministic File Paths
- AI gets exact paths after creation
- All future operations use these paths
- No guessing, no searching

### 4. Event-Driven Updates
- Backend emits events after component creation/update
- Canvas UI subscribes and auto-updates
- Dio gets confirmation with full metadata

---

## Storage Architecture

### Canvas Folder Structure

```
.roopik/
├── canvases/
│   ├── canvases.json                    # Canvas registry
│   │   {
│   │     "canvases": [
│   │       { "id": "test", "name": "TEST", ... },
│   │       { "id": "dashboard", "name": "Dashboard", ... }
│   │     ]
│   │   }
│   │
│   ├── test/                            # Canvas: "test"
│   │   ├── canvas.json                  # Canvas metadata
│   │   ├── chat-history.json            # ✨ NEW: Chat for THIS canvas only
│   │   │   {
│   │   │     "canvasId": "test",
│   │   │     "messages": [
│   │   │       { "role": "user", "content": "Create login form" },
│   │   │       { "role": "assistant", "content": "Creating...", "toolCalls": [...] }
│   │   │     ],
│   │   │     "componentSnapshots": {
│   │   │       "LoginForm": "v1",
│   │   │       "Button_Primary": "v2"
│   │   │     }
│   │   │   }
│   │   │
│   │   └── components/
│   │       ├── index.json               # Component registry
│   │       │   {
│   │       │     "components": [
│   │       │       { "id": "LoginForm", "name": "LoginForm", "path": "LoginForm/LoginForm.tsx" },
│   │       │       { "id": "Button_Primary", "name": "Button Primary", "path": "Button_Primary/Button.tsx" }
│   │       │     ]
│   │       │   }
│   │       │
│   │       ├── LoginForm/               # ✨ AI-provided ID used as folder name
│   │       │   ├── meta.json
│   │       │   └── LoginForm.tsx
│   │       │
│   │       └── Button_Primary/          # ✨ AI-provided ID
│   │           ├── meta.json
│   │           └── Button.tsx
│   │
│   └── dashboard/                       # Canvas: "dashboard"
│       ├── canvas.json
│       ├── chat-history.json            # Separate chat session
│       └── components/
│           └── ...
```

---

## Chat Session Management

### Chat Session Lifecycle

```typescript
// Chat session structure
interface ChatSession {
  canvasId: string                           // Which canvas this chat belongs to
  canvasName: string                         // Human-readable canvas name
  messages: ChatMessage[]                    // Full conversation history
  componentSnapshots: Record<string, string> // Track component versions
  createdAt: number
  updatedAt: number
}

// Chat message structure
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  toolCalls?: ToolCall[]                     // Track what tools AI called
  componentContext?: {                       // What component was in focus
    id: string
    name: string
    code?: string                            // Snapshot of code at this point
  }
}
```

### Session Rules

1. **Load on Canvas Open:**
   ```typescript
   // When user opens canvas "test"
   const session = loadChatSession("test") || createChatSession("test")
   ```

2. **Save on Every Message:**
   ```typescript
   // After user sends message or AI responds
   saveChatSession(session)
   ```

3. **Clear Separation:**
   ```typescript
   // Canvas "test" chat NEVER sees canvas "dashboard" history
   // Each canvas = isolated conversation
   ```

---

## Component Creation Flow

### The Hybrid ID Strategy ✨

**Backend Logic (Minimal Change):**

```typescript
// In ComponentService.createComponent()
async createComponent(params: {
  canvasId: string
  componentId?: string        // ✨ NEW: AI can provide this
  componentName: string
  code: string
  dependencies?: Dependency[]
}) {
  // ✨ Use AI-provided ID if present, else generate random
  const id = params.componentId || generateRandomId()

  // Create folder: .roopik/canvases/{canvasId}/components/{id}/
  const componentPath = `.roopik/canvases/${params.canvasId}/components/${id}`

  // Save files
  await fs.mkdir(componentPath, { recursive: true })
  await fs.writeFile(`${componentPath}/${params.componentName}.tsx`, params.code)
  await fs.writeFile(`${componentPath}/meta.json`, JSON.stringify({
    id,
    name: params.componentName,
    createdAt: Date.now(),
    framework: "react"
  }))

  // Update index.json
  await updateComponentRegistry(params.canvasId, {
    id,
    name: params.componentName,
    path: `${id}/${params.componentName}.tsx`
  })

  // Emit event
  eventBus.emit('componentCreated', {
    canvasId: params.canvasId,
    componentId: id,
    componentName: params.componentName,
    path: componentPath
  })

  // ✨ Return full metadata to AI
  return {
    id,
    name: params.componentName,
    path: componentPath,
    filePath: `${componentPath}/${params.componentName}.tsx`
  }
}
```

### AI Prompt Strategy

```
You are Dio, creating components in Roopik IDE.

IMPORTANT: When creating components, you MUST:
1. Generate a unique, descriptive component ID
   - Use PascalCase, no spaces
   - Examples: "LoginForm", "Button_Primary", "Card_ProfileHeader"
   - Make it descriptive and unique within the canvas

2. Call create_component with this ID
   - The ID becomes the folder name
   - You'll get back the exact path
   - Use this path for all future operations

Example:
- Good IDs: "LoginForm", "HeroSection_Landing", "NavBar_Main"
- Bad IDs: "comp1", "abc", "thing"
```

---

## MCP Tools for Dio

### Tool Definitions

```typescript
// 1. Create Component
{
  name: "create_component",
  description: "Create a new headless React component in the active canvas",
  parameters: {
    type: "object",
    properties: {
      canvasId: {
        type: "string",
        description: "Canvas ID (automatically provided by context)"
      },
      componentId: {
        type: "string",
        description: "Unique component identifier (e.g., 'LoginForm', 'Button_Primary'). Must be PascalCase, descriptive, and unique within canvas."
      },
      componentName: {
        type: "string",
        description: "Human-readable component name (e.g., 'Login Form', 'Primary Button')"
      },
      code: {
        type: "string",
        description: "Complete React component code (.tsx format) with DEPENDENCIES manifest comment at top"
      },
      dependencies: {
        type: "array",
        description: "Array of dependency manifests for CDN loading",
        items: {
          type: "object",
          properties: {
            npm: { type: "string" },
            global: { type: "string" },
            url: { type: "string" }
          }
        }
      }
    },
    required: ["canvasId", "componentId", "componentName", "code"]
  }
}

// 2. Update Component
{
  name: "update_component",
  description: "Modify an existing component's source code",
  parameters: {
    type: "object",
    properties: {
      canvasId: {
        type: "string",
        description: "Canvas ID"
      },
      componentId: {
        type: "string",
        description: "Component ID (e.g., 'LoginForm')"
      },
      code: {
        type: "string",
        description: "Updated component code"
      }
    },
    required: ["canvasId", "componentId", "code"]
  }
}

// 3. Get Component Source
{
  name: "get_component_source",
  description: "Read a component's current source code",
  parameters: {
    type: "object",
    properties: {
      canvasId: { type: "string" },
      componentId: { type: "string" }
    },
    required: ["canvasId", "componentId"]
  }
}

// 4. List Canvas Components
{
  name: "list_canvas_components",
  description: "Get all components in a canvas",
  parameters: {
    type: "object",
    properties: {
      canvasId: {
        type: "string",
        description: "Canvas ID (optional, uses active canvas if not provided)"
      }
    }
  }
}

// 5. Get Canvas Info
{
  name: "get_canvas_info",
  description: "Get metadata about current or specific canvas",
  parameters: {
    type: "object",
    properties: {
      canvasId: {
        type: "string",
        description: "Canvas ID (optional, uses active canvas if not provided)"
      }
    }
  }
}

// 6. List All Canvases
{
  name: "list_canvases",
  description: "Get all available canvases in workspace",
  parameters: {
    type: "object",
    properties: {}
  }
}

// 7. Create Canvas
{
  name: "create_canvas",
  description: "Create a new canvas",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Canvas name (human-readable)"
      },
      canvasId: {
        type: "string",
        description: "Optional canvas ID (kebab-case). Auto-generated from name if not provided."
      }
    },
    required: ["name"]
  }
}
```

---

## Context Passing Strategy

### Initial Chat Context (When User Opens Chat)

```typescript
// Extension sends this to Dio when chat opens
interface DioContext {
  // Canvas info
  activeCanvas: {
    id: string                    // "test"
    name: string                  // "TEST"
    path: string                  // ".roopik/canvases/test"
    componentCount: number        // 2
  }

  // Selected component (if any)
  selectedComponent?: {
    id: string                    // "LoginForm"
    name: string                  // "Login Form"
    path: string                  // ".roopik/canvases/test/components/LoginForm/LoginForm.tsx"
    code?: string                 // Only include if user explicitly selected
  }

  // Available canvases
  allCanvases: Array<{
    id: string
    name: string
    componentCount: number
  }>

  // Previous chat history (loaded from chat-history.json)
  chatHistory: ChatMessage[]
}
```

### System Prompt Template

```typescript
function buildSystemPrompt(context: DioContext): string {
  const { activeCanvas, selectedComponent } = context

  return `
You are Dio, an AI agent for Roopik IDE - a design-to-code platform.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT WORKSPACE CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Active Canvas: "${activeCanvas.name}" (ID: ${activeCanvas.id})
📁 Storage Path: ${activeCanvas.path}
🧩 Components: ${activeCanvas.componentCount}

${selectedComponent ? `
🎯 SELECTED COMPONENT: "${selectedComponent.name}" (ID: ${selectedComponent.id})
📄 File: ${selectedComponent.path}

The user has this component selected. When they ask for changes,
they likely mean THIS component unless they specify otherwise.
` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPONENT CREATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When creating NEW components:

1. Generate a unique component ID:
   - PascalCase format
   - Descriptive and meaningful
   - Examples: "LoginForm", "Button_Primary", "Card_Profile"

2. Use the create_component tool:
   - canvasId: "${activeCanvas.id}"
   - componentId: <your generated ID>
   - componentName: <human-readable name>
   - code: <complete React component with DEPENDENCIES manifest>

3. I will return the exact file path - use it for future edits

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPONENT CODE FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALWAYS include dependency manifest at top:

// DEPENDENCIES: [
//   { "npm": "@mui/material", "global": "mui", "url": "https://unpkg.com/@mui/material@5.15.14/umd/material-ui.development.js" }
// ]

import React from 'react';
import { Button } from '@mui/material';

export default function LoginForm() {
  return <Button>Click Me</Button>;
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
}
```

---

## UI/UX Design

### Chat Panel Header

```
┌─────────────────────────────────────────────────────────────┐
│  💬 Chat with Dio                                      [×]  │
├─────────────────────────────────────────────────────────────┤
│  📋 Canvas: TEST ▼                                          │
│  🧩 3 components                                            │
│  🎯 Selected: LoginForm                  [View Component]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User: Create a button component                           │
│                                                             │
│  Dio: I'll create a Button component for you.              │
│       Creating Button_Primary...                           │
│       ✓ Created at: .roopik/canvases/test/components/...   │
│                                                             │
│  [Type a message...]                           [Send]      │
└─────────────────────────────────────────────────────────────┘
```

### Canvas Indicator (Always Visible)

- Show active canvas name in chat header
- Dropdown to switch canvas (creates new chat session)
- Show component count
- Highlight selected component (if any)

---

## Implementation Steps

### Phase 1: Foundation (Week 1)

- [ ] Add `chat-history.json` to canvas folder structure
- [ ] Implement chat session save/load logic
- [ ] Update `ComponentService.createComponent()` to accept optional `componentId`
- [ ] Add fallback: use AI ID if provided, else random

### Phase 2: Tool Integration (Week 1-2)

- [ ] Define 7 MCP tools (create, update, get, list, etc.)
- [ ] Implement tool handlers in Core
- [ ] Connect tools to ComponentService via IPC
- [ ] Test tool execution from Dio

### Phase 3: Context Passing (Week 2)

- [ ] Build `DioContext` structure
- [ ] Pass active canvas info when chat opens
- [ ] Pass selected component info if applicable
- [ ] Load previous chat history from file

### Phase 4: UI Polish (Week 2-3)

- [ ] Add canvas indicator to chat header
- [ ] Show selected component badge
- [ ] Add "View Component" quick action
- [ ] Add canvas switcher dropdown

### Phase 5: Testing & Refinement (Week 3)

- [ ] Test: Create component with AI-generated ID
- [ ] Test: Update existing component
- [ ] Test: Switch between canvases (chat session isolation)
- [ ] Test: Select component and ask for changes
- [ ] Test: Multi-turn conversation maintains context

---

## Success Criteria

✅ **AI always knows where it created files**
✅ **One chat session per canvas (no cross-talk)**
✅ **Minimal backend changes (just accept optional componentId)**
✅ **Deterministic file paths**
✅ **Event-driven UI updates**
✅ **Seamless UX (canvas indicator, component selection)**

---

**Last Updated:** 2024-01-21
**Status:** Architecture Approved ✅
**Next Step:** Implement Phase 1 (Foundation)
