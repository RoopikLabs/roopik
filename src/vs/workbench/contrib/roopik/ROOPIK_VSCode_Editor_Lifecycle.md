# VSCode Editor Lifecycle Guide

> Understanding how VSCode manages editor tabs, inputs, and lifecycle events.

---

## Quick Reference

| Component | What It Is | Lifetime | Unique ID |
|-----------|-----------|----------|-----------|
| `EditorPane` | The UI/View | Per tab lifetime | `this.instanceId` |
| `EditorInput` | The Data/Model | Per tab lifetime | `this.instanceId` |
| `browserViewId` | Native browser | Per tab lifetime | From main process |

**Golden Rule:** `EditorPane.instanceId` NEVER changes for a tab. Use it to track your tab.

---

## Part 1: VSCode Editor Architecture

### The Two Main Classes

```
┌─────────────────────────────────────────────────────────────┐
│                         TAB                                  │
│                                                              │
│   ┌──────────────────┐        ┌──────────────────┐          │
│   │   EditorInput    │        │   EditorPane     │          │
│   │   (Data/Model)   │ ─────► │   (UI/View)      │          │
│   │                  │        │                  │          │
│   │  • url           │        │  • container     │          │
│   │  • title         │        │  • toolbar       │          │
│   │  • pageTitle     │        │  • browser       │          │
│   │                  │        │                  │          │
│   └──────────────────┘        └──────────────────┘          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### EditorInput (Data/Model)

- **What:** Represents the "document" being edited
- **Contains:** URL, title, metadata
- **Analogy:** Like a file on disk (the data)

```typescript
class ProjectModeV2Input extends EditorInput {
    private _url: string;        // Browser URL
    private _pageTitle: string;  // Page title for tab
}
```

### EditorPane (UI/View)

- **What:** The visual editor that displays the input
- **Contains:** DOM elements, browser view, toolbar
- **Analogy:** Like the text editor window (the view)

```typescript
class ProjectModeV2Editor extends EditorPane {
    private container: HTMLElement;
    private browserViewId: number;
    private controlBar: BrowserControlBarV2;
}
```

---

## Part 2: Lifecycle Flow

### Complete Lifecycle Diagram

```
                    TAB OPENED
                        │
                        ▼
            ┌───────────────────────┐
            │    constructor()      │  EditorPane created
            │    (ONCE per tab)     │  instanceId assigned
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │    createEditor()     │  DOM created
            │    (ONCE per tab)     │  Container, toolbar setup
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │     setInput()        │  ◄─── Called EVERY tab switch!
            │  (MULTIPLE times)     │  Input provided, render content
            └───────────┬───────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
            ▼                       ▼
    ┌───────────────┐       ┌───────────────┐
    │ TAB SWITCHED  │       │  TAB CLOSED   │
    │    AWAY       │       │               │
    └───────┬───────┘       └───────┬───────┘
            │                       │
            ▼                       ▼
    ┌───────────────┐       ┌───────────────┐
    │  setVisible   │       │ input.        │
    │   (false)     │       │ onWillDispose │
    └───────┬───────┘       └───────┬───────┘
            │                       │
            ▼                       ▼
    ┌───────────────┐       ┌───────────────┐
    │  clearInput() │       │   dispose()   │
    │  (HIDE only)  │       │  (DESTROY)    │
    └───────┬───────┘       └───────────────┘
            │
            ▼
    ┌───────────────┐
    │ TAB SWITCHED  │
    │    BACK       │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │  setVisible   │
    │   (true)      │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │  setInput()   │  ◄─── Called AGAIN!
    │  (same input) │
    └───────────────┘
