# Sandbox Pipeline Architecture (Future Implementation)

> **Status**: Planned | **Priority**: Medium | **Blocked By**: Core component layer completion

---

## Problem Statement

### Current Issues Encountered

When loading 10+ sandbox components simultaneously, we experienced:

1. **`ERR_INSUFFICIENT_RESOURCES`** - Too many concurrent CDN requests (React, Babel, etc.)
2. **Memory pressure** - Multiple webviews initializing at once
3. **UI freezing** - System became unresponsive
4. **Full system crash** - Stack buffer overrun error, required system restore

### Root Cause

The current architecture has **inverted control** - `SandboxCard` manages its own loading, which means:
- Each card immediately creates a webview and fetches CDN scripts
- No coordination between cards
- No concurrency limits
- Card knows about queue (violates single responsibility)

### Failed Attempt

We tried adding `SandboxLoadManager` inside `SandboxCard`:
- Card registered itself with manager on creation
- Manager called `startLoading()` callback when slot available
- **Problem**: This is bad design - the card shouldn't know about queuing

The card should be "dumb" - just render what it's told.

---

## Proposed Solution: Pipeline Architecture

### Design Principles

1. **SandboxCard is dumb** - Only knows how to render, not when to load
2. **Queue logic lives in a service** - `SandboxQueueService` manages concurrency
3. **Pipeline is explicit** - Each stage has clear input/output
4. **canvasEditor orchestrates** - Coordinates the pipeline stages
5. **Public API for AI agents** - Clean entry point for external callers

### Pipeline Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    ENTRY POINT (Public API)                 │
│                                                             │
│  canvasEditor.addComponent(code: string, options?)          │
│  canvasEditor.addComponents(components[])  // batch         │
│                                                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              STAGE 1: Code Transformation Pipeline          │
│              (PreviewManager / ComponentProcessor)          │
│                                                             │
│  Input: Raw JSX code                                        │
│  Process:                                                   │
│    1. Parse imports → extract dependencies                  │
│    2. Transform imports to const destructuring              │
│    3. Generate CDN URLs from dependencies                   │
│    4. Wrap in renderable format                             │
│  Output: { sessionCode, cdnUrls, componentId }              │
│                                                             │
│  Location: services/previewManager.ts (already exists)      │
│                                                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              STAGE 2: Position Calculator                   │
│              (GridManager)                                  │
│                                                             │
│  Input: Component metadata, existing sandboxes              │
│  Process: Find next available slot (grid or free mode)      │
│  Output: { x, y, width, height, zIndex }                    │
│                                                             │
│  Location: services/gridManager.ts (already exists)         │
│                                                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              STAGE 3: Sandbox Queue Service (NEW)           │
│                                                             │
│  Input: Sandbox definitions (can be many at once)           │
│  Process:                                                   │
│    1. Create SandboxCard with loading state (no webview)    │
│    2. Add to render queue                                   │
│    3. Process queue (max 4 concurrent webview inits)        │
│    4. Call card.initializeWebview() when slot available     │
│    5. Track completion, start next in queue                 │
│  Output: SandboxCard on canvas (loading → ready)            │
│                                                             │
│  Location: services/sandboxQueueService.ts (TO CREATE)      │
│                                                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              STAGE 4: Render (SandboxCard)                  │
│                                                             │
│  - Shows loading overlay if webview not initialized         │
│  - Shows component when webview ready                       │
│  - Handles user interactions (click, drag, delete, etc.)    │
│  - NO knowledge of queue or other sandboxes                 │
│                                                             │
│  Location: components/sandboxCard.ts (modify)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Files to Create

#### 1. `services/sandboxQueueService.ts`

