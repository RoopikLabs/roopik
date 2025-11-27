# Roopik Services Architecture

> **Design Document v1.0**
> Last Updated: November 2025

---

## Overview

Roopik uses a **Hybrid Event-Driven Architecture** with two core services:

1. **Event Service** - Real-time pub/sub for live communication
2. **Settings Service** - Persistence, state queries, and configuration management

These services are **independent but interconnected** - changes in settings trigger events, and events can trigger settings updates.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MAIN PROCESS                                    │
│                           (electron-main/)                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ BrowserView     │  │ Canvas          │  │ Other           │             │
│  │ ServiceV2       │  │ Service         │  │ Services        │             │
│  │                 │  │ (future)        │  │                 │             │
│  │ - creates       │  │ - creates       │  │                 │             │
│  │ - destroys      │  │ - adds          │  │                 │             │
│  │ - navigates     │  │ - removes       │  │                 │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                          IPC Channel                                        │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            RENDERER PROCESS                                  │
│                              (browser/)                                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    IRoopikEventService                               │   │
│  │                    (Central Event Bus)                               │   │
│  │                                                                      │   │
│  │  Topics:                                                             │   │
│  │  ├── browser.created, browser.destroyed, browser.navigated          │   │
│  │  ├── canvas.created, canvas.destroyed                               │   │
│  │  ├── component.added, component.removed, component.updated          │   │
│  │  ├── settings.changed                                               │   │
│  │  └── agent.actionStarted, agent.actionCompleted                     │   │
│  │                                                                      │   │
│  │  Methods:                                                            │   │
│  │  ├── publish(topic, data)      → Fire event to all subscribers      │   │
│  │  ├── subscribe(topic, handler) → Listen to specific topic           │   │
│  │  └── subscribeAll(handler)     → Listen to ALL events (for AI/debug)│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ Events flow down                       │
│           ┌────────────────────────┼────────────────────────┐              │
│           │                        │                        │              │
│           ▼                        ▼                        ▼              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Welcome Screen │    │  Activity Panel │    │  Browser Editor │        │
│  │                 │    │                 │    │                 │        │
│  │  Subscribes to: │    │  Subscribes to: │    │  Subscribes to: │        │
│  │  - browser.*    │    │  - browser.*    │    │  - settings.*   │        │
│  │  - canvas.*     │    │  - canvas.*     │    │  - browser.*    │        │
│  │  - settings.*   │    │  - component.*  │    │    (own ID)     │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   IRoopikSettingsService                             │   │
│  │                   (Persistence + State)                              │   │
│  │                                                                      │   │
│  │  App Settings (User Profile):          Workspace Settings (.roopik/):│   │
│  │  ├── general.showWelcomeOnStartup     ├── browser.bookmarks         │   │
│  │  ├── browser.maxInstances             ├── browser.lastUrls          │   │
│  │  ├── browser.defaultDevToolsMode      ├── canvas.layouts            │   │
│  │  └── appearance.theme                 └── project.devServerUrl      │   │
│  │                                                                      │   │
│  │  Methods:                                                            │   │
│  │  ├── getAppSetting(key) / setAppSetting(key, value)                 │   │
│  │  ├── getWorkspaceSetting(key) / setWorkspaceSetting(key, value)     │   │
│  │  ├── getBrowsers() → Current browser state                          │   │
│  │  ├── getCanvases() → Current canvas state                           │   │
│  │  └── onDidChangeSettings → Event fired on any setting change        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/vs/workbench/contrib/roopik/
│
├── common/
│   │
│   ├── events/
│   │   ├── roopikEventService.ts       # Interface + Implementation
│   │   │   - IRoopikEventService       # Service interface (DI decorator)
│   │   │   - RoopikEventService        # Implementation class
│   │   │   - publish(), subscribe(), subscribeAll()
│   │   │   - Typed event accessors (onBrowserCreated, etc.)
│   │   │
│   │   └── roopikEventTypes.ts         # Event definitions
│   │       - RoopikEventTopic          # Union type of all topics
│   │       - BrowserCreatedEvent       # Payload interfaces
│   │       - BrowserDestroyedEvent
│   │       - CanvasCreatedEvent
│   │       - SettingsChangedEvent
│   │       - ... (all event payloads)
│   │
│   ├── settings/
│   │   ├── roopikSettingsService.ts    # Interface + Implementation
│   │   │   - IRoopikSettingsService    # Service interface (DI decorator)
│   │   │   - RoopikSettingsService     # Implementation class
│   │   │   - App settings (get/set)
│   │   │   - Workspace settings (get/set)
│   │   │   - State queries (getBrowsers, getCanvases)
│   │   │
│   │   ├── roopikSettingsTypes.ts      # Settings schema
│   │   │   - RoopikAppSettings         # App-wide settings interface
│   │   │   - RoopikWorkspaceSettings   # Workspace settings interface
│   │   │   - AppSettingKey             # Type-safe keys
│   │   │   - WorkspaceSettingKey       # Type-safe keys
│   │   │
│   │   └── roopikSettingsDefaults.ts   # Default values
│   │       - DEFAULT_APP_SETTINGS
│   │       - DEFAULT_WORKSPACE_SETTINGS
│   │
│   └── roopik.ts                       # Existing (unchanged)
│
├── browser/
│   │
│   └── roopik.contribution.ts          # Service registration
│       - registerSingleton(IRoopikEventService, ...)
│       - registerSingleton(IRoopikSettingsService, ...)
│
└── electron-main/
    └── ... (existing - publishes events via IPC)