```

### Method Details

#### `constructor()` - Called ONCE
```typescript
constructor(group: IEditorGroup, ...) {
    super(...);
    this.instanceId = ++EditorCounter;  // Unique, never changes!
    // Initialize services
}
```
**When:** Tab is first created
**Do:** Initialize services, set instance ID

---

#### `createEditor(parent)` - Called ONCE
```typescript
protected createEditor(parent: HTMLElement): void {
    this.container = document.createElement('div');
    parent.appendChild(this.container);
    // Setup toolbar, placeholders, etc.
}
```
**When:** After constructor, before first setInput
**Do:** Create DOM structure (container, toolbar, placeholder)

---

#### `setInput(input)` - Called MULTIPLE TIMES ⚠️
```typescript
override async setInput(input: EditorInput, ...): Promise<void> {
    await super.setInput(input, ...);

    // ⚠️ This runs on EVERY tab switch back!
    // Don't re-initialize things that already exist!

    if (!this.browserViewId) {
        // First time only - create browser
        await this.initializeBrowserView();
    } else {
        // Tab switch back - just restore visibility
        this.restoreVisibility();
    }
}
```
**When:**
- First time tab opens
- Every time you switch BACK to this tab
**Do:**
- First time: Initialize resources
- Subsequent: Restore visibility only

---

#### `setVisible(visible)` - Called on tab switch
```typescript
override setVisible(visible: boolean): void {
    super.setVisible(visible);

    if (visible) {
        // Tab is now active - show browser
        this.browserService.setBrowserVisible(this.browserViewId, true);
    } else {
        // Tab hidden - hide browser (don't destroy!)
        this.browserService.setBrowserVisible(this.browserViewId, false);
    }
}
```
**When:** Tab becomes visible/hidden
**Do:** Show/hide resources (DON'T destroy!)

---

#### `clearInput()` - Called when switching away ⚠️
```typescript
override clearInput(): void {
    super.clearInput();

    // ⚠️ DO NOT destroy browser here!
    // This is called when switching tabs, not closing!

    // Only HIDE, don't destroy
    this.browserService.setBrowserVisible(this.browserViewId, false);
}
```
**When:** Switching to another tab (NOT closing!)
**Do:** Hide resources, preserve state

---

#### `dispose()` - Called when tab TRULY closes
```typescript
override dispose(): void {
    // NOW we destroy everything
    this.destroyBrowserNow();
    super.dispose();
}
```
**When:** Tab is closed (X button, Ctrl+W)
**Do:** Destroy all resources

---

## Part 3: The Tab Close Detection Problem

### The Challenge

VSCode doesn't have a simple "onTabClosed" event. Instead:

| Method | When Called | Should Destroy? |
|--------|-------------|-----------------|
| `clearInput()` | Tab switch away | ❌ NO |
| `clearInput()` | Tab closing | ❌ NO (too early) |
| `dispose()` | Tab closed | ✅ YES |

**Problem:** `clearInput()` is called for BOTH switching and closing!

### The Solution: `input.onWillDispose`

```typescript
// EditorInput has an event that fires when IT is disposed
// This happens when the tab is TRULY closed

input.onWillDispose(() => {
    // Tab is closing for real!
    this.destroyBrowserNow();
});
```

### Flow Comparison

**Tab Switch (don't destroy):**
```
setVisible(false) → clearInput() → [tab hidden]
                                        │
                                        ▼ (switch back)
                                   setInput() → setVisible(true)
```

**Tab Close (destroy):**
```
setVisible(false) → clearInput() → input.onWillDispose → dispose()
                                          │
                                          ▼
                                   destroyBrowserNow()
```

---

## Part 4: Event Listeners & Registration

### VSCode's Event Pattern

```typescript
// Emitter (fires events)
private readonly _onWillDispose = new Emitter<void>();
public readonly onWillDispose: Event<void> = this._onWillDispose.event;

// Listener (receives events)
input.onWillDispose(() => {
    // This function runs when event fires
});
```

### The `_register()` Pattern

```typescript
// ❌ BAD - Memory leak!
input.onWillDispose(() => { ... });
// If we forget to dispose, listener stays forever

// ✅ GOOD - Auto cleanup
this._register(input.onWillDispose(() => { ... }));
// Listener is disposed when EditorPane is disposed
```

### Key Events

| Event | Source | Fires When |
|-------|--------|------------|
| `onWillDispose` | EditorInput | Tab closing |
| `onDidChangeLabel` | EditorInput | Title changed |
| `onNavigationStateChanged` | IPC | Browser navigated |
| `onDevToolsClosed` | IPC | DevTools closed |

---

## Part 5: Common Pitfalls & Solutions

### Pitfall 1: Duplicate Listener Registration

```typescript
// ❌ BAD - setInput called multiple times!
setInput(input) {
    input.onWillDispose(() => { ... });  // Registered again!
    input.onWillDispose(() => { ... });  // And again!
}
```

**Solution:** Track which input you registered for:

```typescript
// ✅ GOOD
private registeredInputForDispose: ProjectModeV2Input | undefined;

