# RoopikAgent Implementation Plan

**Goal**: Fork GitHub Copilot Chat → RoopikAgent (side-by-side, toggle-able)

**Strategy**: Minimal changes to allow both to coexist, easy to sync future VSCode updates

---

## Phase 1: Understanding Integration Points (Week 1)

### Step 1: Find All Chat Entry Points

**Chat has 4 main entry points**:

1. **Secondary Sidebar (Right Panel)** - `Ctrl+Alt+I` or title bar icon
2. **Panel (Bottom)** - Can be moved to panel
3. **Quick Chat** - Floating quick chat
4. **Inline Chat** - `Ctrl+K` in editor

**Key Files Found**:
```
src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsView.ts:369
→ Registers view container: AGENT_SESSIONS_VIEW_CONTAINER_ID
→ Location: ViewContainerLocation.AuxiliaryBar (right sidebar)
→ Icon: chatAgentsIcon (Codicon.commentDiscussionSparkle)
```

**What to Search**:
```bash
# Find view registration
AGENT_SESSIONS_VIEW_CONTAINER_ID
AGENT_SESSIONS_VIEW_ID

# Find command registrations
Ctrl+Alt+I → 'workbench.action.chat.open'
Ctrl+K → 'inlineChat.start'

# Find title bar icon
ChatStatusBarEntry
```

### Step 2: Map Integration Architecture

**Current Chat Architecture**:
```
chat.contribution.ts (main entry)
  ├─ Registers services (singletons)
  ├─ Registers views (sidebar panel)
  ├─ Registers commands (Ctrl+Alt+I, etc.)
  ├─ Registers editors (chat editor)
  └─ Registers configurations

agentSessionsView.ts
  ├─ registerViewContainer() → Creates sidebar icon
  └─ registerViews() → Adds view to container

Actions (commands)
  ├─ chatActions.ts → ModeOpenChatGlobalAction
  ├─ chatQuickInputActions.ts → Quick chat
  └─ chatExecuteActions.ts → Submit, execute
```

**What You Need to Copy**:
1. View container registration
2. View registration
3. Command registration
4. Service registration
5. Context keys

---

## Phase 2: Create RoopikAgent Structure (Week 1-2)

### Directory Structure

```
src/vs/workbench/contrib/roopikAgent/
├── common/
│   ├── roopikAgentService.ts           ← Main service (copy from chatServiceImpl.ts)
│   ├── roopikAgentContextKeys.ts       ← Context keys (copy from chatContextKeys.ts)
│   ├── constants.ts                     ← Constants (ROOPIK_VIEW_ID, etc.)
│   │
│   └── llm/                             ← Model abstraction (NEW!)
│       ├── types.ts                     ← Provider interfaces
│       ├── modelService.ts              ← Model service
│       └── providers/
│           ├── anthropicProvider.ts
│           ├── openaiProvider.ts
│           └── googleProvider.ts
│
└── browser/
    ├── roopikAgent.contribution.ts      ← Main contribution (copy from chat.contribution.ts)
    ├── roopikAgentView.ts               ← View (copy from agentSessionsView.ts)
    ├── roopikAgentWidget.ts             ← Chat widget (copy from chatWidget.ts)
    │
    └── actions/
        ├── roopikAgentActions.ts        ← Commands (copy from chatActions.ts)
        └── roopikAgentQuickActions.ts   ← Quick chat (copy from chatQuickInputActions.ts)
```

### Step-by-Step Copying

**A. Create Base Structure**

```typescript
// src/vs/workbench/contrib/roopikAgent/common/constants.ts

export const ROOPIK_AGENT_VIEW_CONTAINER_ID = 'workbench.view.roopikAgent';
export const ROOPIK_AGENT_VIEW_ID = 'workbench.view.roopikAgent.view';

export namespace RoopikAgentConfiguration {
    export const AgentViewLocation = 'roopikAgent.agentViewLocation';
    export const FontSize = 'roopikAgent.fontSize';
}
```

**B. Copy View Registration**

