# Event-Driven IPC Architecture

> How to implement efficient, real-time communication between Main and Renderer processes using VSCode's event system instead of polling.

**Date**: November 2025
**Status**: PATTERN ESTABLISHED
**Related Files**:
- `src/vs/base/common/event.ts` - VSCode's Event/Emitter implementation
- `src/vs/base/parts/ipc/common/ipc.ts` - IPC Channel interfaces
- `src/vs/workbench/contrib/roopik/common/projectModeV2/ipc.ts` - Our service interface
- `src/vs/workbench/contrib/roopik/electron-main/projectModeV2/browserViewServiceV2.ts` - Main process
- `src/vs/workbench/contrib/roopik/browser/projectModeV2/projectModeV2Editor.ts` - Renderer process

---

## The Problem: Polling is Wasteful

When you need to sync state between Main and Renderer processes, the naive approach is **polling**:

```typescript
// ❌ BAD: Polling every 300ms
setInterval(async () => {
    const isOpen = await this.service.isDevToolsOpen(this.browserViewId);
    if (this.devtoolsVisible && !isOpen) {
        this.devtoolsVisible = false; // Sync state
    }
}, 300);
```

**Problems with polling:**
1. **CPU Waste** - Constant IPC calls even when nothing changes
2. **Latency** - Up to 300ms delay before detecting changes
3. **Battery Drain** - Unnecessary wake-ups on laptops
4. **Scalability** - Gets worse with more polled values
5. **Blocking** - Each poll cycle blocks other operations

---

## The Solution: Event-Driven IPC

Instead of asking "has anything changed?", we say **"tell me when something changes"**.

```typescript
// ✅ GOOD: Event-driven
this.service.onDevToolsClosed((event) => {
    if (event.browserViewId === this.browserViewId) {
        this.devtoolsVisible = false; // Instant sync!
    }
});
```

**Benefits:**
1. **Zero CPU Overhead** - No work when nothing changes
2. **Instant Response** - Microseconds, not milliseconds
3. **Battery Friendly** - No unnecessary wake-ups
4. **Scalable** - Handles hundreds of events efficiently
5. **Non-blocking** - Events are fire-and-forget

---

- Architecture Diagram: Visual flow from Main → Channel → Bridge → UI

Step-by-Step Implementation Guide:
- Define event type
- Add to service interface
- Implement Emitter in main process
- Expose via IPC Channel
- Subscribe in service bridge
- Use in UI components

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MAIN PROCESS (Node.js)                              │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  BrowserViewServiceV2                                                   │ │
│  │                                                                         │ │
│  │  private _onDevToolsClosed = new Emitter<DevToolsClosedEvent>();       │ │
│  │  readonly onDevToolsClosed = this._onDevToolsClosed.event;             │ │
│  │                                                                         │ │
│  │  // When something happens:                                             │ │
│  │  webContents.on('devtools-closed', () => {                             │ │
│  │      this._onDevToolsClosed.fire({ browserViewId });  ◄── FIRE EVENT   │ │
│  │  });                                                                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              │ IServerChannel.listen()                       │
│                              ▼                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  ProjectModeV2Channel (IPC Server)                                      │ │
│  │                                                                         │ │
│  │  listen(_, event: string): Event<any> {                                │ │
│  │      switch (event) {                                                  │ │
│  │          case 'onDevToolsClosed':                                      │ │
│  │              return this.service.onDevToolsClosed;  ◄── EXPOSE EVENT   │ │
│  │      }                                                                 │ │
│  │  }                                                                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
└──────────────────────────────┼───────────────────────────────────────────────┘
                               │
                    ═══════════╪═══════════  IPC BOUNDARY
                               │
┌──────────────────────────────┼───────────────────────────────────────────────┐
│                              │                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  ProjectModeV2ServiceBridge (IPC Client)                                │ │
│  │                                                                         │ │
│  │  readonly onDevToolsClosed: Event<DevToolsClosedEvent>;                │ │
│  │                                                                         │ │
│  │  constructor(channel: IChannel) {                                      │ │
│  │      this.onDevToolsClosed = channel.listen('onDevToolsClosed');       │ │
│  │  }                                           ▲                          │ │
│  │                                              │                          │ │
│  │                                    SUBSCRIBE TO EVENT                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              │ Event subscription                            │
│                              ▼                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  ProjectModeV2Editor (UI Component)                                     │ │
│  │                                                                         │ │
│  │  this._register(this.browserService.onDevToolsClosed((event) => {      │ │
│  │      if (event.browserViewId === this.browserViewId) {                 │ │
│  │          this.devtoolsVisible = false;  ◄── REACT TO EVENT             │ │
│  │      }                                                                 │ │
│  │  }));                                                                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│                          RENDERER PROCESS (Chromium)                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Guide