setInput(input) {
    if (this.registeredInputForDispose !== input) {
        this.registeredInputForDispose = input;
        this._register(input.onWillDispose(() => { ... }));
    }
}
```

### Pitfall 2: Destroying on clearInput

```typescript
// ❌ BAD - Destroys when just switching tabs!
clearInput() {
    this.destroyBrowser();
}
```

**Solution:** Only hide in clearInput, destroy on dispose:

```typescript
// ✅ GOOD
clearInput() {
    this.browserService.setBrowserVisible(this.browserViewId, false);
}

dispose() {
    this.destroyBrowserNow();
}
```

### Pitfall 3: Re-initializing on setInput

```typescript
// ❌ BAD - Creates new browser every tab switch!
setInput(input) {
    await this.createBrowser();
}
```

**Solution:** Check if already initialized:

```typescript
// ✅ GOOD
setInput(input) {
    if (!this.browserViewId) {
        await this.createBrowser();  // First time only
    } else {
        this.restoreVisibility();    // Subsequent times
    }
}
```

### Pitfall 4: Wrong `matches()` Implementation

```typescript
// ❌ BAD - All inputs "match", VSCode reuses editors wrong
matches(other: EditorInput): boolean {
    return other instanceof ProjectModeV2Input;
}
```

**Solution:** Use unique instance ID:

```typescript
// ✅ GOOD
private static instanceCounter = 0;
private readonly instanceId: number;

constructor() {
    this.instanceId = ++ProjectModeV2Input.instanceCounter;
}

matches(other: EditorInput): boolean {
    if (other instanceof ProjectModeV2Input) {
        return this.instanceId === other.instanceId;
    }
    return false;
}
```

---

## Part 6: Roopik Implementation

### Our Classes

```
ProjectModeV2Input (EditorInput)     ProjectModeV2Editor (EditorPane)
├── instanceId (unique)              ├── instanceId (unique)
├── _url                             ├── browserViewId
├── _pageTitle                       ├── container
├── matches()                        ├── controlBar
├── setUrl()                         ├── registeredInputForDispose
├── setPageTitle()                   ├── setInput()
└── onWillDispose (inherited)        ├── clearInput()
                                     ├── dispose()
                                     └── destroyBrowserNow()
```

### Our Lifecycle Implementation

```typescript
class ProjectModeV2Editor extends EditorPane {

    // Unique ID that NEVER changes
    private readonly instanceId: number;

    // Track which input we've registered dispose listener for
    private registeredInputForDispose: ProjectModeV2Input | undefined;

    // Browser view ID (only set once per tab)
    private browserViewId: number | undefined;

    override async setInput(input: EditorInput, ...): Promise<void> {
        await super.setInput(input, ...);

        if (input instanceof ProjectModeV2Input) {
            // 1. Register dispose listener (once per input)
            if (this.registeredInputForDispose !== input) {
                this.registeredInputForDispose = input;
                this._register(input.onWillDispose(() => {
                    this.destroyBrowserNow();  // Tab closing!
                }));
            }

            // 2. Initialize or restore
            if (!this.browserViewId) {
                await this.initializeBrowserView();  // First time
            } else {
                this.restoreVisibility();            // Tab switch back
            }
        }
    }

    override clearInput(): void {
        super.clearInput();
        // ONLY hide - don't destroy!
        this.browserService.setBrowserVisible(this.browserViewId, false);
    }

    override dispose(): void {
        // Destroy if not already destroyed by onWillDispose
        if (this.browserViewId) {
            this.destroyBrowserNow();
        }
        super.dispose();
    }

    private destroyBrowserNow(): void {
        const id = this.browserViewId;
        this.browserViewId = undefined;  // Prevent double destroy
        this.browserService.destroyBrowserView(id);
    }
}
```

---

## Part 7: Quick Checklist

### When Creating a New Editor

- [ ] Add unique `instanceId` to both Input and Editor
- [ ] Implement `matches()` using `instanceId`
- [ ] Track `registeredInputForDispose` to avoid duplicate listeners
- [ ] In `setInput()`: Check if already initialized before creating resources
- [ ] In `clearInput()`: Only HIDE, never destroy
- [ ] In `dispose()`: Destroy all resources
- [ ] Use `input.onWillDispose` for reliable close detection
- [ ] Always use `this._register()` for event listeners

### Debugging Tips

```typescript
// Add instance ID to all logs
this.logger.info(`[Editor] #${this.instanceId} setInput called`);

