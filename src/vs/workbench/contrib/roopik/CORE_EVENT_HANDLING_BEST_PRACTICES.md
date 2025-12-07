# Event Handling Best Practices in VSCode IPC Architecture

## The Problem

When using event-based initialization across IPC (main process <-> renderer process), you can miss events if:
1. **Fresh Start**: Event fires before subscriber exists
2. **IDE Reload**: Event already fired, renderer subscribes too late

## The Pattern

### 1. Service Side (Main Process)

```typescript
// canvasService.ts (electron-main)
class CanvasService {
    private initialized = false;
    private readonly _onDidInitialize = new Emitter<void>();
    readonly onDidInitialize = this._onDidInitialize.event;

    async initialize(workspacePath: string): Promise<void> {
        // ... initialization logic ...
        this.initialized = true;
        this._onDidInitialize.fire();  // Fire ONCE after ready
    }

    // Sync version (main process only)
    isInitialized(): boolean {
        return this.initialized;
    }

    // Async version (works over IPC)
    async isInitializedAsync(): Promise<boolean> {
        return this.initialized;
    }
}
```

### 2. IPC Channel (Main Process)

```typescript
// canvasChannel.ts
class CanvasChannel implements IServerChannel {
    listen(_context: unknown, event: string): Event<any> {
        switch (event) {
            case 'onDidInitialize':
                return this.service.onDidInitialize;
            // ... other events
        }
    }

    call(_context: unknown, command: string, arg?: any): Promise<any> {
        switch (command) {
            case 'isInitialized':
                return Promise.resolve(this.service.isInitialized());
            // ... other commands
        }
    }
}
```

### 3. Client Side (Renderer Process)

```typescript
// canvasServiceClient.ts (browser)
class CanvasServiceClient implements ICanvasService {
    readonly onDidInitialize: Event<void>;

    constructor(@IMainProcessService mainProcessService: IMainProcessService) {
        this.channel = mainProcessService.getChannel(CANVAS_CHANNEL_NAME);
        this.onDidInitialize = this.channel.listen<void>('onDidInitialize');
    }

    isInitialized(): boolean {
        // Sync not supported over IPC - throw helpful error
        throw new Error('Use isInitializedAsync() for IPC calls');
    }

    async isInitializedAsync(): Promise<boolean> {
        return this.channel.call('isInitialized');
    }
}
```

### 4. Consumer (ViewPane)

```typescript
// roopikViewPane.ts (browser)
class RoopikDashboardView {
    private serviceInitialized = false;
    private loadingTimeoutHandle: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        // Subscribe to future events
        this._register(this.canvasService.onDidInitialize(() => {
            this.serviceInitialized = true;
            this.clearLoadingTimeout();
            this.loadData();
        }));
    }

    renderBody() {
        this.showLoadingState();
        this.checkAndLoad();  // Handle already-initialized case
    }

    // KEY: Check if already initialized (handles reload)
    private async checkAndLoad(): Promise<void> {
        try {
            const isInitialized = await this.canvasService.isInitializedAsync();

            if (isInitialized) {
                // Already initialized - load immediately
                this.serviceInitialized = true;
                this.clearLoadingTimeout();
                this.loadData();
            } else {
                // Wait for event + timeout as safety net
                this.startLoadingTimeout();
            }
        } catch (err) {
            this.startLoadingTimeout();
        }
    }

    private startLoadingTimeout(): void {
        this.loadingTimeoutHandle = setTimeout(() => {
            if (!this.serviceInitialized) {
                this.showTimeoutState();  // "Service unavailable - Click to retry"
            }
        }, 5000);
    }
}
```

## Flow Diagram

```
Fresh Start:
  ViewPane.constructor() -> subscribe to onDidInitialize
  ViewPane.renderBody() -> show loading, checkAndLoad()
  checkAndLoad() -> isInitializedAsync() = false -> start timeout
  CanvasService.initialize() -> fires onDidInitialize
  ViewPane receives event -> load data

IDE Reload:
  CanvasService already initialized (main process persists)
  ViewPane.constructor() -> subscribe (event already fired, missed!)
  ViewPane.renderBody() -> show loading, checkAndLoad()
  checkAndLoad() -> isInitializedAsync() = true -> load immediately
```

## Key Rules