```

---

## Service Interfaces

### IRoopikEventService

```typescript
// common/events/roopikEventService.ts

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { RoopikEventTopic, /* event types */ } from './roopikEventTypes';

export const IRoopikEventService = createDecorator<IRoopikEventService>('roopikEventService');

export interface IRoopikEventService {
  readonly _serviceBrand: undefined;

  // ============================================
  // Generic Pub/Sub (Flexible)
  // ============================================

  /**
   * Publish an event to all subscribers
   */
  publish<T>(topic: RoopikEventTopic, data: T): void;

  /**
   * Subscribe to a specific event topic
   * @returns Disposable to unsubscribe
   */
  subscribe<T>(topic: RoopikEventTopic, handler: (data: T) => void): IDisposable;

  /**
   * Subscribe to ALL events (useful for AI agents, debugging, logging)
   * @returns Disposable to unsubscribe
   */
  subscribeAll(handler: (topic: RoopikEventTopic, data: unknown) => void): IDisposable;

  // ============================================
  // Typed Events (Type-safe convenience)
  // ============================================

  // Browser events
  readonly onBrowserCreated: Event<BrowserCreatedEvent>;
  readonly onBrowserDestroyed: Event<BrowserDestroyedEvent>;
  readonly onBrowserNavigated: Event<BrowserNavigatedEvent>;
  readonly onBrowserTitleChanged: Event<BrowserTitleChangedEvent>;

  // Canvas events (future)
  readonly onCanvasCreated: Event<CanvasCreatedEvent>;
  readonly onCanvasDestroyed: Event<CanvasDestroyedEvent>;

  // Component events (future)
  readonly onComponentAdded: Event<ComponentAddedEvent>;
  readonly onComponentRemoved: Event<ComponentRemovedEvent>;
  readonly onComponentUpdated: Event<ComponentUpdatedEvent>;

  // Settings events
  readonly onSettingsChanged: Event<SettingsChangedEvent>;

  // Agent events (future)
  readonly onAgentActionStarted: Event<AgentActionStartedEvent>;
  readonly onAgentActionCompleted: Event<AgentActionCompletedEvent>;
}
```

### IRoopikSettingsService

```typescript
// common/settings/roopikSettingsService.ts

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import {
  AppSettingKey,
  WorkspaceSettingKey,
  RoopikAppSettings,
  RoopikWorkspaceSettings,
  SettingsChangedEvent
} from './roopikSettingsTypes';