```typescript
/**
 * Sandbox Queue Service
 *
 * Manages concurrent loading of sandbox webviews.
 * Controls resource usage by limiting parallel CDN fetches.
 */

export interface ISandboxQueueItem {
    sandbox: Sandbox;
    card: SandboxCard;
    onComplete: () => void;
}

export interface ISandboxQueueCallbacks {
    onCardCreated: (card: SandboxCard) => void;
    onCardReady: (id: string) => void;
    onCardError: (id: string, error: string) => void;
}

export class SandboxQueueService {
    private static readonly MAX_CONCURRENT = 4;

    private activeLoading: Set<string> = new Set();
    private pendingQueue: ISandboxQueueItem[] = [];

    constructor(
        private parent: HTMLElement,
        private webviewService: IWebviewService,
        private callbacks: ISandboxQueueCallbacks
    ) {}

    /**
     * Enqueue a sandbox for rendering
     * Creates card immediately (with loading state), queues webview init
     */
    public enqueue(sandbox: Sandbox, cardCallbacks: ISandboxCardCallbacks): SandboxCard {
        // 1. Create card with loading state (no webview yet)
        const card = new SandboxCard(this.parent, sandbox, cardCallbacks, this.webviewService);
        this.callbacks.onCardCreated(card);

        // 2. Add to queue
        const item: ISandboxQueueItem = {
            sandbox,
            card,
            onComplete: () => this.onItemComplete(sandbox.id)
        };

        // 3. Try to start immediately or queue
        if (this.activeLoading.size < SandboxQueueService.MAX_CONCURRENT) {
            this.startLoading(item);
        } else {
            this.pendingQueue.push(item);
        }

        return card;
    }

    /**
     * Enqueue multiple sandboxes at once (batch)
     */
    public enqueueBatch(sandboxes: Sandbox[], cardCallbacks: ISandboxCardCallbacks): SandboxCard[] {
        return sandboxes.map(sandbox => this.enqueue(sandbox, cardCallbacks));
    }

    private startLoading(item: ISandboxQueueItem): void {
        this.activeLoading.add(item.sandbox.id);

        // Tell card to initialize webview
        item.card.initializeWebview();

        // Set timeout fallback (30s)
        setTimeout(() => {
            if (this.activeLoading.has(item.sandbox.id)) {
                console.warn(`[SandboxQueue] Timeout for ${item.sandbox.id}`);
                this.onItemComplete(item.sandbox.id);
            }
        }, 30000);
    }

    private onItemComplete(id: string): void {
        this.activeLoading.delete(id);
        this.processQueue();
    }

    private processQueue(): void {
        while (
            this.activeLoading.size < SandboxQueueService.MAX_CONCURRENT &&
            this.pendingQueue.length > 0
        ) {
            const next = this.pendingQueue.shift()!;
            this.startLoading(next);
        }
    }

    public getStatus(): { active: number; queued: number } {
        return {
            active: this.activeLoading.size,
            queued: this.pendingQueue.length
        };
    }

    public dispose(): void {
        this.activeLoading.clear();
        this.pendingQueue = [];
    }
}
```

### Files to Modify

#### 2. `components/sandboxCard.ts`

Changes needed:
- Split constructor: create DOM only, not webview
- Add `initializeWebview()` public method (called by queue service)
- Add loading overlay that shows until webview ready
- Add `notifyReady()` callback for queue service
- Remove any queue/manager knowledge