### Step 1: Define the Event Type

**File**: `common/projectModeV2/types.ts`

```typescript
/**
 * Event payload when DevTools is closed
 * Fired when user closes DevTools via built-in X button
 */
export interface DevToolsClosedEvent {
    browserViewId: number;
}
```

**Best Practices:**
- Keep payloads minimal - only include what subscribers need
- Use descriptive names that indicate WHEN the event fires
- Include identifiers to filter events (e.g., `browserViewId`)

---

### Step 2: Add Event to Service Interface

**File**: `common/projectModeV2/ipc.ts`

```typescript
import { Event } from '../../../../../base/common/event.js';
import type { DevToolsClosedEvent } from './types.js';

export interface IProjectModeV2Service {
    readonly _serviceBrand: undefined;

    // ============================================
    // Events
    // ============================================

    /**
     * Fired when DevTools is closed externally (via built-in X button)
     * Allows renderer to sync its state without polling
     */
    readonly onDevToolsClosed: Event<DevToolsClosedEvent>;

    // ... methods ...
}
```

**Key Points:**
- Events are `readonly` - they're exposed, not settable
- Use `Event<T>` from VSCode's event system
- Document WHEN the event fires and WHY it's useful

---

### Step 3: Implement Emitter in Main Process Service

**File**: `electron-main/projectModeV2/browserViewServiceV2.ts`

```typescript
import { Emitter, Event } from '../../../../../base/common/event.js';
import type { DevToolsClosedEvent } from '../../common/projectModeV2/types.js';

export class BrowserViewServiceV2 implements IProjectModeV2Service {
    readonly _serviceBrand: undefined;

    // ============================================
    // Events
    // ============================================

    // Private emitter - only this class can fire events
    private readonly _onDevToolsClosed = new Emitter<DevToolsClosedEvent>();

    // Public event - subscribers listen to this
    readonly onDevToolsClosed: Event<DevToolsClosedEvent> = this._onDevToolsClosed.event;

    // ... elsewhere in the class, fire the event:

    private setupBrowserEvents(browserView: WebContentsView): void {
        const webContents = browserView.webContents;
        const browserViewId = webContents.id;

        // Listen to Electron's native event
        webContents.on('devtools-closed', () => {
            console.log(`[ProjectModeV2] DevTools closed externally for browser ${browserViewId}`);

            // Fire our custom event to notify renderer
            this._onDevToolsClosed.fire({ browserViewId });
        });
    }
}
```

**The Emitter Pattern:**
```typescript
// Private: Only this class can fire
private readonly _onSomething = new Emitter<PayloadType>();

// Public: Anyone can subscribe
readonly onSomething: Event<PayloadType> = this._onSomething.event;

// Fire the event
this._onSomething.fire({ data: 'here' });
```

---

### Step 4: Expose Event via IPC Channel

**File**: `electron-main/projectModeV2/projectModeV2Channel.ts`

```typescript
import { Event } from '../../../../../base/common/event.js';
import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import type { IProjectModeV2Service } from '../../common/projectModeV2/ipc.js';

export class ProjectModeV2Channel implements IServerChannel {
    constructor(private service: IProjectModeV2Service) { }

    // Handle event subscriptions from renderer
    listen(_: unknown, event: string): Event<any> {
        switch (event) {
            case 'onDevToolsClosed':
                return this.service.onDevToolsClosed;
            default:
                throw new Error(`[ProjectModeV2Channel] Unknown event: ${event}`);
        }
    }

    // Handle method calls from renderer
    call(_: unknown, command: string, arg?: any): Promise<any> {
        // ... existing call handling ...
    }
}
```

**Key Point:** The `listen()` method returns the Event directly - VSCode's IPC system handles the subscription magic.

---

### Step 5: Subscribe in Service Bridge (Renderer)

**File**: `browser/projectModeV2/projectModeV2ServiceBridge.ts`