```typescript
// src/vs/workbench/contrib/roopikAgent/browser/roopikAgentView.ts

// Copy from: agentSessionsView.ts:369

import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewExtensions, ViewContainerLocation } from '../../../common/views.js';
import { ROOPIK_AGENT_VIEW_CONTAINER_ID, ROOPIK_AGENT_VIEW_ID } from '../common/constants.js';

// Register custom icon
const roopikAgentIcon = registerIcon('roopik-agent-icon', Codicon.sparkle, 'Icon for RoopikAgent View');

const ROOPIK_AGENT_VIEW_TITLE = localize2('roopikAgent.view.label', "RoopikAgent");

// Register view container (sidebar icon)
const roopikAgentViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
    id: ROOPIK_AGENT_VIEW_CONTAINER_ID,
    title: ROOPIK_AGENT_VIEW_TITLE,
    icon: roopikAgentIcon,                    // ← Custom icon
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ROOPIK_AGENT_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
    storageId: ROOPIK_AGENT_VIEW_CONTAINER_ID,
    hideIfEmpty: true,
    order: 7,                                  // ← After Chat (which is order: 6)
}, ViewContainerLocation.AuxiliaryBar);       // ← Right sidebar

// Register view descriptor
const roopikAgentViewDescriptor: IViewDescriptor = {
    id: ROOPIK_AGENT_VIEW_ID,
    containerIcon: roopikAgentIcon,
    containerTitle: ROOPIK_AGENT_VIEW_TITLE.value,
    singleViewPaneContainerTitle: ROOPIK_AGENT_VIEW_TITLE.value,
    name: ROOPIK_AGENT_VIEW_TITLE,
    canToggleVisibility: false,
    canMoveView: true,
    ctorDescriptor: new SyncDescriptor(RoopikAgentView),  // ← Your view class
    when: ContextKeyExpr.and(
        RoopikAgentContextKeys.Setup.enabled,              // ← Only show when enabled
    )
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([roopikAgentViewDescriptor], roopikAgentViewContainer);
```

**C. Copy Service Registration**

```typescript
// src/vs/workbench/contrib/roopikAgent/browser/roopikAgent.contribution.ts

// Copy singleton registrations from chat.contribution.ts

import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IRoopikAgentService } from '../common/roopikAgentService.js';
import { RoopikAgentService } from '../common/roopikAgentServiceImpl.js';

// Register services
registerSingleton(IRoopikAgentService, RoopikAgentService, InstantiationType.Delayed);
```

**D. Copy Command Registration**

```typescript
// src/vs/workbench/contrib/roopikAgent/browser/actions/roopikAgentActions.ts

// Copy from: chatActions.ts → ModeOpenChatGlobalAction

export const ACTION_ID_OPEN_ROOPIK_AGENT = 'workbench.action.roopikAgent.open';

registerAction2(class OpenRoopikAgentAction extends Action2 {
    constructor() {
        super({
            id: ACTION_ID_OPEN_ROOPIK_AGENT,
            title: localize2('openRoopikAgent', "Open RoopikAgent"),
            category: CHAT_CATEGORY,
            f1: true,
            keybinding: {
                primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyR,  // ← Ctrl+Alt+R (different from Chat's Ctrl+Alt+I)
                weight: KeybindingWeight.WorkbenchContrib
            }
        });
    }

    async run(accessor: ServicesAccessor) {
        const viewsService = accessor.get(IViewsService);
        await viewsService.openView(ROOPIK_AGENT_VIEW_ID, true);
    }
});
```

---

## Phase 3: Make It Toggle-able (Week 2)

### Context Keys for Enable/Disable

```typescript
// src/vs/workbench/contrib/roopikAgent/common/roopikAgentContextKeys.ts

export namespace RoopikAgentContextKeys {
    export namespace Setup {
        export const enabled = new RawContextKey<boolean>('roopikAgent.enabled', false, {
            type: 'boolean',
            description: localize('roopikAgent.enabled', "Whether RoopikAgent is enabled")
        });
    }
}
```

### Configuration Setting

```typescript
// In roopikAgent.contribution.ts

configurationRegistry.registerConfiguration({
    id: 'roopikAgent',
    title: 'RoopikAgent',
    type: 'object',
    properties: {
        'roopikAgent.enabled': {
            type: 'boolean',
            default: false,  // ← Disabled by default, user must enable
            description: 'Enable RoopikAgent (requires reload)',
            scope: ConfigurationScope.APPLICATION
        }
    }
});
```

