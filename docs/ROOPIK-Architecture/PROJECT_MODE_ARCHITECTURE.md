# Project Mode Architecture (Core Integration)

*Updated: December 2025 - VSCode Core Integration with Project Storage*

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Layers](#architecture-layers)
3. [Project Opening Flow](#project-opening-flow)
4. [Project Storage System](#project-storage-system)
5. [IPC Communication](#ipc-communication)
6. [File Structure](#file-structure)
7. [Service Registration](#service-registration)

---

## Overview

Project Mode (Mode 2) is Roopik's **browser preview with embedded DevTools** built natively into VSCode core. It provides:

- Real Chromium browser via `WebContentsView`
- Embedded DevTools with Device Toolbar
- Vite dev server management
- Click-to-source navigation
- CSS source mapping
- **Recent Projects storage** (auto-saves valid projects)

### Key Difference from Extension

| Aspect | Extension (Old) | Core Integration (Current) |
|--------|-----------------|---------------------------|
| Browser | Webview iframe | Electron WebContentsView |
| DevTools | External browser | Embedded in VSCode |
| Storage | Extension storage | `.roopik/projects/` |
| IPC | VS Code API | Electron IPC channels |
| Services | Extension services | DI-registered singletons |

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BROWSER PROCESS (Renderer)                          │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        UI Layer (browser/)                              │ │
│  │                                                                         │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │ │
│  │  │   Welcome Page   │  │   Activity Bar   │  │   Project Mode        │ │ │
│  │  │ welcomeEditor.ts │  │ roopikViewPane.ts│  │   Editor (editor.ts)  │ │ │
│  │  │                  │  │                  │  │                       │ │ │
│  │  │ Recent Projects  │  │ Recent Projects  │  │ - Browser Preview     │ │ │
│  │  │ Recent Canvases  │  │ Recent Canvases  │  │ - DevTools            │ │ │
│  │  │ Quick Actions    │  │ Canvas/Project   │  │ - Address Bar         │ │ │
│  │  └────────┬─────────┘  └────────┬─────────┘  │ - Inspect Mode        │ │ │
│  │           │                     │            └───────────┬───────────┘ │ │
│  │           │                     │                        │             │ │
│  │           ▼                     ▼                        ▼             │ │
│  │  ┌────────────────────────────────────────────────────────────────┐   │ │
│  │  │                    Commands (browserCommands.ts)                │   │ │
│  │  │                                                                 │   │ │
│  │  │  roopik.openProjectPreview(args?: { projectPath, projectName }) │   │ │
│  │  │                                                                 │   │ │
│  │  │  - Opens/focuses editor                                         │   │ │
│  │  │  - If projectPath provided → calls editor.startProjectPreview() │   │ │
│  │  └────────────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     Service Clients (browser/)                         │ │
│  │                                                                         │ │
│  │  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │ │
│  │  │ ProjectStorageService   │  │ Other Service Clients               │  │ │
│  │  │        Client           │  │ (Canvas, Component, etc.)           │  │ │
│  │  │                         │  │                                     │  │ │
│  │  │ - getRecentProjects()   │  │                                     │  │ │
│  │  │ - upsertProject()       │  │                                     │  │ │
│  │  │ - deleteProject()       │  │                                     │  │ │
│  │  │ - onProjectsChanged     │  │                                     │  │ │
│  │  └───────────┬─────────────┘  └─────────────────────────────────────┘  │ │
│  │              │                                                          │ │
│  └──────────────┼──────────────────────────────────────────────────────────┘ │
│                 │                                                            │
│                 │  IPC (mainProcessService.getChannel)                       │
│                 │                                                            │
└─────────────────┼────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MAIN PROCESS (electron-main)                        │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                       IPC Channels (channel/)                          │ │
│  │                                                                         │ │
│  │  ┌────────────────────────┐  ┌─────────────────────────────────────┐   │ │
│  │  │ ProjectStorageChannel  │  │ Other Channels                      │   │ │
│  │  │                        │  │ (Canvas, Component, ProjectMode)    │   │ │
│  │  │ - listen('onDidInit')  │  │                                     │   │ │
│  │  │ - listen('onChanged')  │  │                                     │   │ │
│  │  │ - call('initialize')   │  │                                     │   │ │
│  │  │ - call('getRecent')    │  │                                     │   │ │
│  │  │ - call('upsert')       │  │                                     │   │ │
│  │  │ - call('delete')       │  │                                     │   │ │
│  │  └───────────┬────────────┘  └─────────────────────────────────────┘   │ │
│  │              │                                                          │ │
│  └──────────────┼──────────────────────────────────────────────────────────┘ │
│                 │                                                            │
│                 ▼                                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      Services (electron-main/)                         │ │
│  │                                                                         │ │
│  │  ┌────────────────────────┐  ┌─────────────────────────────────────┐   │ │
│  │  │ ProjectStorageService  │  │ BrowserViewService                  │   │ │
│  │  │                        │  │                                     │   │ │
│  │  │ - initialize()         │  │ - createView()                      │   │ │
│  │  │ - getRecentProjects()  │  │ - navigate()                        │   │ │
│  │  │ - upsertProject()      │  │ - openDevTools()                    │   │ │
│  │  │ - deleteProject()      │  │ - etc.                              │   │ │
│  │  │                        │  │                                     │   │ │
│  │  │ Storage:               │  │                                     │   │ │
│  │  │ .roopik/projects/      │  │                                     │   │ │
│  │  │   projects.json        │  │                                     │   │ │
│  │  └────────────────────────┘  └─────────────────────────────────────┘   │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Opening Flow

### Two Entry Points - One Common Layer

Both manual project selection and recent project clicks converge at the same execution layer:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TWO ENTRY POINTS                                    │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────────────────┐
                    │  ENTRY 1: Manual Selection       │
                    │  "Open Project" button in        │
                    │  Browser Preview default screen  │
                    └──────────────┬───────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────┐
                    │  defaultBrowserScreen.ts         │
                    │  showProjectPicker()             │
                    │  └─> quickInputService.pick()    │
                    │      (Shows folder picker)       │
                    │  └─> this.onProjectSelect()      │
                    └──────────────┬───────────────────┘
                                   │
                                   │  editor.startProjectPreview(projectPath)
                                   │
                                   ▼
                    ┌──────────────────────────────────┐
                    │         COMMON LAYER             │
                    │  editor.ts                       │
                    │  startProjectPreview(projectRoot)│
                    └──────────────────────────────────┘



                    ┌──────────────────────────────────┐
                    │  ENTRY 2: Recent Project Click   │
                    │  (Welcome Page or Activity Bar)  │
                    └──────────────┬───────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────┐
                    │  welcomeEditor.ts / viewPane.ts  │
                    │  onClick handler:                │
                    │  executeCommand(                 │
                    │    'roopik.openProjectPreview',  │
                    │    { projectPath, projectName }  │
                    │  )                               │
                    └──────────────┬───────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────┐
                    │  browserCommands.ts              │
                    │  run(accessor, args)             │
                    │  ├─> Open/focus editor           │
                    │  └─> if (args?.projectPath)      │
                    │        editor.startProjectPreview│
                    │        (args.projectPath)        │
                    └──────────────┬───────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────┐
                    │         COMMON LAYER             │
                    │  editor.ts                       │
                    │  startProjectPreview(projectRoot)│
                    └──────────────────────────────────┘
```

### Common Layer: startProjectPreview()

Both entry points call the same method in `editor.ts`:

```typescript
// editor.ts - The common execution layer
public async startProjectPreview(projectRoot: string): Promise<void> {
    // 1. Start Vite dev server
    const { url } = await this.devServerService.start({
        projectRoot,
        port: 5173
    });

    // 2. Update internal state
    this.isProjectMode = true;
    this.currentProjectRoot = projectRoot;

    // 3. Save to recent projects (ONLY on successful start)
    //    Cross-platform folder name extraction
    const projectName = projectRoot.split(/[/\\]/).pop() || 'Project';
    this.projectStorageService.upsertProject(projectName, projectRoot);

    // 4. Navigate browser to dev server URL
    await this.navigate(url);
}
```

---

## Project Storage System

### Storage Location

```
.roopik/
└── projects/
    └── projects.json       # Recent projects registry
```

### Data Structure

```typescript
// storageTypes.ts
interface ProjectInfo {
    id: string;           // UUID
    name: string;         // Folder name (e.g., "my-app")
    path: string;         // Full path (e.g., "C:/Users/dev/my-app")
    createdAt: number;    // Unix timestamp
    updatedAt: number;    // Unix timestamp (updated on each open)
}
```

### Service Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Project Storage System                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  common/projectStorage/                                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  IProjectStorageService (Interface)                                  │    │
│  │                                                                      │    │
│  │  Events:                                                             │    │
│  │  - onDidInitialize: Event<void>                                     │    │
│  │  - onProjectsChanged: Event<void>                                   │    │
│  │                                                                      │    │
│  │  Methods:                                                            │    │
│  │  - initialize(workspacePath): Promise<void>                         │    │
│  │  - isInitializedAsync(): Promise<boolean>                           │    │
│  │  - getRecentProjects(limit?): Promise<ProjectInfo[]>                │    │
│  │  - upsertProject(name, path): Promise<string>                       │    │
│  │  - deleteProject(projectId): Promise<void>                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  PROJECT_STORAGE_CHANNEL = 'roopikProjectStorage'                           │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    │  Implemented by:
                    │
    ┌───────────────┴───────────────┐
    │                               │
    ▼                               ▼
┌─────────────────────┐   ┌─────────────────────────────────────────────────┐
│  browser/           │   │  electron-main/projectStorage/                  │
│                     │   │                                                  │
│  ProjectStorage-    │   │  ProjectStorageService (Implementation)         │
│  ServiceClient      │   │                                                  │
│                     │   │  - Reads/writes .roopik/projects/projects.json  │
│  - IPC proxy        │   │  - Fires events on changes                      │
│  - Forwards calls   │   │  - Sorts by updatedAt (most recent first)       │
│    to main process  │   │  - Auto-updates timestamp on upsert             │
└─────────────────────┘   └─────────────────────────────────────────────────┘
```

### Event Flow for Dynamic UI Updates

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Event-Driven UI Updates                               │
└─────────────────────────────────────────────────────────────────────────────┘

1. Project Successfully Starts
   │
   ▼
┌──────────────────────────────┐
│  editor.ts                   │
│  startProjectPreview()       │
│  └─> upsertProject(name,path)│
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  ProjectStorageService       │
│  (electron-main)             │
│  └─> writes to projects.json │
│  └─> fires onProjectsChanged │
└──────────────┬───────────────┘
               │
               │ IPC Event
               ▼
┌──────────────────────────────┐
│  ProjectStorageChannel       │
│  └─> broadcasts event        │
└──────────────┬───────────────┘
               │
               │ IPC Listener
               ▼
┌──────────────────────────────┐
│  ProjectStorageServiceClient │
│  (browser)                   │
│  └─> fires onProjectsChanged │
└──────────────┬───────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
┌────────────────┐  ┌────────────────┐
│ Welcome Page   │  │ Activity Bar   │
│                │  │                │
│ loadRecent-    │  │ loadProjects-  │
│ Projects()     │  │ Now()          │
│                │  │                │
│ UI Refreshes!  │  │ UI Refreshes!  │
└────────────────┘  └────────────────┘
```

---

## IPC Communication

### Channel Registration (app.ts)

```typescript
// src/vs/code/electron-main/app.ts

// Import
import { ProjectStorageService } from '../../workbench/contrib/roopik/electron-main/projectStorage/projectStorageService.js';
import { ProjectStorageChannel } from '../../workbench/contrib/roopik/electron-main/channel/projectStorageChannel.js';
import { PROJECT_STORAGE_CHANNEL } from '../../workbench/contrib/roopik/common/projectStorage/index.js';

// Registration (~line 1290)
const projectStorageService = new ProjectStorageService();
const projectStorageChannel = new ProjectStorageChannel(projectStorageService);
mainProcessElectronServer.registerChannel(PROJECT_STORAGE_CHANNEL, projectStorageChannel);
```

### Channel Methods

| IPC Method | Direction | Purpose |
|------------|-----------|---------|
| `initialize` | call | Initialize with workspace path |
| `isInitialized` | call | Check if service is ready |
| `getRecentProjects` | call | Fetch recent projects list |
| `upsertProject` | call | Add/update project in registry |
| `deleteProject` | call | Remove project from registry |
| `onDidInitialize` | listen | Event: service initialized |
| `onProjectsChanged` | listen | Event: projects list changed |

---

## File Structure

### Common Layer (Shared Types & Interfaces)

```
src/vs/workbench/contrib/roopik/common/
├── projectStorage/
│   ├── index.ts                    # Re-exports
│   └── projectStorageService.ts    # IProjectStorageService interface
│                                   # PROJECT_STORAGE_CHANNEL constant
└── storage/
    └── storageTypes.ts             # ProjectInfo type
```

### Browser Layer (Renderer Process)

```
src/vs/workbench/contrib/roopik/browser/
├── projectStorageServiceClient.ts  # IPC client implementation
├── welcomeEditor.ts                # Welcome page (uses service)
├── roopikViewPane.ts               # Activity bar (uses service)
├── commands/
│   └── browserCommands.ts          # roopik.openProjectPreview command
├── contributions/
│   └── startupContribution.ts      # Service initialization
└── projectMode/
    ├── editor.ts                   # Project Mode editor
    └── components/
        └── defaultBrowserScreen.ts # Default screen with Open Project
```

### Main Process (electron-main)

```
src/vs/workbench/contrib/roopik/electron-main/
├── projectStorage/
│   └── projectStorageService.ts    # Service implementation
└── channel/
    └── projectStorageChannel.ts    # IPC channel
```

---

## Service Registration

### Registration Order

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Service Registration Flow                             │
└─────────────────────────────────────────────────────────────────────────────┘

1. app.ts (Main Process Startup)
   │
   ├─> new ProjectStorageService()
   ├─> new ProjectStorageChannel(service)
   └─> mainProcessElectronServer.registerChannel(...)

2. roopik.contribution.ts (Renderer Startup)
   │
   └─> registerSingleton(IProjectStorageService, ProjectStorageServiceClient)

3. startupContribution.ts (After Renderer Ready)
   │
   └─> projectStorageService.initialize(workspacePath)
       │
       └─> Service fires onDidInitialize event
```

### Singleton Registration

```typescript
// roopik.contribution.ts
import { IProjectStorageService } from './common/projectStorage/index.js';
import { ProjectStorageServiceClient } from './browser/projectStorageServiceClient.js';

registerSingleton(
    IProjectStorageService,
    ProjectStorageServiceClient,
    InstantiationType.Delayed
);
```

---

## Cross-Platform Path Handling

Project paths are handled cross-platform using regex-based splitting:

```typescript
// Works on Windows, Linux, and macOS
const projectName = projectRoot.split(/[/\\]/).pop() || 'Project';
```

| OS | Input Path | Result |
|----|------------|--------|
| Windows | `C:\Users\dev\my-app` | `my-app` |
| Linux | `/home/dev/my-app` | `my-app` |
| macOS | `/Users/dev/my-app` | `my-app` |
| Mixed | `C:/Users/dev/my-app` | `my-app` |

---

## Summary

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `IProjectStorageService` | common/ | Interface definition |
| `ProjectStorageService` | electron-main/ | Storage implementation |
| `ProjectStorageChannel` | electron-main/ | IPC handler |
| `ProjectStorageServiceClient` | browser/ | IPC client proxy |
| `browserCommands.ts` | browser/ | Command with projectPath args |
| `editor.ts` | browser/ | Common execution layer |
| `welcomeEditor.ts` | browser/ | Dynamic project list |
| `roopikViewPane.ts` | browser/ | Dynamic project list |

**Key Design Principle**: Both manual selection and recent project clicks converge at `editor.startProjectPreview()`, ensuring consistent behavior and automatic storage updates.

---

*Architecture designed for: Modularity, Cross-Platform Support, Event-Driven UI*
*Last Updated: December 2025*