```typescript
import { Event } from '../../../../../base/common/event.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import type { DevToolsClosedEvent } from '../../common/projectModeV2/types.js';

export class ProjectModeV2ServiceBridge implements IProjectModeV2Service {
    readonly _serviceBrand: undefined;

    // ============================================
    // Events
    // ============================================

    /**
     * Event fired when DevTools is closed externally (via built-in X button)
     */
    readonly onDevToolsClosed: Event<DevToolsClosedEvent>;

    constructor(private channel: IChannel) {
        // Subscribe to events from main process
        // This creates a cross-process event subscription!
        this.onDevToolsClosed = this.channel.listen<DevToolsClosedEvent>('onDevToolsClosed');
    }

    // ... methods ...
}
```

**The Magic:** `channel.listen()` returns an `Event<T>` that fires whenever the main process emits. VSCode's IPC handles all the serialization and message passing.

---

### Step 6: Use the Event in UI Components

**File**: `browser/projectModeV2/projectModeV2Editor.ts`

```typescript
export class ProjectModeV2Editor extends EditorPane {
    private devtoolsVisible = false;

    private async doInitializeBrowserView(): Promise<void> {
        // Create browser view
        const result = await this.browserService.createBrowserView(windowId);
        this.browserViewId = result.browserViewId;

        // Subscribe to DevTools closed event
        // IMPORTANT: Use this._register() to auto-dispose when editor is destroyed
        this._register(this.browserService.onDevToolsClosed((event) => {
            // Filter: Only handle events for THIS browser view
            if (event.browserViewId === this.browserViewId && this.devtoolsVisible) {
                this.devtoolsVisible = false;
                this.logger.info('[ProjectModeV2] DevTools closed externally - state synced');
            }
        }));
    }
}
```

**Critical: Memory Management**
```typescript
// ✅ CORRECT: Auto-disposes when component is destroyed
this._register(this.service.onSomething((e) => { ... }));

// ❌ WRONG: Memory leak - subscription never cleaned up
this.service.onSomething((e) => { ... });
```

---

## Complete Data Flow

```
1. USER ACTION
   User clicks X button in DevTools

        │
        ▼

2. ELECTRON EVENT
   webContents.on('devtools-closed') fires in main process

        │
        ▼

3. EMITTER FIRES
   this._onDevToolsClosed.fire({ browserViewId })

        │
        ▼

4. IPC CHANNEL
   ProjectModeV2Channel.listen() returns the event to subscriber

        │
        ▼ (crosses process boundary)
        │

5. SERVICE BRIDGE
   channel.listen('onDevToolsClosed') receives the event

        │
        ▼

6. UI COMPONENT
   this.browserService.onDevToolsClosed callback fires

        │
        ▼

7. STATE UPDATE
   this.devtoolsVisible = false
   UI reflects the change instantly!
```

---

## When to Use Event-Driven IPC

### Use Events For:

| Scenario | Example |
|----------|---------|
| **State changes from main process** | DevTools opened/closed, window focus changed |
| **External user actions** | User closed panel via native UI |
| **System events** | Network status, battery level |
| **Long-running operation progress** | Download progress, build status |
| **Real-time data** | Console logs, network requests |

### Continue Using Polling For:

| Scenario | Reason |
|----------|--------|
| **Initial state fetch** | Need current value, not changes |
| **Values that change unpredictably** | No single source event |
| **Debugging/monitoring** | Simpler for temporary checks |

---

## Implemented Events

### Navigation State Changed Event (IMPLEMENTED ✅)

Replaces the 300ms polling with instant event-driven updates for:
- URL changes (`did-navigate`, `did-navigate-in-page`)
- Page title changes (`page-title-updated`)
- Loading state (`did-start-loading`, `did-finish-load`)
- Navigation errors (`did-fail-load`, `did-fail-provisional-load`)
- Back/forward button state

```typescript
// types.ts - Event payload
interface NavigationStateChangedEvent {
    browserViewId: number;
    url: string;
    title: string;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    lastError?: NavigationError;
}

// Main process - fires on multiple Electron events
webContents.on('did-navigate', (_, url) => {
    this.fireNavigationStateChanged(browserViewId);
});
webContents.on('page-title-updated', () => {
    this.fireNavigationStateChanged(browserViewId);
});
webContents.on('did-start-loading', () => {
    this.fireNavigationStateChanged(browserViewId);
});
webContents.on('did-finish-load', () => {
    this.fireNavigationStateChanged(browserViewId);
});

// Renderer - instant updates, no polling!
this._register(this.browserService.onNavigationStateChanged((event) => {
    // CRITICAL: Filter by browserViewId for multi-browser support!
    if (event.browserViewId !== this.browserViewId) return;

    this.controlBar.setUrl(event.url);
    this.controlBar.updateNavigationState(event.canGoBack, event.canGoForward);
    input.setPageTitle(event.title);  // Updates tab title!

    if (event.isLoading) {
        this.controlBar.showLoading();
    } else {
        this.controlBar.hideLoading();
    }
}));
```