### Why This Works

**Both can coexist**:
- Chat: Uses `AGENT_SESSIONS_VIEW_CONTAINER_ID`
- RoopikAgent: Uses `ROOPIK_AGENT_VIEW_CONTAINER_ID` (different ID!)

**Different shortcuts**:
- Chat: `Ctrl+Alt+I`
- RoopikAgent: `Ctrl+Alt+R`

**Different icons in sidebar**:
- Chat: `Codicon.commentDiscussionSparkle` (order: 6)
- RoopikAgent: `Codicon.sparkle` (order: 7)

**User can toggle**:
```json
// settings.json
{
    "roopikAgent.enabled": true  // ← Enable RoopikAgent
}
```

---

## Phase 4: Minimal Functionality (Week 2-3)

### Goal: Get It Running (Even if Basic)

**Implement bare minimum**:

1. ✅ View shows up in right sidebar
2. ✅ `Ctrl+Alt+R` opens it
3. ✅ Simple text input box
4. ✅ Simple message list
5. ✅ Hardcoded response: "RoopikAgent is working!"

**What to Copy**:
- `ChatWidget` → `RoopikAgentWidget` (simplified)
- Just input + message rendering
- No tool calling yet
- No model integration yet

**Code**:

```typescript
// src/vs/workbench/contrib/roopikAgent/browser/roopikAgentWidget.ts

export class RoopikAgentWidget extends Disposable {
    private container: HTMLElement;
    private messageList: HTMLElement;
    private inputBox: HTMLInputElement;

    constructor(
        parent: HTMLElement,
        @IInstantiationService private readonly instantiationService: IInstantiationService
    ) {
        super();
        this.container = document.createElement('div');
        this.container.className = 'roopik-agent-widget';
        parent.appendChild(this.container);

        this.render();
    }

    private render(): void {
        // Message list
        this.messageList = document.createElement('div');
        this.messageList.className = 'message-list';
        this.container.appendChild(this.messageList);

        // Input box
        this.inputBox = document.createElement('input');
        this.inputBox.className = 'chat-input';
        this.inputBox.placeholder = 'Ask RoopikAgent...';
        this.inputBox.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.handleSubmit();
            }
        });
        this.container.appendChild(this.inputBox);
    }

    private handleSubmit(): void {
        const message = this.inputBox.value;
        if (!message.trim()) return;

        // Add user message
        this.addMessage('user', message);

        // Clear input
        this.inputBox.value = '';

        // Add agent response (hardcoded for now)
        setTimeout(() => {
            this.addMessage('assistant', 'RoopikAgent is working! You said: ' + message);
        }, 500);
    }

    private addMessage(role: 'user' | 'assistant', content: string): void {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${role}`;
        messageDiv.textContent = content;
        this.messageList.appendChild(messageDiv);

        // Auto-scroll
        this.messageList.scrollTop = this.messageList.scrollHeight;
    }
}
```

**View Integration**:

```typescript
// src/vs/workbench/contrib/roopikAgent/browser/roopikAgentView.ts

export class RoopikAgentView extends ViewPane {
    private widget?: RoopikAgentWidget;

    protected override renderBody(container: HTMLElement): void {
        super.renderBody(container);

        this.widget = this.instantiationService.createInstance(RoopikAgentWidget, container);
    }
}
```

---

## Phase 5: Add Model Integration (Week 3-4)

### Once Basic UI Works

**Then add**:
1. LLM Service registration
2. Anthropic provider
3. Real streaming responses
4. Replace hardcoded response with API call

**Code**:

```typescript
// In RoopikAgentWidget.handleSubmit()

