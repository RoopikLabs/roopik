# Browser View Double Initialization Challenge

> Documentation of the race condition causing two browser views to be created simultaneously.

**Date**: November 2025
**Status**: RESOLVED
**Related Files**:
- `src/vs/workbench/contrib/roopik/browser/projectModeV2/projectModeV2Editor.ts`

---

## Problem Summary

Opening the Browser Preview V2 caused the welcome screen to freeze. Investigation revealed TWO browser views were being created instead of one, causing a race condition.

---

## The Double Initialization Issue

### Symptom
1. Click "Open Browser Preview V2"
2. Welcome screen freezes (white screen)
3. Console shows two browser view creation logs
4. Sometimes both views are visible, overlapping

### Root Cause: Race Condition

VSCode calls `createEditor()` and `setInput()` in rapid succession:

```
Timeline:
=========
T0: createEditor() called
T1: createEditor() calls initializeBrowserView()
T2: setInput() called (before T1 completes!)
T3: setInput() calls initializeBrowserView()
T4: BOTH create browser views!
```

The problem code:

```typescript
// BROKEN: Both methods called initializeBrowserView()

protected createEditor(parent: HTMLElement): void {
    // ... create DOM ...
    this.initializeBrowserView();  // Call 1
}

override async setInput(...): Promise<void> {
    // ... setup ...
    if (!this.browserViewId) {  // Both check passes!
        await this.initializeBrowserView();  // Call 2
    }
}
```

### Why the Check Failed

Both calls checked `!this.browserViewId` BEFORE either set the ID:

```
T1: createEditor checks browserViewId === undefined ✓
T2: setInput checks browserViewId === undefined ✓ (still undefined!)
T3: createEditor creates view, sets browserViewId = 1
T4: setInput creates view, sets browserViewId = 2 (OVERWRITES!)
```

---

## Failed Attempt: isInitializing Flag

First attempt was to add an `isInitializing` flag:

```typescript
// STILL BROKEN: Flag not set fast enough

private isInitializing = false;

private async initializeBrowserView(): Promise<void> {
    if (this.browserViewId || this.isInitializing) {
        return;  // Skip if already initialized or initializing
    }

    this.isInitializing = true;  // Too late! Both calls passed the check
    // ... async work ...
}
```

**Problem**: Both calls passed the check before either set the flag (same race condition).

---

## Working Solution 1: Synchronous Flag + Promise

Set flag SYNCHRONOUSLY before any async work:

```typescript
private isInitializing = false;
private initializationPromise: Promise<void> | undefined;

private initializeBrowserView(): Promise<void> {
    // Already done
    if (this.browserViewId) {
        return Promise.resolve();
    }

    // Already in progress - wait for it
    if (this.isInitializing) {
        return this.initializationPromise || Promise.resolve();
    }

    // Mark as initializing SYNCHRONOUSLY before ANY async work
    this.isInitializing = true;

    // Create and store promise SYNCHRONOUSLY
    this.initializationPromise = this.doInitializeBrowserView();
    return this.initializationPromise;
}

private async doInitializeBrowserView(): Promise<void> {
    try {
        // ... actual async initialization ...
    } finally {
        this.isInitializing = false;
    }
}
```

---

## Working Solution 2: Single Entry Point (RECOMMENDED)

Remove the call from `createEditor()` entirely:

```typescript
protected createEditor(parent: HTMLElement): void {
    // Create DOM elements ONLY
    this.container = document.createElement('div');
    // ... more DOM setup ...

    // NOTE: Browser view initialization is handled by setInput()
    // This ensures only ONE initialization happens per editor lifecycle
}

override async setInput(...): Promise<void> {
    // ... setup ...

    if (!this.browserViewId) {
        await this.initializeBrowserView();  // ONLY call site
    }
}
```

**This is the cleaner solution** - no flags needed, no race possible.

---

## Why This Works

### VSCode Editor Lifecycle

```
┌─────────────────────────────────────────────────┐
│  1. createEditor(parent)                        │
│     - Called ONCE when editor first created     │
│     - Receives parent DOM element               │
│     - Should create DOM structure only          │
│     - Should NOT do async work                  │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  2. setInput(input, options, context, token)    │
│     - Called after createEditor                 │
│     - Also called on tab switch back!           │
│     - Receives the EditorInput                  │
│     - Safe place for async initialization       │
└─────────────────────────────────────────────────┘
```

By only initializing in `setInput()`:
- Single entry point = no race condition
- Works for both initial open AND tab switch back
- Follows VSCode's intended lifecycle

---

## Debugging Tips

### Logs That Revealed the Issue
```
[ProjectModeV2] Editor instance #1 created
[ProjectModeV2] Editor #1 DOM created
[ProjectModeV2] #1 Starting browser view initialization...  <- Call 1
[ProjectModeV2] #1 Starting browser view initialization...  <- Call 2!
[ProjectModeV2] #1 Browser view created: viewId=1
[ProjectModeV2] #1 Browser view created: viewId=2  <- TWO VIEWS!
```

### Instance Counter for Debugging
Added instance counter to track which editor is logging:

```typescript
private static instanceCounter = 0;
private readonly instanceId: number;

constructor(...) {
    this.instanceId = ++ProjectModeV2Editor.instanceCounter;
    this.logger.info(`[ProjectModeV2] Editor instance #${this.instanceId} created`);
}
```

---

## Key Learnings

1. **Async operations in createEditor() are dangerous** - Use setInput() instead
2. **Race conditions need SYNCHRONOUS guards** - Async checks don't work
3. **Single entry point is better than flags** - Simpler, no race possible
4. **Instance counters help debugging** - Know which editor is logging
5. **Promise reuse prevents duplicate work** - Second caller waits for first

---

## Related Documentation

- [Browser View Tab Switching](./BROWSER_VIEW_TAB_SWITCHING.md)
- [Browser View Ghost Process](./BROWSER_VIEW_GHOST_PROCESS.md)
