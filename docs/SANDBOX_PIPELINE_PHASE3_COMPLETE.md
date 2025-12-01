# Phase 3: Browser Client with IPC Communication

## Overview

Phase 3 implements the browser-side client that communicates with the main process pipeline via VSCode's IPC mechanism.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser Process                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  SandboxPipelineClient (browser/sandboxPipelineClient.ts)  │ │
│  │                                                             │ │
│  │  - processComponent()                                      │ │
│  │  - validateComponent()                                     │ │
│  │  - getJobStatus()                                          │ │
│  │  - waitForCompletion()                                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ▲                                   │
│                              │ IPC (invoke)                      │
│                              ▼                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          Main Process                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  IPC Handlers (electron-main/sandboxPipeline/ipcHandlers) │ │
│  │                                                             │ │
│  │  ipcMain.handle('sandboxPipeline:processComponent', ...)   │ │
│  │  ipcMain.handle('sandboxPipeline:getJobStatus', ...)       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ▲                                   │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  SandboxPipelineMainService                                │ │
│  │                                                             │ │
│  │  - ESBuild Transformer                                     │ │
│  │  - Queue Management                                        │ │
│  │  - Component Parser                                        │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Created

### 1. Browser Client (`browser/sandboxPipelineClient.ts`)

**Purpose:** Acts as an IPC proxy to the main process.

**Key Features:**
- Implements `ISandboxPipelineService` interface
- All methods forward to main process via IPC
- Uses `@IMainProcessService` for IPC communication
- Extends `Disposable` for proper cleanup

**Example:**
```typescript
export class SandboxPipelineClient implements ISandboxPipelineService {

  async processComponent(input: ComponentInput): Promise<string> {
    // Send to main process
    return this.mainProcessService.invoke('sandboxPipeline:processComponent', input);
  }
}
```

---

### 2. IPC Handlers (`electron-main/sandboxPipeline/ipcHandlers.ts`)

**Purpose:** Registers IPC channels that browser can call.

**Key Features:**
- Registers all pipeline methods as IPC handlers
- Routes requests to `SandboxPipelineMainService`
- Proper cleanup on dispose

**Example:**
```typescript
ipcMain.handle('sandboxPipeline:processComponent', async (event, input) => {
  return this.pipelineService.processComponent(input);
});
```

---

### 3. Usage Examples (`browser/sandboxPipelineExamples.ts`)

**Purpose:** Demonstrates how to use the pipeline from browser code.

**Examples:**
- Processing AI-generated components
- Polling job status
- Queue monitoring

---

## How It Works

### Step-by-Step Flow

1. **Browser Code Calls Pipeline:**
   ```typescript
   const jobId = await pipelineService.processComponent({
     files: { 'App.jsx': aiCode },
     dependencies: { 'react': '19.0.0' }
   });
   ```

2. **Client Forwards via IPC:**
   ```typescript
   // In SandboxPipelineClient
   return this.mainProcessService.invoke('sandboxPipeline:processComponent', input);
   ```

3. **Main Process Receives:**
   ```typescript
   // In ipcHandlers.ts
   ipcMain.handle('sandboxPipeline:processComponent', async (event, input) => {
     return this.pipelineService.processComponent(input);
   });
   ```

4. **Pipeline Processes:**
   ```typescript
   // In SandboxPipelineMainService
   const jobId = await this.queue.enqueue(input);
   // ESBuild transforms code...
   return jobId;
   ```

5. **Result Returns to Browser:**
   ```typescript
   // Browser receives jobId
   const result = await pipelineService.waitForCompletion(jobId);
   ```

---

## IPC Channels Registered

| Channel | Purpose |
|---------|---------|
| `sandboxPipeline:processComponent` | Transform component code |
| `sandboxPipeline:validateComponent` | Validate without processing |
| `sandboxPipeline:getJobStatus` | Get job status by ID |
| `sandboxPipeline:getAllJobs` | Get all jobs |
| `sandboxPipeline:getQueueStatus` | Get queue statistics |
| `sandboxPipeline:waitForCompletion` | Wait for job to finish |
| `sandboxPipeline:cancelJob` | Cancel queued job |
| `sandboxPipeline:clearCompletedJobs` | Clear old jobs |

---

## Usage from Browser Code

### Example 1: Process AI Component

```typescript
import { ISandboxPipelineService } from '../common/sandboxPipeline/sandboxPipelineService.js';

async function processAIComponent(
  pipelineService: ISandboxPipelineService,
  aiCode: string
) {
  // Queue transformation
  const jobId = await pipelineService.processComponent({
    id: 'ai-component',
    source: 'ai',
    files: { 'Component.jsx': aiCode },
    dependencies: { 'react': '19.0.0' }
  });

  // Wait for result
  const result = await pipelineService.waitForCompletion(jobId);

  // Send to iframe
  iframe.contentWindow.postMessage({
    type: 'execute',
    code: result.bundledCode
  }, '*');
}
```

### Example 2: Monitor Queue

```typescript
async function monitorQueue(pipelineService: ISandboxPipelineService) {
  const status = await pipelineService.getQueueStatus();

  console.log(`Queue: ${status.queued} queued, ${status.processing} processing`);
}
```

---

## Service Registration (TODO)

The client needs to be registered in VSCode's service container:

```typescript
// In workbench services registration
registerSingleton(
  ISandboxPipelineService,
  SandboxPipelineClient,
  InstantiationType.Delayed
);
```

**Location:** TBD (VSCode service registration files)

---

## Benefits

### 1. **Separation of Concerns**
- Browser: UI logic only
- Main: Heavy computation (ESBuild)

### 2. **Type Safety**
- Same interface (`ISandboxPipelineService`) in both processes
- TypeScript ensures correct IPC messages

### 3. **Transparent Communication**
- Browser code doesn't know about IPC
- Just calls methods like a local service

### 4. **Performance**
- ESBuild runs in Node.js (fast)
- Browser stays responsive

---

## Next Steps

### Phase 3 Remaining:
- [ ] Service registration in VSCode
- [ ] Integration testing
- [ ] Error handling verification

### Phase 4: Sandbox Renderer
- [ ] Create minimal sandbox HTML template
- [ ] Update `sandboxCard.ts` to use new pipeline
- [ ] Remove old Babel code
- [ ] End-to-end testing

---

## Status

**✅ Phase 3 Core Implementation Complete!**

Files created:
- ✅ `browser/sandboxPipelineClient.ts`
- ✅ `electron-main/sandboxPipeline/ipcHandlers.ts`
- ✅ `browser/sandboxPipelineExamples.ts`

**Ready for service registration and testing!** 🚀