export const IRoopikSettingsService = createDecorator<IRoopikSettingsService>('roopikSettingsService');

export interface IRoopikSettingsService {
  readonly _serviceBrand: undefined;

  // ============================================
  // App Settings (User Profile - Global)
  // Stored in VSCode's StorageService
  // ============================================

  /**
   * Get an app-wide setting
   */
  getAppSetting<K extends AppSettingKey>(key: K): RoopikAppSettings[K];

  /**
   * Set an app-wide setting
   * Triggers onDidChangeSettings event
   */
  setAppSetting<K extends AppSettingKey>(key: K, value: RoopikAppSettings[K]): Promise<void>;

  /**
   * Get all app settings
   */
  getAllAppSettings(): RoopikAppSettings;

  // ============================================
  // Workspace Settings (.roopik/config.json)
  // Stored in workspace folder
  // ============================================

  /**
   * Get a workspace-specific setting
   */
  getWorkspaceSetting<K extends WorkspaceSettingKey>(key: K): RoopikWorkspaceSettings[K];

  /**
   * Set a workspace-specific setting
   * Triggers onDidChangeSettings event
   */
  setWorkspaceSetting<K extends WorkspaceSettingKey>(key: K, value: RoopikWorkspaceSettings[K]): Promise<void>;

  /**
   * Get all workspace settings
   */
  getAllWorkspaceSettings(): RoopikWorkspaceSettings;

  // ============================================
  // State Queries (Current State for Initial Load)
  // ============================================

  /**
   * Get current browser instances
   * Used for initial load of welcome screen, activity panel, etc.
   */
  getBrowsers(): Promise<BrowserInfo[]>;

  /**
   * Get browser count
   */
  getBrowserCount(): Promise<number>;

  /**
   * Check if can create new browser
   */
  canCreateBrowser(): Promise<boolean>;

  /**
   * Get current canvases (future)
   */
  getCanvases(): Promise<CanvasInfo[]>;

  // ============================================
  // Events
  // ============================================

  /**
   * Fired when any setting changes
   * Also publishes to IRoopikEventService for cross-service communication
   */
  readonly onDidChangeSettings: Event<SettingsChangedEvent>;
}
```

---

## Event Types

```typescript
// common/events/roopikEventTypes.ts

// ============================================
// Event Topics (Extensible)
// ============================================

export type RoopikEventTopic =
  // Browser events
  | 'browser.created'
  | 'browser.destroyed'
  | 'browser.navigated'
  | 'browser.titleChanged'
  | 'browser.loadingStarted'
  | 'browser.loadingFinished'

  // Canvas events
  | 'canvas.created'
  | 'canvas.destroyed'
  | 'canvas.renamed'

  // Component events
  | 'component.added'
  | 'component.removed'
  | 'component.updated'
  | 'component.selected'

  // Settings events
  | 'settings.changed'

  // Agent events
  | 'agent.actionStarted'
  | 'agent.actionCompleted'
  | 'agent.error';

// ============================================
// Event Payloads
// ============================================

// Browser Events
export interface BrowserCreatedEvent {
  browserViewId: number;
  windowId: number;
  timestamp: number;
}

export interface BrowserDestroyedEvent {
  browserViewId: number;
  timestamp: number;
}

export interface BrowserNavigatedEvent {
  browserViewId: number;
  url: string;
  title: string;
  timestamp: number;
}

export interface BrowserTitleChangedEvent {
  browserViewId: number;
  title: string;
  timestamp: number;
}

// Canvas Events
export interface CanvasCreatedEvent {
  canvasId: string;
  name: string;
  timestamp: number;
}

export interface CanvasDestroyedEvent {
  canvasId: string;
  timestamp: number;
}

// Component Events
export interface ComponentAddedEvent {
  canvasId: string;
  componentId: string;
  componentType: string;
  timestamp: number;
}

export interface ComponentRemovedEvent {
  canvasId: string;
  componentId: string;
  timestamp: number;
}