private async handleSubmit(): Promise<void> {
    const message = this.inputBox.value;
    if (!message.trim()) return;

    this.addMessage('user', message);
    this.inputBox.value = '';

    // Add loading indicator
    const loadingDiv = this.addMessage('assistant', 'Thinking...');

    try {
        // Call LLM service
        const llmService = this.instantiationService.invokeFunction(accessor => accessor.get(ILLMService));

        const messages = [{ role: 'user', content: message }];
        const stream = llmService.chat(messages);

        let fullResponse = '';
        for await (const chunk of stream) {
            if (chunk.type === 'text') {
                fullResponse += chunk.content;
                this.updateMessage(loadingDiv, fullResponse);
            }
        }

    } catch (error) {
        this.updateMessage(loadingDiv, `Error: ${error.message}`);
    }
}
```

---

## Phase 6: Copy Advanced Features (Week 4+)

**Once core works, add**:
- Tool calling (copy from Chat's tool system)
- MCP integration
- File attachments
- Code blocks with syntax highlighting
- Diff rendering
- Session persistence

**Strategy**: Copy incrementally, one feature at a time, from Chat

---

## Summary: Initial Plan

### Week 1: Discovery
- ✅ **Find integration points** (view registration, commands, services)
- ✅ **Map architecture** (how Chat integrates with VSCode)
- ✅ **Understand entry points** (sidebar, panel, quick chat, inline)

### Week 2: Basic Structure
- ✅ **Create directory structure** (`roopikAgent/common/`, `roopikAgent/browser/`)
- ✅ **Copy view registration** (sidebar icon, view descriptor)
- ✅ **Copy service registration** (singleton services)
- ✅ **Copy command registration** (Ctrl+Alt+R)
- ✅ **Make it toggle-able** (config setting, context keys)

### Week 3: Minimal Functionality
- ✅ **Implement basic widget** (input box, message list)
- ✅ **Hardcoded responses** (just to test UI works)
- ✅ **Verify it opens** (Ctrl+Alt+R, sidebar icon)
- ✅ **Test coexistence** (both Chat and RoopikAgent work)

### Week 4: Model Integration
- ✅ **Add LLM service** (model abstraction)
- ✅ **Implement Anthropic provider** (official SDK)
- ✅ **Real streaming** (replace hardcoded response)
- ✅ **Test with Claude Sonnet 4.5**

### Week 5+: Advanced Features
- ✅ **Tool calling** (copy from Chat)
- ✅ **MCP integration** (copy from Chat)
- ✅ **File attachments, code blocks, diff rendering**
- ✅ **Session persistence**

---

## Commands to Run

### Find Integration Points

```bash
# Find view registrations
grep -r "registerViewContainer" src/vs/workbench/contrib/chat

# Find command registrations
grep -r "registerAction2" src/vs/workbench/contrib/chat/browser/actions

# Find service registrations
grep -r "registerSingleton" src/vs/workbench/contrib/chat

# Find keybindings
grep -r "Ctrl.*Alt.*I\|KeyMod" src/vs/workbench/contrib/chat
```

### Create Files

```bash
# Create directory structure
mkdir -p src/vs/workbench/contrib/roopikAgent/common/llm/providers
mkdir -p src/vs/workbench/contrib/roopikAgent/browser/actions

# Copy base files
cp src/vs/workbench/contrib/chat/browser/agentSessionsView.ts \
   src/vs/workbench/contrib/roopikAgent/browser/roopikAgentView.ts

# Then modify IDs, names, etc.
```

---

## Key Decisions

### ✅ DO
1. **Copy Chat's structure** (proven, production-tested)
2. **Use different IDs** (ROOPIK_AGENT_VIEW_ID vs AGENT_SESSIONS_VIEW_ID)
3. **Different shortcuts** (Ctrl+Alt+R vs Ctrl+Alt+I)
4. **Make it toggle-able** (disabled by default)
5. **Minimal changes first** (get it running, then iterate)

### ❌ DON'T
1. **Don't modify Chat code** (keep it untouched, easy to merge VSCode updates)
2. **Don't remove Chat** (coexist side-by-side)
3. **Don't build from scratch** (copy proven patterns)
4. **Don't add complexity early** (hardcoded responses first, then model integration)

---

## Next Step

**Start with discovery**:

```bash
# Find where Chat view is registered
grep -r "AGENT_SESSIONS_VIEW_CONTAINER_ID" src/vs/workbench/contrib/chat

# Find where Chat commands are registered
grep -r "ACTION_ID_NEW_CHAT\|ModeOpenChatGlobalAction" src/vs/workbench/contrib/chat

# Find where Chat services are registered
grep -r "registerSingleton.*Chat" src/vs/workbench/contrib/chat
```

**Then**: Create `roopikAgent/` directory and start copying!

**You ready to start?** 🚀