// Log when input changes (should be rare)
if (this.registeredInputForDispose !== input) {
    this.logger.warn(`[Editor] #${this.instanceId} ⚠️ INPUT CHANGED!`);
}

// Log lifecycle events
this.logger.info(`[Editor] #${this.instanceId} clearInput - HIDING`);
this.logger.info(`[Editor] #${this.instanceId} dispose - DESTROYING`);
```

---

## Part 8: Proper Disposal on Tab Close

### The Correct Pattern

```typescript
class MyEditor extends EditorPane {

    // 1. Track resources that need cleanup
    private browserViewId: number | undefined;
    private floatingToolbarId: number | undefined;
    private resizeObserver: ResizeObserver | undefined;

    // 2. Track which input we registered for (avoid duplicates)
    private registeredInputForDispose: MyInput | undefined;

    // 3. In setInput - register dispose listener ONCE per input
    override async setInput(input: EditorInput, ...): Promise<void> {
        await super.setInput(input, ...);

        if (input instanceof MyInput) {
            // Only register if we haven't for THIS input
            if (this.registeredInputForDispose !== input) {
                this.registeredInputForDispose = input;

                // This fires when tab is TRULY closed
                this._register(input.onWillDispose(() => {
                    this.destroyAllResources();
                }));
            }
        }
    }

    // 4. clearInput - ONLY HIDE, never destroy!
    override clearInput(): void {
        super.clearInput();
        // Hide but preserve state
        if (this.browserViewId) {
            this.browserService.setBrowserVisible(this.browserViewId, false);
        }
    }

    // 5. dispose - Final cleanup (backup, may already be destroyed)
    override dispose(): void {
        // Clean up non-registered resources
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;

        // Destroy if not already done by onWillDispose
        if (this.browserViewId) {
            this.destroyAllResources();
        }

        super.dispose();  // Always call super!
    }

    // 6. Centralized destroy method
    private destroyAllResources(): void {
        // Prevent double destruction
        if (!this.browserViewId) {
            return;
        }

        const browserId = this.browserViewId;
        const toolbarId = this.floatingToolbarId;

        // Clear IDs FIRST (prevents re-entry)
        this.browserViewId = undefined;
        this.floatingToolbarId = undefined;

        // Now destroy
        this.browserService.destroyBrowserView(browserId);
        if (toolbarId) {
            this.browserService.destroyOverlayView(toolbarId);
        }

        // Publish event for other components
        this.eventService.publish('browser.destroyed', {
            browserViewId: browserId
        });
    }
}
```

### Disposal Order of Operations

```
TAB CLOSE CLICKED
        │
        ▼
┌───────────────────────────────────────┐
│  1. input.onWillDispose fires         │
│     └─► destroyAllResources()         │  ◄── Main cleanup here!
│         ├─ Clear IDs (prevent double) │
│         ├─ Destroy browser view       │
│         ├─ Destroy overlays           │
│         └─ Publish events             │
└───────────────────┬───────────────────┘
                    │
                    ▼
┌───────────────────────────────────────┐
│  2. dispose() called by VSCode        │
│     └─► Check if already destroyed    │
│         ├─ If yes: skip               │
│         └─ If no: destroyAllResources │
└───────────────────────────────────────┘
```

### Why Double Protection?

```typescript
// onWillDispose fires first (reliable)
input.onWillDispose(() => {
    this.destroyAllResources();  // ← Primary cleanup
});