export interface ComponentUpdatedEvent {
  canvasId: string;
  componentId: string;
  changes: Record<string, unknown>;
  timestamp: number;
}

// Settings Events
export interface SettingsChangedEvent {
  scope: 'app' | 'workspace';
  key: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}

// Agent Events
export interface AgentActionStartedEvent {
  actionId: string;
  actionType: string;
  target: string;
  timestamp: number;
}

export interface AgentActionCompletedEvent {
  actionId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  timestamp: number;
}
```

---

## Settings Types

```typescript
// common/settings/roopikSettingsTypes.ts

// ============================================
// App Settings (User Profile - Global)
// ============================================

export interface RoopikAppSettings {
  // General
  'general.showWelcomeOnStartup': boolean;
  'general.telemetryEnabled': boolean;

  // Browser
  'browser.maxInstances': number;
  'browser.defaultDevToolsMode': 'attached' | 'detached';
  'browser.defaultUrl': string;

  // Appearance
  'appearance.theme': 'auto' | 'light' | 'dark';
  'appearance.showFloatingToolbar': boolean;

  // AI/Agent
  'agent.enabled': boolean;
  'agent.autoSuggest': boolean;
}

export type AppSettingKey = keyof RoopikAppSettings;

// ============================================
// Workspace Settings (.roopik/config.json)
// ============================================

export interface RoopikWorkspaceSettings {
  // Browser
  'browser.bookmarks': BookmarkItem[];
  'browser.lastUrls': string[];
  'browser.pinnedUrls': string[];

  // Canvas
  'canvas.layouts': CanvasLayout[];
  'canvas.defaultLayout': string;

  // Project
  'project.devServerUrl': string;
  'project.devServerPort': number;
  'project.framework': 'react' | 'vue' | 'svelte' | 'angular' | 'unknown';
}

export type WorkspaceSettingKey = keyof RoopikWorkspaceSettings;

// ============================================
// Supporting Types
// ============================================

export interface BookmarkItem {
  id: string;
  name: string;
  url: string;
  favicon?: string;
  createdAt: number;
}

export interface CanvasLayout {
  id: string;
  name: string;
  components: CanvasComponentLayout[];
  createdAt: number;
  updatedAt: number;
}

export interface CanvasComponentLayout {
  componentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserInfo {
  browserViewId: number;
  windowId: number;
  url: string;
  title: string;
  createdAt: number;
}

export interface CanvasInfo {
  canvasId: string;
  name: string;
  componentCount: number;
  createdAt: number;
}
```

---

## Default Settings

```typescript
// common/settings/roopikSettingsDefaults.ts

import { RoopikAppSettings, RoopikWorkspaceSettings } from './roopikSettingsTypes';

export const DEFAULT_APP_SETTINGS: RoopikAppSettings = {
  // General
  'general.showWelcomeOnStartup': true,
  'general.telemetryEnabled': false,

  // Browser
  'browser.maxInstances': 2,
  'browser.defaultDevToolsMode': 'attached',
  'browser.defaultUrl': 'about:blank',

  // Appearance
  'appearance.theme': 'auto',
  'appearance.showFloatingToolbar': true,

  // AI/Agent
  'agent.enabled': true,
  'agent.autoSuggest': true,
};

export const DEFAULT_WORKSPACE_SETTINGS: RoopikWorkspaceSettings = {
  // Browser
  'browser.bookmarks': [],
  'browser.lastUrls': [],
  'browser.pinnedUrls': [],

  // Canvas
  'canvas.layouts': [],
  'canvas.defaultLayout': '',

  // Project
  'project.devServerUrl': 'http://localhost:3000',
  'project.devServerPort': 3000,
  'project.framework': 'unknown',
};
```

---

## Usage Examples

### Example 1: Welcome Screen (Initial Load + Live Updates)

```typescript
class WelcomeEditor {
  constructor(
    @IRoopikEventService private eventService: IRoopikEventService,
    @IRoopikSettingsService private settingsService: IRoopikSettingsService
  ) {
    this.initialize();
  }

