# Sandbox Pipeline - Current Structure

## ✅ Correct Architecture (Phase 2)

```
src/vs/workbench/contrib/roopik/
│
├── common/sandboxPipeline/              ← Shared (browser + main)
│   ├── types.ts                         ✅ Type definitions
│   ├── sandboxPipelineService.ts        ✅ Service interface
│   └── componentParser.ts               ✅ Framework detection
│
├── electron-main/sandboxPipeline/       ← Main process (Node.js)
│   ├── esbuildTransformer.ts            ✅ ESBuild transformation
│   ├── sandboxQueue.ts                  ✅ Queue management
│   └── sandboxPipelineMainService.ts    ✅ Main service
│
└── browser/                             ← Browser code
    └── (to be created in Phase 3)
```

## ❌ Deleted (Phase 1 - Wrong Location)

```
browser/canvas/services/sandboxPipeline/  ← DELETED ✅
├── README.md
├── codeTransformer.ts
├── componentParser.ts
├── examples.ts
├── index.ts
├── sandboxPipelineService.ts
├── sandboxQueue.ts
└── types.ts
```

**Why deleted?**
- These were in `browser/` folder but tried to use Node.js features
- Browser code can't use ESBuild (Node.js only)
- Violated VSCode's architecture principles

---

## Current Status

**Phase 1:** ~~Core Infrastructure~~ (Replaced by Phase 2)
**Phase 2:** ESBuild Integration ✅ **COMPLETE**
**Phase 3:** Browser Client (Next)
**Phase 4:** Renderer Integration (Next)

---

## Next: Phase 3 - Browser Client

We'll create:
- `browser/sandboxPipelineClient.ts` - IPC client for browser code
- Communication bridge to main process
- Same API surface, but calls main process via IPC

This will allow browser code to use the pipeline:
```typescript
// Browser code
const pipeline = accessor.get(ISandboxPipelineService);
await pipeline.processComponent({ ... });
```

Behind the scenes, it sends IPC message to main process → ESBuild transforms → returns result.

---

**Ready for Phase 3?** 🚀
