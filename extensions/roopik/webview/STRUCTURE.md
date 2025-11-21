# Webview Structure - ComponentView & ProjectView

## Directory Structure

```
webview/
├── package.json              # SHARED - all dependencies
├── tsconfig.json             # SHARED - TypeScript config
├── vite.config.ts            # SHARED - Multi-entry build
├── src/
│   ├── componentView/        # Mode 1: Canvas/Component editing
│   │   ├── ComponentView.tsx # Main app (was App.tsx)
│   │   ├── ComponentView.css # Styles
│   │   ├── index.css         # Global styles
│   │   └── main.tsx          # Entry point
│   │
│   ├── projectView/          # Mode 2: Project preview with browser chrome
│   │   ├── ProjectView.tsx   # Main app (browser chrome + iframe)
│   │   ├── ProjectView.css   # Styles
│   │   ├── index.css         # Global styles
│   │   └── main.tsx          # Entry point
│   │
│   ├── components/           # SHARED components
│   │   ├── BottomActionBar.tsx
│   │   ├── BottomActionBar.css
│   │   ├── FloatingToolbar.tsx
│   │   ├── InfiniteCanvas.tsx
│   │   ├── StatusBar.tsx
│   │   └── ...
│   │
│   ├── hooks/                # SHARED hooks
│   │   └── useFPS.ts
│   │
│   ├── data/                 # SHARED data
│   │   └── sampleComponents.ts
│   │
│   ├── utils/                # SHARED utilities
│   │   └── ...
│   │
│   └── types.ts              # SHARED types
│
└── build/                    # Output
    ├── componentView.js      # Built ComponentView
    └── projectView.js        # Built ProjectView
```

## Build Configuration

### Multi-Entry Vite Config

The `vite.config.ts` will be configured to build both apps:

```typescript
export default {
  build: {
    rollupOptions: {
      input: {
        componentView: 'src/componentView/main.tsx',
        projectView: 'src/projectView/main.tsx'
      }
    }
  }
}
```

## Next Steps

1. ✅ Copy shared components, hooks, data, utils
2. ✅ Create ComponentView structure
3. ⏳ Create ProjectView structure
4. ⏳ Update vite.config.ts for multi-entry
5. ⏳ Install dependencies
6. ⏳ Test build

## Status

- ComponentView: Files copied, imports updated
- ProjectView: Not yet created
- Shared resources: Copied
- Build config: Not yet updated