  private async initialize() {
    // 1. INITIAL LOAD - Get current state
    const browsers = await this.settingsService.getBrowsers();
    const bookmarks = this.settingsService.getWorkspaceSetting('browser.bookmarks');
    this.renderBrowsers(browsers);
    this.renderBookmarks(bookmarks);

    // 2. LIVE UPDATES - Subscribe to changes
    this._register(this.eventService.subscribe('browser.created', (e) => {
      this.addBrowserCard(e);
    }));

    this._register(this.eventService.subscribe('browser.destroyed', (e) => {
      this.removeBrowserCard(e.browserViewId);
    }));

    this._register(this.eventService.onSettingsChanged((e) => {
      if (e.key === 'browser.bookmarks') {
        this.renderBookmarks(e.newValue as BookmarkItem[]);
      }
    }));
  }
}
```

### Example 2: User Changes Setting

```typescript
// User clicks "Change DevTools to Detached"
class SettingsPanel {
  async onDevToolsModeChange(mode: 'attached' | 'detached') {
    // 1. Save setting
    await this.settingsService.setAppSetting('browser.defaultDevToolsMode', mode);

    // 2. Settings service automatically:
    //    - Saves to storage
    //    - Fires onDidChangeSettings
    //    - Publishes 'settings.changed' to event service

    // 3. All subscribers (browser editors, etc.) receive update and react
  }
}
```

### Example 3: AI Agent Subscribes to Everything

```typescript
class AIAgentService {
  constructor(@IRoopikEventService private eventService: IRoopikEventService) {
    // Subscribe to ALL events for full context awareness
    this._register(this.eventService.subscribeAll((topic, data) => {
      this.recordEvent(topic, data);
      this.updateContext(topic, data);

      // AI can react to any event
      if (topic === 'component.added') {
        this.suggestRelatedActions(data);
      }
    }));
  }
}
```

### Example 4: Browser Editor Reacts to Settings

```typescript
class BrowserEditor {
  private handleSettingsChange(event: SettingsChangedEvent) {
    if (event.key === 'browser.defaultDevToolsMode') {
      // React to DevTools mode change
      this.updateDevToolsMode(event.newValue as 'attached' | 'detached');
    }

    if (event.key === 'appearance.showFloatingToolbar') {
      // React to toolbar visibility change
      this.setFloatingToolbarVisible(event.newValue as boolean);
    }
  }
}
```

---

## Data Flow Diagrams

### Setting Change Flow

```
User Action                Settings Service              Event Service              Subscribers
    │                           │                            │                          │
    │  setAppSetting()          │                            │                          │
    │ ─────────────────────────►│                            │                          │
    │                           │                            │                          │
    │                           │  1. Save to storage        │                          │
    │                           │  ───────────────►          │                          │
    │                           │                            │                          │
    │                           │  2. Fire onDidChangeSettings│                         │
    │                           │  ─────────────────────────►│                          │
    │                           │                            │                          │
    │                           │  3. Publish 'settings.changed'                        │
    │                           │  ─────────────────────────►│                          │
    │                           │                            │                          │
    │                           │                            │  4. Notify subscribers   │
    │                           │                            │ ────────────────────────►│
    │                           │                            │                          │
    │                           │                            │                          │  5. React
    │                           │                            │                          │  (update UI,
    │                           │                            │                          │   change behavior)
```

### Browser Created Flow

```
Main Process               IPC Channel               Event Service              Subscribers
    │                           │                         │                          │
    │  createBrowserView()      │                         │                          │
    │  ─────────────────►       │                         │                          │
    │                           │                         │                          │
    │  Browser created          │                         │                          │
    │  ───────────────────────► │                         │                          │
    │                           │                         │                          │
    │                           │  'browser.created'      │                          │
    │                           │ ───────────────────────►│                          │
    │                           │                         │                          │
    │                           │                         │  Broadcast to all        │
    │                           │                         │ ────────────────────────►│
    │                           │                         │                          │
    │                           │                         │                   Welcome Screen: Add card
    │                           │                         │                   Activity Panel: Update count
    │                           │                         │                   AI Agent: Log context
```

---

## Design Principles

### 1. Independence
- Event Service and Settings Service are independent
- Either can work without the other
- No circular dependencies

### 2. Interconnection
- Settings changes trigger events
- Events can trigger settings updates
- Both services complement each other

### 3. Type Safety
- All events have typed payloads
- All settings have typed keys and values
- TypeScript catches errors at compile time

### 4. Fallback Strategy
- Events = Live updates (best case)
- State queries = Fallback (if events miss)
- Always query state on initial load
- Subscribe to events for live updates

### 5. Scalability
- Easy to add new event topics
- Easy to add new settings
- Services remain unchanged

### 6. Debugging
- `subscribeAll()` for logging all events
- Clear event naming (`domain.action`)
- Timestamps on all events

---

## Future Considerations

### Multi-Window Support
- Events should include `windowId` where relevant
- Settings service should handle per-window state if needed

### Persistence Strategy
- App settings: VSCode's StorageService (survives reinstall)
- Workspace settings: `.roopik/config.json` (version controlled)
- Session state: In-memory only (lost on restart)

### Performance
- Event handlers should be fast (< 16ms for UI updates)
- Heavy processing should be debounced/throttled
- Consider batching rapid events

---

## Implementation Order

1. **Phase 1: Event Service**
   - Create `roopikEventTypes.ts`
   - Create `roopikEventService.ts`
   - Register in `roopik.contribution.ts`
   - Test with browser events

2. **Phase 2: Settings Service**
   - Create `roopikSettingsTypes.ts`
   - Create `roopikSettingsDefaults.ts`
   - Create `roopikSettingsService.ts`
   - Register in `roopik.contribution.ts`
   - Implement `.roopik/config.json` handling

3. **Phase 3: Integration**
   - Wire up existing services to publish events
   - Update Welcome Screen to use both services
   - Update Activity Panel
   - Test end-to-end

---

## How to Add/Modify Events (Step-by-Step Guide)

This section provides a step-by-step guide for adding new events or modifying existing ones in the Roopik event system.

### Step 1: Define the Event Topic

**File:** `common/events/roopikEventTypes.ts`

Add your new event topic to the `RoopikEventTopic` union type:

```typescript
export type RoopikEventTopic =
  // Browser events
  | 'browser.created'
  | 'browser.destroyed'
  | 'browser.navigated'
  // ... existing events ...

