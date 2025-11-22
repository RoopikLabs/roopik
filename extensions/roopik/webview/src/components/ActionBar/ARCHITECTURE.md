# Inspect Panel Component Hierarchy

## Component Tree

```
BottomActionBar (483 lines)
├── 🎯 Selection Tools (buttons)
├── 🎨 Contextual Actions (text/image/color)
├── 🤖 AI Chat Overlay (floating input)
└── 📋 InspectPanel (64 lines) ← NEW MODULAR COMPONENT
    ├── Header
    │   ├── Properties title
    │   └── Close button
    └── Content
        ├── ElementInfo (70 lines) ← EXTRACTED
        │   ├── Source file + open button
        │   ├── Component/Tag name
        │   ├── Line number
        │   └── Parent tree (optional)
        └── StylesSection (70 lines) ← EXTRACTED
            ├── Section title + count
            └── Style items list
                ├── Property name (kebab-case)
                └── Value
                    ├── Color swatch (if color)
                    ├── Gradient swatch (if gradient)
                    └── Text value
```

## Data Flow

```
ProjectView.tsx
    ↓ (inspect message)
roopikInjectPlugin.js (Vite plugin)
    ↓ (sends roopik-inspect-element)
ProjectView.tsx
    ↓ (setState: inspectedElement)
BottomActionBar.tsx
    ↓ (props: inspectedElement)
InspectPanel.tsx
    ├→ ElementInfo.tsx (displays element metadata)
    └→ StylesSection.tsx (displays CSS properties)
```

## Message Protocol

```
User hovers → Vite plugin creates blue overlay
User clicks → Plugin sends message:
{
  type: 'roopik-inspect-element',
  data: {
    componentName: 'Button',
    tagName: 'button',
    file: 'src/App.tsx',
    line: 42,
    column: 10,
    computedStyles: {
      display: 'flex',
      padding: '16px',
      color: 'rgb(255,255,255)',
      backgroundImage: 'linear-gradient(...)',
      // ... 100+ properties
    },
    parentContext: 'src/App.tsx:10|App > Container > Button'
  }
}

ProjectView receives → updates state → passes to BottomActionBar
BottomActionBar renders → InspectPanel displays data
```

## File Structure

```
extensions/roopik/
├── src/
│   └── projectRunner/
│       └── plugins/
│           └── roopikInjectPlugin.js        # Script injection during build
│
└── webview/
    └── src/
        ├── projectView/
        │   └── ProjectView.tsx               # Receives inspect messages
        ├── components/
        │   ├── BottomActionBar.tsx           # Main action bar (REFACTORED)
        │   └── ActionBar/
        │       ├── README.md                 # Documentation
        │       └── InspectPanel/
        │           ├── InspectPanel.tsx      # Container
        │           ├── InspectPanel.css      # Layout
        │           ├── ElementInfo.tsx       # Element metadata
        │           ├── ElementInfo.css       # Metadata styling
        │           ├── StylesSection.tsx     # CSS properties
        │           └── StylesSection.css     # Properties styling
        └── utils/
            └── inspectOverlay.ts             # TypeScript interfaces
```

## Before vs After

### Before (Monolithic)
```
BottomActionBar.tsx (614 lines)
├── Selection tools (50 lines)
├── Contextual actions (50 lines)
├── AI chat overlay (100 lines)
└── Properties panel (200+ lines) ← ALL INLINE
    ├── Element info (inline JSX)
    ├── Styles rendering (inline JSX)
    ├── Color swatches (inline logic)
    └── Placeholder (inline JSX)
```

### After (Modular)
```
BottomActionBar.tsx (483 lines) ← REDUCED BY 131 LINES
├── Selection tools (50 lines)
├── Contextual actions (50 lines)
├── AI chat overlay (100 lines)
└── <InspectPanel /> (5 lines) ← CLEAN IMPORT

ActionBar/InspectPanel/ (204 lines total)
├── InspectPanel.tsx (64 lines)
├── ElementInfo.tsx (70 lines)
└── StylesSection.tsx (70 lines)
```

## Benefits

✅ **Maintainability**: Each component has single responsibility
✅ **Testability**: Can test components independently
✅ **Reusability**: Components can be used elsewhere
✅ **Scalability**: Easy to add new features (SelectMode, AIAssistant)
✅ **Readability**: Clear structure, no 600+ line files
✅ **Debugging**: Easier to locate and fix issues

## Next Steps

Following the same pattern for:
1. **SelectMode** - Single element selection
2. **RectangleSelectionMode** - Multi-element selection
3. **AIAssistantPanel** - AI chat overlay
4. **ColorPickerPanel** - Color editing
5. **TextEditorPanel** - Inline text editing
