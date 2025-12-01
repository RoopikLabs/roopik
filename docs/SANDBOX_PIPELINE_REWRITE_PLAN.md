# Sandbox Pipeline Rewrite Plan - ESBuild-Based Architecture

**Version**: 1.0
**Date**: December 1, 2025
**Status**: Planning Phase
**Author**: Roopik Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Problems](#current-problems)
3. [New Architecture](#new-architecture)
4. [Implementation Phases](#implementation-phases)
5. [Technical Specifications](#technical-specifications)
6. [API Reference](#api-reference)
7. [Performance Metrics](#performance-metrics)
8. [Migration Strategy](#migration-strategy)

---

## Executive Summary

### Goal
Build a modular, queue-based sandbox pipeline that works with ANY framework, supports multi-file components, and is accessible to users, IDE, and AI agents.

### Key Improvements
- ✅ **ESBuild transformation in Node.js** (not browser)
- ✅ **Queue-based processing** (avoid resource exhaustion)
- ✅ **Multi-framework support** (React, Vue, Svelte, HTML)
- ✅ **Multi-file support** (component folders)
- ✅ **Tool-callable APIs** (for AI agents)
- ✅ **Clean separation of concerns**

### Expected Benefits
- **200MB → 10MB** memory savings (no Babel in 100 iframes)
- **100× faster** rendering (transform once, not 100 times)
- **Universal framework support** (not just React)
- **Resilient** (no reliance on AI for CDN URLs)
- **Scalable** (queue prevents resource exhaustion)

---

## Current Problems

### Problem 1: Babel Loaded in Every Sandbox
**File**: `sandboxCard.ts` line 696
```html
<script src="https://unpkg.com/@babel/standalone@7.23.5/babel.min.js"></script>
```

**Impact**:
- 100 sandboxes = 200MB of Babel
- Slow initial load
- Memory waste

### Problem 2: Transpilation Happens 100 Times
**File**: `sandboxCard.ts` line 767
```javascript
const transpiled = Babel.transform(processedCode, {
    presets: ['react'],
    filename: 'component.jsx'
}).code;
```

**Impact**:
- CPU waste (100× the same work)
- Slow rendering
- Battery drain

### Problem 3: Manual Import Stripping
**File**: `sandboxCard.ts` lines 729-765

**Impact**:
- Fragile regex-based parsing
- Breaks on edge cases
- Hard to maintain

### Problem 4: React-Only Support
**Current**: Only React components work

**Impact**:
- Can't support Vue, Svelte, HTML
- Limits use cases

### Problem 5: No Queue Management
**Current**: All sandboxes process simultaneously

**Impact**:
- Resource exhaustion with 100+ sandboxes
- Browser crashes
- No load balancing

---

## New Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    INPUT SOURCES                                 │
│  ─────────────────────────────────────────────────────────────  │
│  1. AI Agent generates code                                     │
│  2. User uploads existing component                             │
│  3. User writes in IDE                                          │
│  4. Import from Git/Figma                                       │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│              SANDBOX PIPELINE SERVICE (Node.js)                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  1. SandboxQueue                                       │    │
│  │     - Manages processing queue                         │    │
│  │     - Load balancing (max 10 concurrent)               │    │
│  │     - Priority handling                                │    │
│  └────────────────────────────────────────────────────────┘    │
│                          ↓                                       │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  2. ComponentParser                                    │    │
│  │     - Detects framework (React/Vue/Svelte/HTML)        │    │
│  │     - Reads multi-file components                      │    │
│  │     - Validates structure                              │    │
│  └────────────────────────────────────────────────────────┘    │
│                          ↓                                       │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  3. CodeTransformer (ESBuild)                          │    │
│  │     - JSX → JavaScript                                 │    │
│  │     - 'react' → 'https://esm.sh/react@18'              │    │
│  │     - Bundles multi-file components                    │    │
│  └────────────────────────────────────────────────────────┘    │
│                          ↓                                       │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  4. SandboxRenderer                                    │    │
│  │     - Creates tiny iframe                              │    │
│  │     - Sends transformed code                           │    │
│  │     - Monitors render status                           │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│                    WEBVIEW (100s of iframes)                     │
│  ─────────────────────────────────────────────────────────────  │
│  Each iframe: 10KB, no Babel, just executes code                │
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/vs/workbench/contrib/roopik/browser/canvas/services/
├── sandboxPipeline/
│   ├── sandboxPipelineService.ts      # Main orchestrator
│   ├── sandboxQueue.ts                # Queue management
│   ├── componentParser.ts             # Framework detection
│   ├── codeTransformer.ts             # ESBuild wrapper
│   ├── sandboxRenderer.ts             # Iframe rendering
│   └── types.ts                       # Shared types
```

---

## Implementation Phases

### Phase 1: Core Pipeline Infrastructure (Week 1)

**Goal**: Build the queue and transformation engine

#### Tasks
- [ ] Create service file structure
- [ ] Implement `SandboxQueue` with max 10 concurrent jobs
- [ ] Implement `CodeTransformer` using ESBuild
- [ ] Support React framework only (MVP)
- [ ] Add comprehensive error handling
- [ ] Write unit tests

#### Deliverables
- Queue-based transformation pipeline
- ESBuild integration working
- React components transforming correctly

#### Success Criteria
- Can process 100 React components without resource exhaustion
- Transformation takes <100ms per component
- Queue prevents more than 10 concurrent jobs

---

### Phase 2: Multi-Framework Support (Week 2)

**Goal**: Support React, Vue, Svelte, HTML

#### Tasks
- [ ] Implement `ComponentParser.detectFramework()`
- [ ] Add Vue support (esbuild-plugin-vue)
- [ ] Add Svelte support (esbuild-svelte)
- [ ] Add HTML/CSS/JS support (no transformation)
- [ ] Framework-specific ESBuild plugins
- [ ] Auto-detect entry file for each framework
- [ ] Write framework-specific tests

#### Deliverables
- All 4 frameworks supported
- Auto-detection working
- Framework-specific optimizations

#### Success Criteria
- Can process React, Vue, Svelte, HTML components
- Auto-detection accuracy >95%
- Each framework renders correctly

---

### Phase 3: Tool-Callable API (Week 3)

**Goal**: Expose clean APIs for users, IDE, and AI agents

#### Tasks
- [ ] Design clean API surface
- [ ] Implement `processComponent()` method
- [ ] Implement `getJobStatus()` method
- [ ] Implement `waitForCompletion()` method
- [ ] Create AI agent tool definitions
- [ ] Add input validation
- [ ] Add telemetry/logging
- [ ] Write API documentation

#### Deliverables
- Clean, documented API
- AI agent tool definitions
- Usage examples

#### Success Criteria
- AI agents can call API successfully
- Users can programmatically process components
- API is intuitive and well-documented

---

### Phase 4: Sandbox Renderer Integration (Week 4)

**Goal**: Connect pipeline to actual iframe rendering

#### Tasks
- [ ] Create new tiny sandbox template (no Babel)
- [ ] Implement `SandboxRenderer` service
- [ ] Update `sandboxCard.ts` to use new pipeline
- [ ] Remove old Babel-based code
- [ ] Add render status monitoring
- [ ] Handle errors gracefully
- [ ] Performance testing with 100+ sandboxes

#### Deliverables
- End-to-end working system
- Tiny iframes (10KB each)
- Old code removed

#### Success Criteria
- 100+ sandboxes render without issues
- Memory usage <50MB total
- Rendering is instant (<50ms)

---

## Technical Specifications

### Core Types

```typescript
// types.ts

export type Framework = 'react' | 'vue' | 'svelte' | 'html';

export type ComponentSource = 'ai' | 'user' | 'upload' | 'import';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type JobPriority = 'high' | 'normal' | 'low';

export interface ComponentInput {
  id: string;
  source: ComponentSource;
  framework?: Framework; // Optional, auto-detect if not provided
  files: Map<string, string>; // filename → code
  entryFile?: string; // Main file (auto-detect if not provided)
  priority?: JobPriority;
}

export interface TransformedComponent {
  id: string;
  framework: Framework;
  bundledCode: string; // Ready-to-execute code
  cdnUrls: string[]; // Dependencies to load
  metadata: {
    size: number;
    transformTime: number;
  };
}

export interface SandboxJob {
  id: string;
  input: ComponentInput;
  status: JobStatus;
  result?: TransformedComponent;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}
```

### SandboxQueue Implementation

```typescript
// sandboxQueue.ts

export class SandboxQueue {
  private queue: SandboxJob[] = [];
  private processing = new Set<string>();
  private maxConcurrent = 10; // Prevent resource exhaustion

  async enqueue(input: ComponentInput): Promise<string> {
    const job: SandboxJob = {
      id: generateId(),
      input,
      status: 'queued',
      createdAt: new Date()
    };

    // Priority queue: high priority jobs go first
    if (input.priority === 'high') {
      this.queue.unshift(job);
    } else {
      this.queue.push(job);
    }

    this.processNext();
    return job.id;
  }

  private async processNext(): Promise<void> {
    if (this.processing.size >= this.maxConcurrent) return;

    const job = this.queue.find(j => j.status === 'queued');
    if (!job) return;

    job.status = 'processing';
    this.processing.add(job.id);

    try {
      // Transform the component
      const result = await this.transformer.transform(job.input);
      job.result = result;
      job.status = 'completed';
      job.completedAt = new Date();

      // Emit event for listeners
      this.onJobCompleted.fire(job);
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;

      // Emit error event
      this.onJobFailed.fire(job);
    } finally {
      this.processing.delete(job.id);
      this.processNext(); // Process next job
    }
  }

  getJob(jobId: string): SandboxJob | undefined {
    return this.queue.find(j => j.id === jobId);
  }

  getQueueStatus(): {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    return {
      queued: this.queue.filter(j => j.status === 'queued').length,
      processing: this.processing.size,
      completed: this.queue.filter(j => j.status === 'completed').length,
      failed: this.queue.filter(j => j.status === 'failed').length
    };
  }
}
```

### ComponentParser Implementation

```typescript
// componentParser.ts

export class ComponentParser {
  /**
   * Auto-detect framework from files
   */
  detectFramework(files: Map<string, string>): Framework {
    for (const [filename, code] of files) {
      // Vue SFC
      if (filename.endsWith('.vue')) return 'vue';

      // Svelte
      if (filename.endsWith('.svelte')) return 'svelte';

      // React (JSX/TSX)
      if (filename.endsWith('.jsx') || filename.endsWith('.tsx')) return 'react';
      if (code.includes('React') || code.includes('import React')) return 'react';

      // HTML
      if (filename.endsWith('.html')) return 'html';
    }

    return 'react'; // Default fallback
  }

  /**
   * Auto-detect entry file based on framework
   */
  detectEntryFile(files: Map<string, string>, framework: Framework): string {
    const extensions = {
      react: ['.jsx', '.tsx', '.js', '.ts'],
      vue: ['.vue'],
      svelte: ['.svelte'],
      html: ['.html']
    };

    // Look for common entry file names
    const commonNames = ['index', 'main', 'app', 'App', 'component', 'Component'];

    for (const name of commonNames) {
      for (const ext of extensions[framework]) {
        const filename = name + ext;
        if (files.has(filename)) {
          return filename;
        }
      }
    }

    // Fallback: first file with matching extension
    for (const [filename] of files) {
      if (extensions[framework].some(ext => filename.endsWith(ext))) {
        return filename;
      }
    }

    throw new Error(`No entry file found for framework: ${framework}`);
  }

  /**
   * Validate component structure
   */
  validate(input: ComponentInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (input.files.size === 0) {
      errors.push('No files provided');
    }

    try {
      const framework = input.framework || this.detectFramework(input.files);
      const entryFile = input.entryFile || this.detectEntryFile(input.files, framework);

      if (!input.files.has(entryFile)) {
        errors.push(`Entry file not found: ${entryFile}`);
      }
    } catch (error) {
      errors.push(error.message);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### CodeTransformer Implementation

```typescript
// codeTransformer.ts

import * as esbuild from 'esbuild';
import vuePlugin from 'esbuild-plugin-vue';
import sveltePlugin from 'esbuild-svelte';

export class CodeTransformer {
  async transform(input: ComponentInput): Promise<TransformedComponent> {
    const startTime = Date.now();

    // 1. Detect framework if not provided
    const framework = input.framework || this.parser.detectFramework(input.files);

    // 2. Get entry file
    const entryFile = input.entryFile || this.parser.detectEntryFile(input.files, framework);
    const entryCode = input.files.get(entryFile)!;

    // 3. Transform with ESBuild
    const result = await esbuild.build({
      stdin: {
        contents: entryCode,
        loader: this.getLoader(framework),
        resolveDir: '/'
      },
      bundle: true,
      format: 'esm',
      write: false,
      target: 'es2020',
      plugins: [
        this.createVirtualFSPlugin(input.files),
        this.createCDNResolverPlugin(),
        ...this.getFrameworkPlugins(framework)
      ]
    });

    const bundledCode = result.outputFiles[0].text;

    return {
      id: input.id,
      framework,
      bundledCode,
      cdnUrls: this.extractCDNUrls(bundledCode),
      metadata: {
        size: bundledCode.length,
        transformTime: Date.now() - startTime
      }
    };
  }

  private getLoader(framework: Framework): esbuild.Loader {
    const loaders: Record<Framework, esbuild.Loader> = {
      react: 'jsx',
      vue: 'ts',
      svelte: 'ts',
      html: 'js'
    };
    return loaders[framework];
  }

  private getFrameworkPlugins(framework: Framework): esbuild.Plugin[] {
    if (framework === 'vue') {
      return [vuePlugin()];
    } else if (framework === 'svelte') {
      return [sveltePlugin()];
    }
    return [];
  }

  private createCDNResolverPlugin(): esbuild.Plugin {
    return {
      name: 'cdn-resolver',
      setup(build) {
        // Resolve bare imports to CDN URLs
        build.onResolve({ filter: /^[^.]/ }, args => {
          // Map common packages to specific versions
          const versionMap: Record<string, string> = {
            'react': '18.2.0',
            'react-dom': '18.2.0',
            'vue': '3.3.4',
            'svelte': '4.0.0'
          };

          const version = versionMap[args.path] || 'latest';

          return {
            path: `https://esm.sh/${args.path}@${version}`,
            external: true
          };
        });
      }
    };
  }

  private createVirtualFSPlugin(files: Map<string, string>): esbuild.Plugin {
    return {
      name: 'virtual-fs',
      setup(build) {
        // Resolve relative imports
        build.onResolve({ filter: /^\./ }, args => ({
          path: args.path,
          namespace: 'virtual'
        }));

        // Load from in-memory files
        build.onLoad({ filter: /.*/, namespace: 'virtual' }, args => {
          const filename = args.path.replace('./', '');
          const contents = files.get(filename);

          if (!contents) {
            throw new Error(`File not found: ${filename}`);
          }

          return {
            contents,
            loader: 'jsx'
          };
        });
      }
    };
  }

  private extractCDNUrls(code: string): string[] {
    // Extract all esm.sh URLs from the bundled code
    const regex = /from\s+['"]https:\/\/esm\.sh\/[^'"]+['"]/g;
    const matches = code.match(regex) || [];

    return matches.map(m => m.replace(/from\s+['"]/, '').replace(/['"]$/, ''));
  }
}
```

---

## API Reference

### SandboxPipelineService

Main service for processing components.

#### Methods

##### `processComponent(input: ComponentInput): Promise<string>`

Process a component and return a job ID.

**Parameters**:
- `input.id` - Unique component ID
- `input.source` - Source of component ('ai' | 'user' | 'upload' | 'import')
- `input.files` - Map of filename to code content
- `input.framework` - (Optional) Framework to use
- `input.entryFile` - (Optional) Main file
- `input.priority` - (Optional) Job priority

**Returns**: Job ID (string)

**Example**:
```typescript
const jobId = await sandboxPipeline.processComponent({
  id: 'comp-123',
  source: 'ai',
  files: new Map([
    ['Button.jsx', 'import React from "react"; ...']
  ])
});
```

##### `getJobStatus(jobId: string): Promise<SandboxJob>`

Get the current status of a job.

**Returns**: SandboxJob object

**Example**:
```typescript
const job = await sandboxPipeline.getJobStatus(jobId);
console.log(job.status); // 'queued' | 'processing' | 'completed' | 'failed'
```

##### `waitForCompletion(jobId: string, timeout?: number): Promise<TransformedComponent>`

Wait for a job to complete.

**Parameters**:
- `jobId` - Job ID to wait for
- `timeout` - (Optional) Timeout in milliseconds (default: 30000)

**Returns**: TransformedComponent

**Example**:
```typescript
const result = await sandboxPipeline.waitForCompletion(jobId);
// result.bundledCode is ready to send to iframe
```

##### `cancelJob(jobId: string): Promise<void>`

Cancel a queued or processing job.

**Example**:
```typescript
await sandboxPipeline.cancelJob(jobId);
```

##### `getQueueStatus(): QueueStatus`

Get current queue statistics.

**Returns**:
```typescript
{
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}
```

---

### AI Agent Tool Definition

For AI agents to call the pipeline:

```typescript
export const SANDBOX_TOOLS = {
  processComponent: {
    name: 'canvas.processComponent',
    description: 'Transform and render a component in the canvas',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['ai', 'user', 'upload', 'import'],
          description: 'Source of the component'
        },
        framework: {
          type: 'string',
          enum: ['react', 'vue', 'svelte', 'html'],
          description: 'Framework (optional, auto-detected if not provided)'
        },
        files: {
          type: 'object',
          description: 'Map of filename to code content',
          additionalProperties: { type: 'string' }
        },
        entryFile: {
          type: 'string',
          description: 'Main file (optional, auto-detected)'
        },
        priority: {
          type: 'string',
          enum: ['high', 'normal', 'low'],
          description: 'Job priority (optional, default: normal)'
        }
      },
      required: ['source', 'files']
    }
  }
};
```

---

## Performance Metrics

### Current vs New

| Metric | Current (Babel) | New (ESBuild) | Improvement |
|--------|----------------|---------------|-------------|
| **Memory per sandbox** | 2MB | 10KB | **200× less** |
| **Total memory (100 sandboxes)** | 200MB | 1MB | **200× less** |
| **Transpilation time** | 100× (in each iframe) | 1× (in Node.js) | **100× faster** |
| **Initial load time** | Slow (download Babel) | Fast (tiny iframe) | **10× faster** |
| **CPU usage** | High (100× transpile) | Low (1× transpile) | **100× less** |
| **Framework support** | React only | React, Vue, Svelte, HTML | **4× more** |
| **Multi-file support** | No | Yes | **New feature** |
| **Queue management** | No | Yes | **New feature** |

### Target Benchmarks

- **Transformation time**: <100ms per component
- **Queue throughput**: 10 components/second
- **Memory usage**: <50MB for 100 sandboxes
- **Initial render**: <50ms
- **Framework detection accuracy**: >95%

---

## Migration Strategy

### Step 1: Parallel Implementation (Week 1-2)

- Build new pipeline alongside old code
- Don't touch existing `sandboxCard.ts` yet
- Test new pipeline in isolation

### Step 2: Feature Flag (Week 3)

- Add feature flag: `roopik.useLegacySandbox`
- Allow switching between old and new
- Test with real components

### Step 3: Gradual Rollout (Week 4)

- Enable new pipeline for 10% of sandboxes
- Monitor for errors
- Increase to 50%, then 100%

### Step 4: Cleanup (Week 5)

- Remove old Babel-based code
- Remove feature flag
- Update documentation

### Rollback Plan

If issues are found:
1. Set feature flag to use old pipeline
2. Fix issues in new pipeline
3. Re-test before re-enabling

---

## Dependencies

### NPM Packages to Install

```json
{
  "dependencies": {
    "esbuild": "^0.19.0",
    "esbuild-plugin-vue": "^1.0.0",
    "esbuild-svelte": "^0.8.0"
  }
}
```

### VSCode APIs Used

- `IWebviewService` - Create webview elements
- `IFileService` - Read component files
- `ILogService` - Logging
- `ITelemetryService` - Metrics

---

## Testing Strategy

### Unit Tests

- `SandboxQueue` - Queue management logic
- `ComponentParser` - Framework detection
- `CodeTransformer` - ESBuild transformation
- Each framework separately

### Integration Tests

- End-to-end component processing
- Multi-file components
- Error handling
- Queue load balancing

### Performance Tests

- 100+ sandboxes rendering
- Memory usage monitoring
- Transformation speed
- Queue throughput

### Manual Testing

- AI agent integration
- User upload flow
- Live editing
- All frameworks

---

## Open Questions

### Q1: CDN Version Management
**Question**: Should we pin specific versions or use `@latest`?

**Options**:
- A) Pin versions (e.g., `react@18.2.0`) - More stable
- B) Use `@latest` - Always up-to-date
- C) Let user choose - Most flexible

**Decision**: TBD

### Q2: Queue Priority
**Question**: How should we prioritize jobs?

**Options**:
- A) FIFO (first in, first out)
- B) User-initiated jobs first
- C) AI jobs have lower priority
- D) Configurable priority

**Decision**: TBD

### Q3: Error Recovery
**Question**: What happens if transformation fails?

**Options**:
- A) Show error in sandbox
- B) Retry with fallback settings
- C) Queue for manual review

**Decision**: TBD

---

## Change Log

### Version 1.0 (December 1, 2025)
- Initial plan created
- 4-phase implementation defined
- Architecture designed

---

## References

- [ESBuild Documentation](https://esbuild.github.io/)
- [esm.sh CDN](https://esm.sh/)
- [esbuild-plugin-vue](https://github.com/egoist/esbuild-plugin-vue)
- [esbuild-svelte](https://github.com/EMH333/esbuild-svelte)

---

**Status**: Ready for Phase 1 implementation 🚀