  // Add your new event here (follow domain.action pattern)
  | 'browser.resized'  // ← NEW EVENT
```

### Step 2: Create the Event Payload Interface

**File:** `common/events/roopikEventTypes.ts`

Define a typed interface for your event's payload:

```typescript
/**
 * Fired when a browser view is resized
 */
export interface BrowserResizedEvent extends RoopikBaseEvent {
  browserViewId: number;
  width: number;
  height: number;
  // Note: timestamp is inherited from RoopikBaseEvent
}
```

**Important:** All events extend `RoopikBaseEvent` which includes `timestamp: number`.

### Step 3: Add to Event Map

**File:** `common/events/roopikEventTypes.ts`

Add the mapping in `RoopikEventMap` for type-safe publish/subscribe:

```typescript
export interface RoopikEventMap {
  // Browser
  'browser.created': BrowserCreatedEvent;
  'browser.destroyed': BrowserDestroyedEvent;
  'browser.navigated': BrowserNavigatedEvent;
  'browser.resized': BrowserResizedEvent;  // ← ADD HERE
  // ... rest of mappings
}
```

### Step 4: Add Typed Emitter (Optional but Recommended)

**File:** `common/events/roopikEventService.ts`

For type-safe subscriptions, add an emitter and accessor to the service:

```typescript
// In RoopikEventService class

// Add private emitter
private readonly _onBrowserResized = this._register(new Emitter<BrowserResizedEvent>());

// Add public accessor
public readonly onBrowserResized: Event<BrowserResizedEvent> = this._onBrowserResized.event;
```

### Step 5: Register in Emitter Map

**File:** `common/events/roopikEventService.ts`

Register the emitter in `initEmitterMap()` so `publish()` can fire it:

```typescript
private initEmitterMap(): void {
  // Browser events
  this.emitterMap.set('browser.created', this._onBrowserCreated);
  this.emitterMap.set('browser.destroyed', this._onBrowserDestroyed);
  this.emitterMap.set('browser.navigated', this._onBrowserNavigated);
  this.emitterMap.set('browser.resized', this._onBrowserResized);  // ← ADD HERE
  // ... rest of registrations
}
```

### Step 6: Publish the Event

**From any service or editor that needs to fire the event:**

```typescript
import { IRoopikEventService } from '../common/events/index.js';

class MyService {
  constructor(
    @IRoopikEventService private readonly eventService: IRoopikEventService
  ) {}

