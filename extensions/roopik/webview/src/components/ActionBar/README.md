# Action Bar Components - Modular Architecture

This directory contains modular, production-scale components for the Roopik IDE bottom action bar, following industry-standard design patterns.

## 📁 Directory Structure

```
ActionBar/
├── InspectPanel/
│   ├── InspectPanel.tsx          # Main container component
│   ├── InspectPanel.css          # Panel layout and positioning
│   ├── ElementInfo.tsx           # Element source, name, line display
│   ├── ElementInfo.css           # Element info styling
│   ├── StylesSection.tsx         # CSS properties display
│   └── StylesSection.css         # Styles list and color swatches
└── README.md                     # This file
```

## 🎯 Design Principles

1. **Single Responsibility**: Each component handles one concern
2. **Separation of Concerns**: UI, logic, and styling separated
3. **Reusability**: Components can be used independently
4. **Maintainability**: Easy to update individual features
5. **Testability**: Small, focused components are easier to test

## 📦 Components

### InspectPanel

**Purpose**: Container for inspect mode properties panel

**Location**: `InspectPanel/InspectPanel.tsx`

**Props**:
```typescript
interface InspectPanelProps {
  inspectedElement: InspectedElement | null;
  isInspectMode: boolean;
  onOpenInEditor?: (file: string, line: number) => void;
  onClose: () => void;
}
```

**Features**:
- Fixed positioning (right: 20px, bottom: 120px)
- Responsive width (320px desktop, 95% mobile)
- Scrollable content area (max-height: 500px)
- Header with close button
- Placeholder for empty state

**Child Components**: ElementInfo, StylesSection

---

### ElementInfo

**Purpose**: Display element source file, component/tag name, line number, parent tree

**Location**: `InspectPanel/ElementInfo.tsx`

**Props**:
```typescript
interface ElementInfoProps {
  element: InspectedElement;
  onOpenInEditor?: (file: string, line: number) => void;
}
```

**Features**:
- Compact single-row layout: `source | name | line`
- Open in editor button (arrow icon)
- Smart name display: shows both component and tag if different
  - React: `Button (button)`
  - HTML: `section`
- Parent tree hierarchy (optional)
- Monospace fonts for code elements

**Layout**:
```
[App.tsx →] Button (button) :42
tree: App > Container > Button
```

---

### StylesSection

**Purpose**: Display computed CSS properties with color swatches

**Location**: `InspectPanel/StylesSection.tsx`

**Props**:
```typescript
interface StylesSectionProps {
  styles: Record<string, string>;
}
```

**Features**:
- Dynamic style list (only non-default values)
- Color swatches for color properties
- Gradient preview for `backgroundImage`
- Truncate long values (gradients > 50 chars)
- Convert camelCase to kebab-case for display
- Scrollable list (max-height: 300px)
- Count of total styles in header

**Style Detection**:
- Color properties: `color`, `backgroundColor`, `borderColor`, etc.
- Gradients: `backgroundImage` containing "gradient"
- Regular properties: all other CSS values

**Example**:
```
Styles (47)
────────────────────────
display           flex
width             100%
padding           16px
color             [■] rgb(255, 255, 255)
background        [■] linear-gradient(...)
```

---

## 🔗 Integration

### Using in BottomActionBar.tsx

```typescript
import { InspectPanel } from './ActionBar/InspectPanel/InspectPanel';

// Inside component:
{isActionsPanelOpen && (
  <InspectPanel
    inspectedElement={inspectedElement}
    isInspectMode={isInspectMode}
    onOpenInEditor={(file, line) => onOpenInEditor?.(file, line)}
    onClose={handleActionsPanel}
  />
)}
```

### Benefits

**Before Refactor** (614 lines):
- Monolithic BottomActionBar.tsx
- All inspect UI inline (200+ lines)
- Hard to maintain and test
- Difficult to reuse components

**After Refactor** (483 lines):
- Modular component structure
- **Reduced BottomActionBar by 131 lines**
- Clear separation of concerns
- Easy to add new features (SelectMode, AIAssistant, etc.)
- Each feature in its own folder

---

## 🚀 Adding New Action Bar Features

To add a new feature (e.g., SelectMode, AIAssistant):

1. **Create feature folder**:
   ```
   ActionBar/SelectMode/
   ├── SelectMode.tsx
   ├── SelectMode.css
   ├── SelectionInfo.tsx
   └── SelectionInfo.css
   ```

2. **Create main component**:
   ```typescript
   // SelectMode.tsx
   interface SelectModeProps {
     selectedElements: Element[];
     onClose: () => void;
   }

   export function SelectMode({ selectedElements, onClose }: SelectModeProps) {
     return <div className="select-mode-panel">...</div>;
   }
   ```

3. **Import in BottomActionBar**:
   ```typescript
   import { SelectMode } from './ActionBar/SelectMode/SelectMode';

   {isSelectModeOpen && (
     <SelectMode selectedElements={selected} onClose={handleClose} />
   )}
   ```

---

## 📊 Component Metrics

| Component | Lines of Code | Responsibility |
|-----------|---------------|----------------|
| InspectPanel.tsx | 64 | Container, layout, empty state |
| ElementInfo.tsx | 70 | Element metadata display |
| StylesSection.tsx | 70 | CSS properties list |
| Total | **204 lines** | Full inspect panel functionality |

**Code Reduction**: Replaced 200+ inline lines with 204 modular lines across 3 components

---

## 🎨 Styling Approach

- Each component has dedicated CSS file
- Uses VS Code theme variables (`--vscode-*`)
- Follows VS Code design language
- Responsive breakpoints for mobile
- Consistent spacing and typography

**CSS Variables Used**:
```css
--vscode-foreground
--vscode-panel-border
--vscode-editor-background
--vscode-symbolIcon-propertyForeground
--vscode-symbolIcon-stringForeground
--vscode-scrollbarSlider-background
```

---

## 🧪 Testing Strategy

Each component can be tested independently:

```typescript
// ElementInfo.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ElementInfo } from './ElementInfo';

test('displays component name and file', () => {
  const element = {
    componentName: 'Button',
    tagName: 'button',
    file: 'src/App.tsx',
    line: 42,
    ...
  };

  render(<ElementInfo element={element} />);
  expect(screen.getByText('Button (button)')).toBeInTheDocument();
  expect(screen.getByText('App.tsx')).toBeInTheDocument();
});
```

---

## 📚 Related Files

- **Parent Component**: `webview/src/components/BottomActionBar.tsx`
- **Type Definitions**: `webview/src/utils/inspectOverlay.ts`
- **Vite Plugin**: `src/projectRunner/plugins/roopikInjectPlugin.js`
- **Project View**: `webview/src/projectView/ProjectView.tsx`

---

## 🔮 Future Features

Planned modular components:

1. **SelectMode/** - Single element selection properties
2. **RectangleSelectionMode/** - Multi-element selection
3. **AIAssistantPanel/** - AI chat overlay
4. **ColorPickerPanel/** - Color editing UI
5. **TextEditorPanel/** - Inline text editing

Each feature will follow the same modular structure as InspectPanel.

---

## 📝 Changelog

### v1.0.0 (Current)
- ✅ Created InspectPanel modular component
- ✅ Extracted ElementInfo component
- ✅ Extracted StylesSection component
- ✅ Integrated into BottomActionBar
- ✅ Reduced BottomActionBar by 131 lines
- ✅ All TypeScript errors resolved

### Next (Planned)
- 🔄 Create SelectMode component
- 🔄 Create RectangleSelectionMode component
- 🔄 Create AIAssistantPanel component

---

**Built with ❤️ for production-scale code quality**