**Benefits:**
- Each browser instance has its own title (no more duplicate titles!)
- Instant URL bar updates when navigating
- Zero CPU overhead when idle
- Scales perfectly for multiple browser tabs

---

### Browser List Changed Event (IMPLEMENTED ✅)

Tracks all browser instances for multi-browser management:
- Browser created (`createBrowserView`)
- Browser destroyed (`destroyBrowserView`)
- List of all active browsers with their URL, title, creation time
- Maximum browser count limit (configurable, default: 2)

```typescript
// types.ts - Types for browser management
interface BrowserInstanceInfo {
    browserViewId: number;
    windowId: number;
    url: string;
    title: string;
    createdAt: number;
}

interface BrowserListChangedEvent {
    browsers: BrowserInstanceInfo[];
    count: number;
    maxCount: number;
}

// Service interface - methods + event
getBrowserList(): Promise<BrowserInstanceInfo[]>;
getBrowserCount(): Promise<number>;
getMaxBrowserCount(): Promise<number>;
canCreateBrowser(): Promise<boolean>;
readonly onBrowserListChanged: Event<BrowserListChangedEvent>;

// Main process - fires on browser lifecycle
async createBrowserView(windowId: number): Promise<BrowserViewResult> {
    // ... create browser ...
    this.fireBrowserListChanged();  // Notify subscribers
    return { browserViewId, debuggingPort };
}

async destroyBrowserView(browserViewId: number): Promise<void> {
    // ... destroy browser ...
    this.fireBrowserListChanged();  // Notify subscribers
}

// Renderer - react to browser list changes
this._register(this.browserService.onBrowserListChanged((event) => {
    this.welcomeScreen.updateBrowserList(event.browsers);
    this.welcomeScreen.setCanCreateBrowser(event.count < event.maxCount);
}));
```

**Use Cases:**
- Welcome screen showing list of open browsers to select
- Creating new browser from welcome screen
- Limiting max browsers for resource management (e.g., max 2)
- AI agents can query available browsers

---

## Future Applications

This pattern can be used for many more features:

### Console Log Streaming
```typescript
interface ConsoleLogEvent {
    browserViewId: number;
    type: 'log' | 'warn' | 'error';
    message: string;
}

// Stream console logs in real-time to a panel
this.browserService.onConsoleLog((event) => {
    this.consolePanel.appendLog(event);
});
```

### Network Request Monitoring
```typescript
interface NetworkRequestEvent {
    browserViewId: number;
    requestId: string;
    url: string;
    status: number;
}

// Real-time network panel updates
this.browserService.onNetworkRequest((event) => {
    this.networkPanel.addRequest(event);
});
```

### AI Agent Notifications
```typescript
interface AgentActionEvent {
    agentId: string;
    action: 'click' | 'type' | 'navigate' | 'screenshot';
    target?: string;
    result?: any;
}

// AI agents can emit events that UI reacts to
this.agentService.onAgentAction((event) => {
    this.highlightElement(event.target);
    this.showActionFeedback(event.action);
});
```

---

## Performance Comparison

| Metric | Polling (300ms) | Event-Driven |
|--------|-----------------|--------------|
| **IPC calls when idle** | 3.3/second | 0/second |
| **Response latency** | 0-300ms | <1ms |
| **CPU usage (idle)** | Constant | Zero |
| **Memory overhead** | Minimal | Minimal |
| **Code complexity** | Simple | Slightly more |
| **Scalability** | Poor | Excellent |

---

## Summary

Event-driven IPC is the **correct** pattern for real-time state synchronization between Main and Renderer processes in Electron/VSCode applications.

**The Pattern:**
1. Define event type in `common/types.ts`
2. Add event to service interface in `common/ipc.ts`
3. Create Emitter in main process service
4. Fire events when state changes
5. Expose via IPC Channel's `listen()` method
6. Subscribe in service bridge using `channel.listen()`
7. React to events in UI components (with proper disposal!)

**Remember:**
- Events for state changes, polling for initial state
- Always use `this._register()` to prevent memory leaks
- Filter events by identifier (e.g., `browserViewId`)
- Keep event payloads minimal

**The Result:** Instant, efficient, scalable state synchronization!