  private onBrowserResized(browserViewId: number, width: number, height: number) {
    // Add source log for debugging (optional but helpful)
    console.debug(`[MyService] Publishing browser.resized via EventService`);

    // Publish the event
    this.eventService.publish('browser.resized', {
      browserViewId,
      width,
      height,
      timestamp: Date.now()
    });
  }
}
```

### Step 7: Subscribe to the Event

**Option A: Type-safe subscription (recommended)**

```typescript
// Using typed event accessor
this._register(this.eventService.onBrowserResized((event) => {
  console.log(`Browser ${event.browserViewId} resized to ${event.width}x${event.height}`);
}));
```

**Option B: Generic subscription**

```typescript
// Using generic subscribe method
this._register(this.eventService.subscribe('browser.resized', (event: BrowserResizedEvent) => {
  console.log(`Browser ${event.browserViewId} resized to ${event.width}x${event.height}`);
}));
```

**Option C: Subscribe to all events (for AI/debugging)**

```typescript
// Subscribe to ALL events
this._register(this.eventService.subscribeAll((topic, data) => {
  if (topic === 'browser.resized') {
    const event = data as BrowserResizedEvent;
    // Handle event
  }
}));
```

---

### Modifying an Existing Event

To modify an existing event's payload:

1. **Update the interface** in `roopikEventTypes.ts`
2. **Update all publish calls** to include new fields
3. **Update subscribers** that need the new data

**Example: Adding a field to `BrowserNavigatedEvent`**

```typescript
// Before
export interface BrowserNavigatedEvent extends RoopikBaseEvent {
  browserViewId: number;
  url: string;
}

// After - adding 'isReload' field
export interface BrowserNavigatedEvent extends RoopikBaseEvent {
  browserViewId: number;
  url: string;
  isReload?: boolean;  // Optional for backwards compatibility
}
```

---

### Removing an Event

To remove an event:

1. Remove from `RoopikEventTopic` union type
2. Remove the payload interface
3. Remove from `RoopikEventMap`
4. Remove emitter and accessor from service
5. Remove from `initEmitterMap()`
6. Remove all publish calls
7. Remove all subscriptions

---

### Debugging Events

Add source logs when publishing to verify events flow through the centralized system:

```typescript
// In the publisher
this.logger.debug(`[ServiceName] Publishing ${topic} via EventService (key data here)`);
this.eventService.publish(topic, payload);
```

Use `subscribeAll()` to see all events:

```typescript
// Temporary debugging
this.eventService.subscribeAll((topic, data) => {
  console.log(`[EVENT] ${topic}:`, data);
});
```

---

### Naming Conventions

- **Topics:** Use `domain.action` format (e.g., `browser.created`, `canvas.renamed`)
- **Interfaces:** Use `DomainActionEvent` format (e.g., `BrowserCreatedEvent`, `CanvasRenamedEvent`)
- **Emitters:** Use `_onDomainAction` format (e.g., `_onBrowserCreated`)
- **Accessors:** Use `onDomainAction` format (e.g., `onBrowserCreated`)

---

*This document serves as the architectural reference for Roopik's event-driven architecture.*