// dispose() is backup (always called)
dispose() {
    if (this.browserViewId) {
        this.destroyAllResources();  // ← Backup if onWillDispose missed
    }
    super.dispose();
}
```

**Why both?**
- `onWillDispose` = Fires early, reliable for tab close
- `dispose()` = Always called, catches edge cases

### Preventing Double Destruction

```typescript
private destroyAllResources(): void {
    // Check if already destroyed
    if (!this.browserViewId) {
        this.logger.info('Already destroyed, skipping');
        return;
    }

    // Clear ID BEFORE async operations
    const id = this.browserViewId;
    this.browserViewId = undefined;  // ← Prevents re-entry!

    // Now safe to destroy
    this.browserService.destroyBrowserView(id);
}
```

### What to Clean Up

| Resource Type | How to Clean Up |
|--------------|-----------------|
| Browser view | `browserService.destroyBrowserView(id)` |
| Overlay views | `browserService.destroyOverlayView(id)` |
| ResizeObserver | `observer.disconnect()` |
| Event listeners | Auto-cleaned by `_register()` |
| DOM elements | Cleaned by VSCode |
| Intervals/Timeouts | `clearInterval()` / `clearTimeout()` |

### Common Mistakes

```typescript
// ❌ WRONG: Destroying in clearInput
clearInput() {
    this.destroyBrowser();  // NO! This runs on tab switch!
}

// ❌ WRONG: Not preventing double destroy
destroyAllResources() {
    this.browserService.destroyBrowserView(this.browserViewId);
    // If called twice, crashes!
}

// ❌ WRONG: Forgetting to call super.dispose()
dispose() {
    this.destroyAllResources();
    // Missing super.dispose()! Memory leak!
}

// ❌ WRONG: Not using _register() for listeners
setInput(input) {
    input.onWillDispose(() => { ... });  // Memory leak!
}
```

### Correct Implementation

```typescript
// ✅ CORRECT: Full proper disposal
class MyEditor extends EditorPane {
    private browserViewId: number | undefined;
    private registeredInputForDispose: MyInput | undefined;

    setInput(input) {
        if (this.registeredInputForDispose !== input) {
            this.registeredInputForDispose = input;
            this._register(input.onWillDispose(() => {  // ✅ _register
                this.destroyAllResources();
            }));
        }
    }

    clearInput() {
        super.clearInput();
        this.hideResources();  // ✅ Only hide
    }

    dispose() {
        if (this.browserViewId) {
            this.destroyAllResources();  // ✅ Backup
        }
        super.dispose();  // ✅ Always call super
    }

    private destroyAllResources() {
        if (!this.browserViewId) return;  // ✅ Prevent double

        const id = this.browserViewId;
        this.browserViewId = undefined;  // ✅ Clear first

        this.browserService.destroyBrowserView(id);  // ✅ Then destroy
    }
}
```

---

## Summary

| What | Never Changes | May Change |
|------|---------------|------------|
| `EditorPane` instance | ✅ | - |
| `EditorPane.instanceId` | ✅ | - |
| `EditorInput` instance | Usually ✅ | Rarely |
| `EditorInput.instanceId` | ✅ | - |
| `browserViewId` | ✅ (after init) | - |

**Key Takeaways:**

1. `setInput()` is called on EVERY tab switch - don't re-initialize!
2. `clearInput()` means "hide" not "close" - don't destroy!
3. Use `input.onWillDispose` for reliable close detection
4. Track which input you registered listeners for
5. Always use `_register()` for automatic cleanup
6. Use unique `instanceId` in `matches()` for proper tab isolation

---

## Part 9: EditorInputCapabilities & Preventing Split Duplication

### The Split Mode Problem

When you "split" a tab in VSCode (drag to side, or Ctrl+\):

```
BEFORE SPLIT:                    AFTER SPLIT:
┌────────────────────────┐       ┌───────────┬───────────┐
│                        │       │           │           │
│     EditorPane A       │  ───► │ EditorPane│ EditorPane│
│     (Input X)          │       │     A     │     B     │
│                        │       │ (Input X) │ (Input X) │
└────────────────────────┘       └───────────┴───────────┘
```

**Problem:** Two EditorPanes now share the SAME EditorInput!

For browser tabs, this causes:
- Two browser views trying to use same state
- Title changes affect both tabs
- Close one → other becomes broken
- Resource conflicts

### EditorInputCapabilities

VSCode provides `EditorInputCapabilities` to control editor behavior:

```typescript
enum EditorInputCapabilities {
    None = 0,                  // No special capabilities
    Readonly = 1 << 0,         // Read-only content
    Untitled = 1 << 1,         // No saved location
    RequiresTrust = 1 << 2,    // Needs workspace trust
    Singleton = 1 << 3,        // Cannot be split! ⬅️
    // ... more capabilities
}
```

### The Singleton Solution

Add `Singleton` capability to prevent split duplication:

```typescript
import { EditorInputCapabilities } from '../../../../common/editor.js';

