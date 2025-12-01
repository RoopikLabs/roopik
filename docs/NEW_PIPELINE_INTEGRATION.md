# New Pipeline Integration - Quick Start

## What Was Created

### 1. New Sandbox Card
**File:** `browser/canvas/components/newSandboxCard.ts`

- Uses ESBuild pipeline (no Babel!)
- Green border to distinguish from old sandboxes
- Processes code through main process
- Clean, independent implementation

### 2. New Samples
**File:** `browser/canvas/services/newSamples.ts`

Three beautiful samples:
- 🚀 React Counter (gradient background, modern UI)
- 🚀 React Todo List (full CRUD operations)
- 🚀 React Card (beautiful card design)

---

## How to Test

### Option 1: Manual Test (Quick)
Add this to your canvas toolbar handler:

```typescript
import { NewSandboxCard } from './components/newSandboxCard.js';
import { NEW_SAMPLE_COMPONENTS } from './services/newSamples.js';

// When "Samples" button is clicked:
const sample = NEW_SAMPLE_COMPONENTS.REACT_COUNTER;

const sandbox = {
  id: sample.id,
  x: 100,
  y: 100,
  width: 400,
  height: 500,
  zIndex: 1000,
  state: 'loading' as const,
  sessionCode: sample.code
};

const card = new NewSandboxCard(
  canvasContainer,
  sandbox,
  {
    onClick: (id) => console.log('Clicked:', id),
    onDelete: (id) => console.log('Delete:', id)
  },
  webviewService,
  pipelineService  // ← You'll need to inject this
);
```

### Option 2: Add to Existing Samples Button

Find where the old "Samples" button creates sandboxes and add:

```typescript
// Create NEW sandbox instead of old one
if (usePipeline) {  // Add a flag or just replace
  const newCard = new NewSandboxCard(...);
} else {
  const oldCard = new SandboxCard(...);  // Keep old as fallback
}
```

---

## Key Differences

| Feature | Old SandboxCard | New SandboxCard |
|---------|----------------|-----------------|
| **Transpilation** | Babel in iframe | ESBuild in main |
| **Template Size** | 2MB | 10KB |
| **Border Color** | White/Blue | Green |
| **Label** | Component name | "🚀 NEW: ..." |
| **Dependencies** | Hardcoded CDN | Pipeline-managed |

---

## Next Steps

1. **Find** where samples button creates sandboxes
2. **Add** new sample button (or replace old one)
3. **Test** with one sample
4. **Verify** it works
5. **Remove** old code once confirmed

---

## Files Created

- ✅ `newSandboxCard.ts` - New implementation
- ✅ `newSamples.ts` - 3 sample components
- ✅ Old `sandboxCard.ts` - Untouched (reverted)

**Status:** Ready to integrate! 🚀