```typescript
export class SandboxCard extends Disposable {
    private webviewInitialized: boolean = false;
    private loadingOverlay: HTMLElement | undefined;

    constructor(
        private parent: HTMLElement,
        private sandbox: Sandbox,
        private callbacks: ISandboxCardCallbacks,
        private webviewService: IWebviewService
    ) {
        super();
        this.container = this.createContainer();
        this.labelElement = this.createLabel();
        this.loadingOverlay = this.createLoadingOverlay();
        this.createWebviewStructure(); // DOM only, no webview
        this.render();
    }

    /**
     * Initialize webview - called externally by queue service
     * This is where the heavy lifting happens
     */
    public initializeWebview(): void {
        if (this.webviewInitialized) return;
        this.webviewInitialized = true;

        this.updateLoadingOverlay('loading');

        // Create actual webview, load CDN, etc.
        this.webviewElement = this.webviewService.createWebviewElement({...});
        this.webviewElement.setHtml(this.getSandboxHtml());
        // ... rest of webview setup
    }

    /**
     * Called when webview reports ready/error
     */
    private onWebviewMessage(message: any): void {
        if (message.type === 'rendered') {
            this._state = 'ready';
            this.hideLoadingOverlay();
            this.callbacks.onReady?.(this.sandbox.id); // Notify queue
        } else if (message.type === 'error') {
            this._state = 'error';
            this.hideLoadingOverlay();
            this.callbacks.onError?.(this.sandbox.id, message.message);
        }
    }
}
```

#### 3. `canvasEditor.ts`

Changes needed:
- Create `SandboxQueueService` instance
- Add public `addComponent()` API
- Route sandbox creation through queue service

```typescript
export class CanvasEditor extends EditorPane {
    private sandboxQueue: SandboxQueueService | undefined;

    // ... existing code ...

    /**
     * PUBLIC API: Add a component to the canvas
     * This is the entry point for AI agents
     */
    public addComponent(code: string, options?: {
        id?: string;
        x?: number;
        y?: number;
    }): string {
        // Stage 1: Transform code
        const { sessionCode, cdnUrls } = this.parseComponentCode(
            options?.id || this.generateId(),
            code
        );

        // Stage 2: Calculate position
        const position = options?.x !== undefined
            ? { x: options.x, y: options.y! }
            : this.gridManager.getNextAvailableSlot(Array.from(this.sandboxes.values()));

        const config = this.gridManager.getConfig();

        // Stage 3: Create sandbox definition
        const sandbox: Sandbox = {
            id: options?.id || this.generateId(),
            componentId: options?.id || 'component',
            x: position.x,
            y: position.y,
            width: config.sandboxWidth,
            height: config.sandboxHeight,
            zIndex: this.sandboxes.size + 1,
            state: 'loading',
            sessionCode,
            cdnUrls
        };

        // Stage 4: Queue for rendering
        this.sandboxQueue!.enqueue(sandbox, this.createCardCallbacks());
        this.sandboxes.set(sandbox.id, sandbox);

        return sandbox.id;
    }

    /**
     * PUBLIC API: Add multiple components at once
     */
    public addComponents(components: Array<{ code: string; id?: string }>): string[] {
        return components.map(c => this.addComponent(c.code, { id: c.id }));
    }
}
```

---

## Benefits of This Architecture

| Aspect | Current | Proposed |
|--------|---------|----------|
| **Separation of Concerns** | Card knows about queue | Card is dumb, queue is separate |
| **Testability** | Hard to test queue logic | Each stage testable in isolation |
| **AI Integration** | No public API | Clean `addComponent()` API |
| **Concurrency Control** | Inside card (wrong) | In dedicated service |
| **Extensibility** | Hard to add retry/priority | Easy to add features |
| **Debugging** | Queue state hidden in cards | Centralized queue status |

---

## When to Implement

Implement this when:
1. AI agent integration begins (needs public API)
2. Performance issues resurface with many components
3. Need to add features like:
   - Priority queue (AI-generated components first)
   - Retry logic for failed loads
   - Progress tracking for batch operations
   - Cancel/pause loading

---

## Related Files

- `services/previewManager.ts` - Code transformation (Stage 1)
- `services/gridManager.ts` - Position calculation (Stage 2)
- `services/sandboxQueueService.ts` - Queue management (Stage 3) **TO CREATE**
- `components/sandboxCard.ts` - Rendering (Stage 4) **TO MODIFY**
- `canvasEditor.ts` - Orchestrator **TO MODIFY**

---

*Created: November 2024*
*Context: System crashes when loading 10+ sandbox components simultaneously*
