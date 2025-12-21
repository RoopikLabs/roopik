# Roo Code (roopik-dio) - Chat Session Architecture Explained

> **Understanding how Roo Code manages chat sessions, context, and modes - for smart Dio integration**

---

## Table of Contents

1. [Storage Architecture](#storage-architecture)
2. [Task = Chat Session](#task--chat-session)
3. [How Tasks Are Created](#how-tasks-are-created)
4. [How Context Is Managed](#how-context-is-managed)
5. [Mode System](#mode-system)
6. [History & Task Switching](#history--task-switching)
7. [Smart Integration Strategy for Dio](#smart-integration-strategy-for-dio)

---

## Storage Architecture

### Where Everything Lives

```
VSCode Global Storage Path (configurable)
├── tasks/
│   ├── {taskId-1}/                    # Each task = separate folder
│   │   ├── ui_messages.json           # Chat messages (what user sees)
│   │   ├── api_conversation_history.json  # API messages (what AI sees)
│   │   └── task_metadata.json         # Task metadata (mode, status, etc.)
│   │
│   ├── {taskId-2}/
│   │   ├── ui_messages.json
│   │   ├── api_conversation_history.json
│   │   └── task_metadata.json
│   │
│   └── ...
│
├── settings/
│   └── mcp_settings.json
│
└── cache/
```

**Key Files**:
- **`ui_messages.json`**: Frontend chat messages (ClineMessage[])
- **`api_conversation_history.json`**: API messages (Anthropic.MessageParam[])
- **`task_metadata.json`**: Task metadata (HistoryItem)

**Storage Path Logic**:
```typescript
// From storage.ts
getTaskDirectoryPath(globalStoragePath, taskId)
→ {basePath}/tasks/{taskId}/

// Files:
GlobalFileNames = {
  apiConversationHistory: "api_conversation_history.json",
  uiMessages: "ui_messages.json",
  taskMetadata: "task_metadata.json"
}
```

---

## Task = Chat Session

### Core Concept

In Roo Code, **one Task = one chat session**.

```typescript
// From ClineProvider.ts
class ClineProvider {
  private clineStack: Task[] = []  // Stack of active tasks (usually 1)

  getCurrentTask(): Task | undefined {
    return this.clineStack[this.clineStack.length - 1]
  }
}
```

**Each Task contains**:
```typescript
class Task {
  taskId: string                     // Unique ID (UUID)
  clineMessages: ClineMessage[]      // UI chat history
  apiConversationHistory: MessageParam[]  // API history
  mode: string                       // Current mode (e.g., "code", "architect")
  status: TaskStatus                 // "active", "paused", "completed", etc.
  parentTask?: Task                  // For subtasks
  rootTask?: Task                    // For task trees
}
```

---

## How Tasks Are Created

### 1. User Sends Message → New Task Created

**Flow**:
```
User types in chat input
  ↓
WebView sends: { type: "newTask", text: "..." }
  ↓
ClineProvider.createTask(text)
  ↓
New Task instance created
  ↓
Task saved to storage: {globalStoragePath}/tasks/{taskId}/
  ↓
Chat UI updated
```

**Code**:
```typescript
// From ClineProvider.ts:2637
public async createTask(
  text?: string,
  images?: string[],
  parentTask?: Task,
  options: CreateTaskOptions = {},
  configuration: RooCodeSettings = {}
): Promise<Task> {
  // 1. Clear previous task (if any)
  await this.removeClineFromStack()

  // 2. Create new Task instance
  const task = new Task(
    {
      taskId: uuidv4(),  // New unique ID
      mode: this.currentMode,  // Current mode
      text,
      images,
      // ...
    },
    this  // ClineProvider reference
  )

  // 3. Add to stack
  await this.addClineToStack(task)

  // 4. Task auto-saves to storage (in Task class)

  return task
}
```

### 2. Task Auto-Saves After Every Message

**When messages are saved**:
- After user sends message
- After AI responds
- After tool execution
- After status changes

**Code**:
```typescript
// From taskMessages.ts
export async function saveTaskMessages({ messages, taskId, globalStoragePath }) {
  const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
  const filePath = path.join(taskDir, GlobalFileNames.uiMessages)
  await safeWriteJson(filePath, messages)
}
```

---

## How Context Is Managed

### Context Flow

```
User opens Roo Code extension
  ↓
ClineProvider loads last task (if exists)
  ↓
Task loads messages from storage
  ↓
Chat UI shows previous messages
  ↓
User continues conversation OR starts new task
```

### Loading Previous Task

**Code**:
```typescript
// From ClineProvider.ts:852
public async createTaskWithHistoryItem(
  historyItem: HistoryItem & { rootTask?: Task; parentTask?: Task }
) {
  // 1. Get task metadata
  const taskId = historyItem.id

  // 2. Load messages from storage
  const messages = await readTaskMessages({ taskId, globalStoragePath })
  const apiMessages = await readApiMessages({ taskId, globalStoragePath })

  // 3. Create Task with loaded data
  const task = new Task({
    taskId: historyItem.id,
    mode: historyItem.mode,
    initialMessages: messages,
    initialApiHistory: apiMessages,
    // ...
  })

  // 4. Add to stack
  await this.addClineToStack(task)

  return task
}
```

### What Gets Passed to AI

**Context sent to AI**:
```typescript
{
  // System prompt (mode-specific)
  system: getModeSystemPrompt(mode, customModes),

  // Full conversation history
  messages: task.apiConversationHistory,  // All previous messages

  // Available tools (mode-specific)
  tools: getModeTools(mode, customModes),

  // Current state
  // - Selected files
  // - Workspace info
  // - Git status
  // - etc.
}
```

---

## Mode System

### What Are Modes?

Modes are **specialized personas** that change:
- System prompt
- Available tools
- Behavior

**Default Modes**:
```typescript
// From @roo-code/types
DEFAULT_MODES = [
  {
    slug: "code",
    name: "Code",
    roleDefinition: "You are a coding assistant...",
    tools: ["read_file", "write_file", "execute_command", ...]
  },
  {
    slug: "architect",
    name: "Architect",
    roleDefinition: "You are a software architect...",
    tools: ["read_file", "list_files", ...]
  },
  // ... more modes
]
```

### Mode Switching

**User can switch mode mid-conversation**:
```typescript
// When mode changes:
await this.handleModeSwitch(newMode)
  ↓
// Task updates mode
task.mode = newMode
  ↓
// Task metadata saved
await task.updateTaskMetadata({ mode: newMode })
  ↓
// Next API call uses new mode's system prompt
```

**Stored in task metadata**:
```json
// task_metadata.json
{
  "id": "task-123",
  "mode": "architect",
  "status": "active",
  "ts": 1234567890
}
```

---

## History & Task Switching

### Task History UI

**How it works**:
1. User clicks "History" button
2. Extension loads all tasks from storage
3. UI shows list of previous tasks
4. User clicks task → loads that task

**Code**:
```typescript
// From HistoryView.tsx
const HistoryView = ({ onDone }) => {
  const { tasks, searchQuery, sortOption } = useTaskSearch()

  return (
    <div>
      {tasks.map(task => (
        <TaskItem
          task={task}
          onClick={() => openTask(task.id)}  // Load task by ID
        />
      ))}
    </div>
  )
}
```

### Loading Task by ID

**Flow**:
```
User clicks task in history
  ↓
WebView sends: { type: "showTaskWithId", text: taskId }
  ↓
ClineProvider.showTaskWithId(taskId)
  ↓
Load task metadata from storage
  ↓
createTaskWithHistoryItem(historyItem)
  ↓
Chat UI shows loaded task
```

**Code**:
```typescript
// From ClineProvider.ts:1587
async showTaskWithId(id: string) {
  if (id !== this.getCurrentTask()?.taskId) {
    // Load task from storage
    const { historyItem } = await this.getTaskWithId(id)

    // Clear current task and load new one
    await this.createTaskWithHistoryItem(historyItem)
  }

  // Focus chat input
  await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
}
```

---

## Smart Integration Strategy for Dio

### Current Roo Code Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   VSCode Extension                          │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ClineProvider (Main Controller)                    │    │
│  │ - Manages active task (current chat session)       │    │
│  │ - Creates/loads tasks                              │    │
│  │ - Handles mode switching                           │    │
│  │ - Saves to global storage                          │    │
│  └────────────────────────────────────────────────────┘    │
│                         │                                   │
│                         ↓                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Task Instance                                      │    │
│  │ - taskId: "uuid-123"                               │    │
│  │ - mode: "code"                                     │    │
│  │ - messages: ClineMessage[]                         │    │
│  │ - apiHistory: MessageParam[]                       │    │
│  └────────────────────────────────────────────────────┘    │
│                         │                                   │
│                         ↓                                   │
│           Saves to: globalStoragePath/tasks/{taskId}/       │
└─────────────────────────────────────────────────────────────┘
```

### Our Canvas Integration Challenge

**Problem**: We want **one chat per canvas**, but Roo Code manages tasks in **global storage**.

**Current Roo Code**:
- All tasks saved to: `~/.vscode/extensions/{ext}/globalStorage/tasks/`
- No concept of "canvas" or "workspace context"
- Tasks are flat, no hierarchy by workspace

**What We Want**:
- Per-canvas chat: `.roopik/canvases/{canvasId}/chat-history.json`
- Canvas-aware context
- Seamless integration with existing Roo Code features

---

## 🎯 Proposed Integration Strategy

### Option 1: **Hybrid Storage** (Recommended)

**Keep Roo Code's storage as-is, but add canvas metadata to task**

```typescript
// Task metadata includes canvas context
interface TaskMetadata {
  id: string
  mode: string
  status: string
  ts: number

  // ✨ NEW: Canvas context
  canvasContext?: {
    canvasId: string
    canvasName: string
    selectedComponentId?: string
  }
}
```

**Flow**:
```
User opens canvas "test" → clicks chat
  ↓
Extension checks: "Does active task have canvasContext.canvasId === 'test'?"
  ↓
IF YES: Continue current task
IF NO: Create new task with canvasContext = { canvasId: "test" }
  ↓
Chat session now tied to canvas
```

**Advantages**:
- ✅ Minimal changes to Roo Code
- ✅ All existing features work (history, mode switching, etc.)
- ✅ Canvas-aware without breaking storage
- ✅ Easy to filter tasks by canvas in history UI

**Changes Needed**:
1. Add `canvasContext` to task metadata
2. Modify `createTask()` to accept canvas context
3. Filter history by canvas (optional)

---

### Option 2: **Mirror Storage** (Future Enhancement)

**Keep Roo Code storage + duplicate to canvas folder**

```typescript
// After task saves to global storage:
await saveTaskMessages({ messages, taskId, globalStoragePath })

// ✨ ALSO save to canvas folder (if canvas context exists)
if (task.canvasContext) {
  const canvasChatPath = `.roopik/canvases/${task.canvasContext.canvasId}/chat-history.json`
  await fs.writeFile(canvasChatPath, JSON.stringify({
    canvasId: task.canvasContext.canvasId,
    taskId: task.taskId,
    messages: messages,
    componentSnapshots: { ... }
  }))
}
```

**Advantages**:
- ✅ Canvas folder is self-contained (includes chat)
- ✅ Roo Code features still work
- ✅ Can export canvas with chat history

**Disadvantages**:
- ⚠️ Data duplication
- ⚠️ Need to keep in sync

---

### Option 3: **Custom Storage Path** (Cleanest, but more work)

**Use Roo Code's `customStoragePath` feature**

```typescript
// When user opens canvas:
await vscode.workspace.getConfiguration("roopik-dio")
  .update("customStoragePath", workspaceRoot + "/.roopik/canvases/{canvasId}/dio-tasks")

// Now all tasks save to canvas folder!
```

**Advantages**:
- ✅ True per-canvas storage
- ✅ No data duplication
- ✅ Canvas folder is complete

**Disadvantages**:
- ⚠️ Switching canvases = changing storage path (complex)
- ⚠️ Global history won't show all canvases
- ⚠️ More testing needed

---

## 🚀 Recommended Approach: Option 1 (Hybrid Storage)

### Implementation Plan

**Phase 1: Add Canvas Context to Tasks**

```typescript
// 1. Extend task metadata
interface TaskMetadata {
  // ... existing fields
  canvasContext?: {
    canvasId: string
    canvasName: string
    selectedComponentId?: string
  }
}

// 2. Modify createTask
public async createTask(
  text?: string,
  images?: string[],
  canvasContext?: { canvasId: string, canvasName: string }  // ✨ NEW
): Promise<Task> {
  const task = new Task({
    taskId: uuidv4(),
    mode: this.currentMode,
    text,
    images,
    canvasContext  // ✨ Pass to task
  })

  await this.addClineToStack(task)
  return task
}

// 3. Save canvas context to metadata
await task.updateTaskMetadata({
  canvasContext: {
    canvasId: "test",
    canvasName: "TEST",
    selectedComponentId: "LoginForm"
  }
})
```

**Phase 2: Canvas-Aware Task Management**

```typescript
// When user opens canvas chat:
export async function openCanvasChat(canvasId: string, canvasName: string) {
  const currentTask = provider.getCurrentTask()

  // Check if current task is for this canvas
  if (currentTask?.canvasContext?.canvasId === canvasId) {
    // Continue existing task
    await provider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
  } else {
    // Find or create task for this canvas
    const existingTask = await findTaskByCanvasId(canvasId)

    if (existingTask) {
      // Load existing task
      await provider.showTaskWithId(existingTask.id)
    } else {
      // Create new task
      await provider.createTask(undefined, undefined, { canvasId, canvasName })
    }
  }
}
```

**Phase 3: Filter History by Canvas** (Optional)

```typescript
// In HistoryView.tsx
const canvasId = getActiveCanvasId()

const filteredTasks = tasks.filter(task =>
  showAllCanvases || task.canvasContext?.canvasId === canvasId
)
```

---

## Summary: How to Use Roo Code for Canvas Integration

### ✅ What Works Out of the Box

1. **Task Management**: Each canvas can have dedicated task(s)
2. **Mode System**: Use modes for different personas (e.g., "designer" mode)
3. **Message Persistence**: Auto-saves after every interaction
4. **History**: All tasks accessible from history UI
5. **Tool Calling**: MCP tools ready to use

### 🔧 What We Need to Add

1. **Canvas Context**: Add `canvasContext` field to task metadata
2. **Canvas-Aware Creation**: Pass canvas info when creating tasks
3. **Smart Task Loading**: Load/create task based on active canvas
4. **(Optional) History Filtering**: Filter by canvas in history UI

### 🎯 Next Steps

1. **Test Current Setup**: Open extension, create task, see where it saves
2. **Add Canvas Context**: Modify task metadata to include canvas info
3. **Implement Canvas Chat Opener**: Smart logic to load/create canvas-specific task
4. **Test Integration**: Ensure chat works from canvas panel

---

**Last Updated**: 2024-01-21
**Status**: Architecture Documented ✅
**Next**: Implement Option 1 (Hybrid Storage)