1. **Always provide `isInitializedAsync()`** - Allows checking state over IPC
2. **Check state before waiting** - Don't assume event hasn't fired
3. **Add timeout as safety net** - Show error if event never comes
4. **Use cache after init** - Avoid redundant I/O once initialized

## Common Mistakes

| Mistake | Result | Fix |
|---------|--------|-----|
| Only subscribe to event | Miss event on reload | Check `isInitializedAsync()` first |
| Only check state | Miss event on fresh start | Also subscribe to event |
| No timeout | Stuck on "Loading..." forever | Add timeout with retry |
| Read from disk every time | Slow, redundant I/O | Cache after initialization |
| Sync method over IPC | Throws error / blocks | Use async version for IPC |

## Initialization Order

Services must initialize dependencies first:

```typescript
// WRONG - dependency not ready
async initialize(workspacePath: string): Promise<void> {
    await this.loadAllCanvases();  // StorageService not initialized!
    this.initialized = true;
}

// CORRECT - initialize dependencies first
async initialize(workspacePath: string): Promise<void> {
    if (!this.storageService.isInitialized()) {
        await this.storageService.initialize(workspacePath);
    }
    await this.loadAllCanvases();  // Now storage is ready
    this.initialized = true;
    this._onDidInitialize.fire();
}
```

---

## Checklist: Adding New Event-Based Services

Use this checklist when implementing a new service with events across IPC:

### Service Interface (common/)
- [ ] Add `onDidInitialize: Event<void>` to interface
- [ ] Add `isInitialized(): boolean` (sync, main process only)
- [ ] Add `isInitializedAsync(): Promise<boolean>` (async, works over IPC)
- [ ] Document which methods are sync vs async

### Service Implementation (electron-main/)
- [ ] Add `private initialized = false` flag
- [ ] Add `private readonly _onDidInitialize = new Emitter<void>()`
- [ ] Expose `readonly onDidInitialize = this._onDidInitialize.event`
- [ ] Initialize dependencies BEFORE loading data
- [ ] Set `this.initialized = true` after all data loaded
- [ ] Call `this._onDidInitialize.fire()` ONCE at end of initialize
- [ ] Implement `isInitialized()` returning the flag
- [ ] Implement `isInitializedAsync()` returning Promise of the flag
- [ ] Dispose emitter in `dispose()` method

### IPC Channel (electron-main/channel/)
- [ ] Add case for `'onDidInitialize'` in `listen()` method
- [ ] Add case for `'isInitialized'` in `call()` method returning `Promise.resolve()`
- [ ] Log channel calls for debugging

### Service Client (browser/)
- [ ] Subscribe to event: `this.onDidInitialize = this.channel.listen<void>('onDidInitialize')`
- [ ] Implement `isInitialized()` throwing helpful error (sync not supported over IPC)
- [ ] Implement `isInitializedAsync()` calling `this.channel.call('isInitialized')`

### Consumer/ViewPane (browser/)
- [ ] Add `private serviceInitialized = false` flag
- [ ] Add `private loadingTimeoutHandle` for timeout
- [ ] Subscribe to `onDidInitialize` in constructor
- [ ] In event handler: set flag, clear timeout, load data
- [ ] In `renderBody()`: show loading state first
- [ ] Call `checkAndLoad()` after showing loading
- [ ] Implement `checkAndLoad()`:
  - [ ] Call `isInitializedAsync()`
  - [ ] If true: load immediately (reload case)
  - [ ] If false: start timeout (fresh start case)
  - [ ] Handle errors with try/catch
- [ ] Implement timeout with retry UI
- [ ] Clear timeout when event received or check succeeds

### Testing Scenarios
- [ ] **Fresh IDE Start**: Service not initialized -> wait for event -> loads correctly
- [ ] **IDE Reload (Ctrl+R)**: Service already initialized -> check returns true -> loads immediately
- [ ] **Service Timeout**: If event never fires -> shows "Service unavailable" with retry
- [ ] **Multiple Reloads**: Works consistently across multiple reload cycles
- [ ] **CRUD Operations**: Create/Update/Delete trigger refresh via events

### Debugging Tips
- [ ] Add `console.log` at key points:
  - Service `initialize()` start and end
  - Event `fire()` call
  - Client event subscription
  - Consumer event received
  - `isInitializedAsync()` call and result
- [ ] Check DevTools console for event order
- [ ] Verify main process logs (Output > Electron Main)