class ProjectModeV2Input extends EditorInput {

    /**
     * Singleton capability prevents this editor from being split.
     * Users can create multiple independent browser tabs from the Welcome Screen,
     * but cannot duplicate an existing browser tab via split mode.
     */
    override get capabilities(): EditorInputCapabilities {
        return EditorInputCapabilities.Singleton;
    }
}
```

### What Happens Now?

**Before (without Singleton):**
```
User drags tab to split
        │
        ▼
┌───────────────────────────────────┐
│ VSCode creates new EditorPane     │
│ SHARES the same EditorInput       │
│ Two views = PROBLEMS              │
└───────────────────────────────────┘
```

**After (with Singleton):**
```
User drags tab to split
        │
        ▼
┌───────────────────────────────────┐
│ VSCode MOVES the tab instead      │
│ Single EditorPane, Single Input   │
│ No duplication = SAFE             │
└───────────────────────────────────┘
```

### How to Allow Multiple Independent Tabs

Singleton prevents DUPLICATION, not CREATION.

Users can still have multiple browser tabs by creating NEW instances:

```typescript
// Welcome Screen - Create new independent browser tab
const newBrowserInput = new ProjectModeV2Input('http://localhost:5173');
await editorService.openEditor(newBrowserInput);

// Each instance has unique instanceId
// No shared state, completely independent
```

```
CREATE NEW (allowed):              SPLIT (blocked):
┌──────────────────────┐           ┌───────────────────────┐
│  New ProjectModeV2   │           │  Existing Browser Tab │
│       Input          │           │                       │
│  (instanceId: 1)     │           │  Can't split this!    │
└──────────┬───────────┘           │  Singleton prevents   │
           │                       │  duplication          │
           ▼                       └───────────────────────┘
┌──────────────────────┐
│  New ProjectModeV2   │
│       Input          │
│  (instanceId: 2)     │  ← Completely independent!
└──────────────────────┘
```

### Combining Capabilities

You can combine multiple capabilities using bitwise OR:

```typescript
override get capabilities(): EditorInputCapabilities {
    return EditorInputCapabilities.Singleton | EditorInputCapabilities.Readonly;
}
```

### Available Capabilities

| Capability | Meaning | Use Case |
|-----------|---------|----------|
| `None` | Default behavior | Normal editors |
| `Readonly` | Cannot be edited | Preview tabs |
| `Untitled` | No save location | New unsaved files |
| `RequiresTrust` | Needs trust | External code |
| `Singleton` | Cannot split | Browser views, unique resources |
| `Scratchpad` | Temporary | Quick notes |
| `CanDropIntoEditor` | Accept drops | Drag-drop targets |

### Our Implementation

```typescript
// projectModeV2Input.ts
export class ProjectModeV2Input extends EditorInput {
    static readonly ID = 'roopik.projectModeV2Input';

    // Unique instance tracking
    private static instanceCounter = 0;
    private readonly instanceId: number;

    constructor(url: string = 'about:blank') {
        super();
        this._url = url;
        this.instanceId = ++ProjectModeV2Input.instanceCounter;
    }

    override get typeId(): string {
        return ProjectModeV2Input.ID;
    }

    /**
     * Singleton capability prevents this editor from being split.
     * Users can create multiple independent browser tabs from the Welcome Screen,
     * but cannot duplicate an existing browser tab via split mode.
     */
    override get capabilities(): EditorInputCapabilities {
        return EditorInputCapabilities.Singleton;
    }

    // Each instance matches only itself (by instanceId)
    override matches(other: EditorInput): boolean {
        if (other instanceof ProjectModeV2Input) {
            return this.instanceId === other.instanceId;
        }
        return false;
    }
}
```

### Checklist for Singleton Editors

- [ ] Import `EditorInputCapabilities` from `'../../../../common/editor.js'`
- [ ] Override `get capabilities()` to return `EditorInputCapabilities.Singleton`
- [ ] Ensure unique `instanceId` for each input instance
- [ ] Implement `matches()` using `instanceId` comparison
- [ ] Provide a way to CREATE new instances (Welcome Screen, command, etc.)

---

*Last updated: November 2025*
*Related: [ROOPIK_Services_EVENT_DRIVEN_ARCHITECTURE.md](./ROOPIK_Services_EVENT_DRIVEN_ARCHITECTURE.md)*
