# Inspect Mode Implementation Guide

## Overview
Inspect Mode allows developers to hover over elements in the live preview and see their properties (component name, file location, CSS classes, computed styles) in a draggable, transparent overlay panel.

## Architecture Flow

```
User hovers over element in iframe
    ↓
roopikInjectPlugin.js (injected into iframe)
    ↓
Captures element metadata + computed styles
    ↓
postMessage to parent webview
    ↓
ProjectView.tsx receives message
    ↓
Updates inspectedElement state
    ↓
Passes to BottomActionBar
    ↓
Renders InspectPanel component
```

## Initial Challenge: Iframe Isolation

**Problem**: The preview runs in an iframe with its own context. Initial implementation failed because:
- Click-to-source worked (already had postMessage infrastructure)
- But hover events weren't captured from iframe to parent webview
- Properties panel remained empty despite inspect mode being active

**Root Cause Analysis**:
- Analyzed existing `click-to-source` flow in `roopikInjectPlugin.js`
- Found Babel plugin transforms that inject source metadata (`__source` prop)
- Realized we needed to extend the injection script, not create separate hover listeners in parent

**Solution**:
- Extended `roopikInjectPlugin.js` to inject hover event listeners inside iframe
- Used existing postMessage channel to communicate element data to parent
- Added `elementInspected` message type alongside existing `click-to-source`

## Key Components

### 1. Injection Script (`roopikInjectPlugin.js`)

**Location**: `src/projectRunner/plugins/roopikInjectPlugin.js`

**Purpose**: Injects into the iframe's runtime to capture element interactions

**Key Functions**:
- `createInspectTooltip()`: Shows hover tooltip with component name + filename
- `extractComputedStyles()`: Captures 100+ CSS properties via `getComputedStyle()`
- `handleMouseMove()`: On hover, posts message with element data to parent

**Critical Code**:
```javascript
window.addEventListener('mousemove', (e) => {
  if (window.__ROOPIK_INSPECT_MODE__) {
    const element = e.target;
    const computedStyles = extractComputedStyles(element);

    window.parent.postMessage({
      type: 'elementInspected',
      element: {
        tagName,
        componentName,
        fileName,
        className,
        computedStyles,
        parentContext
      }
    }, '*');
  }
});
```

### 2. Message Handler (`ProjectView.tsx`)

**Location**: `webview/src/projectView/ProjectView.tsx`

**Responsibilities**:
- Listens for `elementInspected` messages from iframe
- Updates `inspectedElement` state
- Toggles inspect mode via `startInspectMode`/`stopInspectMode` postMessage to extension

**Critical State**:
```typescript
const [isInspectMode, setIsInspectMode] = useState(false);
const [inspectedElement, setInspectedElement] = useState<InspectedElement | null>(null);
```

**Message Flow**:
```typescript
case 'elementInspected':
  setInspectedElement(message.element);
  break;
```

### 3. Properties Panel (`InspectPanel` Component)

**Location**: `webview/src/components/ActionBar/InspectPanel/`

**Structure**:
- `InspectPanel.tsx` - Main container with drag & transparency
- `ElementInfo.tsx` - Shows file, component name, CSS classes
- `StylesSection.tsx` - Displays computed CSS properties with color swatches

**Features**:
- **Draggable**: Click header to drag anywhere on screen
- **Transparency Toggle**: Eye icon switches between 95% and 50% opacity
- **Click-through Mode**: When transparent, clicks pass through panel to elements behind
- **Centered Position**: Starts at screen center, remembers drag offset
- **Keyboard Support**: ESC key closes panel

**Critical Implementation Details**:

1. **Drag Bounds Calculation**:
```typescript
// Calculate bounds from center position (left: 50%, top: 50%)
const halfWidth = panelRef.current.offsetWidth / 2;
const halfHeight = panelRef.current.offsetHeight / 2;

const minX = -window.innerWidth / 2 + halfWidth;
const maxX = window.innerWidth / 2 - halfWidth;
```

2. **Pointer Events (Click-through)**:
```css
.inspect-panel.transparent {
  pointer-events: none; /* Panel is click-through */
}

.inspect-panel-header {
  pointer-events: auto; /* Header always interactive */
}
```

3. **Mutual Exclusivity**:
Only one mode (Select/Inspect/Rectangle) can be active at a time. Activating one deactivates others:
```typescript
const handleInspectMode = () => {
  const newState = !isInspectMode;
  setIsInspectMode(newState);
  if (newState) {
    setIsSelectMode(false);
    setIsRectangleMode(false);
  }
};
```

## Data Flow

### Starting Inspect Mode
1. User clicks Inspect button in BottomActionBar
2. `ProjectView.tsx` posts `startInspectMode` to VS Code extension
3. Extension enables inspect mode flag
4. Webview sets `window.__ROOPIK_INSPECT_MODE__ = true` in iframe
5. Injected script starts capturing hover events

### Capturing Element Data
1. User hovers over element in iframe
2. Injected script extracts:
   - Component name from `__source.fileName` (Babel transform)
   - Element className, tagName
   - Computed styles via `getComputedStyle()`
   - Parent hierarchy
3. Posts `elementInspected` message to parent webview

### Displaying Properties
1. `ProjectView.tsx` receives message, updates `inspectedElement` state
2. Passes to `BottomActionBar` as prop
3. BottomActionBar renders `InspectPanel` when both conditions met:
   - `isInspectMode === true`
   - `inspectedElement !== null`

### Stopping Inspect Mode
1. User clicks Inspect button again OR presses ESC OR clicks panel close button
2. Triggers `onInspectMode()` callback
3. Posts `stopInspectMode` to extension
4. Sets `window.__ROOPIK_INSPECT_MODE__ = false` in iframe
5. Panel closes automatically (conditional rendering)

## Critical Integration Points

### 1. Babel Transform
The Babel plugin (`roopikBabelPlugin.js`) injects `__source` metadata:
```javascript
<Component __source={{ fileName: 'App.tsx', lineNumber: 10 }} />
```
This is how we know the component name and file location.

### 2. PostMessage Channel
All iframe-to-webview communication uses `window.parent.postMessage()`. The parent listens via:
```typescript
window.addEventListener('message', handleMessage);
```

### 3. Vite Plugin Integration
`roopikInjectPlugin.js` is registered as a Vite plugin that transforms the HTML to inject the inspection script before app code loads.

## Common Pitfalls

1. **Empty Properties Panel**: Ensure `window.__ROOPIK_INSPECT_MODE__` is set in iframe context, not just parent webview
2. **Click-through Not Working**: Parent container needs `pointer-events: none`, header needs `pointer-events: auto`
3. **Multiple Modes Active**: Mode handlers must check `newState` before deactivating other modes
4. **Dragging Stuck**: Bounds calculation must account for `transform: translate(-50%, -50%)` centering
5. **Panel Doesn't Close**: `onClose` callback must call `onInspectMode?.()` to stop inspect mode

## Testing Checklist

- [ ] Hover shows tooltip with component name
- [ ] Panel displays after hovering on element
- [ ] Properties update as you hover different elements
- [ ] Panel is draggable within screen bounds
- [ ] Transparency toggle works (eye icon)
- [ ] Click-through works when transparent
- [ ] Header remains draggable when transparent
- [ ] ESC key closes panel
- [ ] Close button (X) closes panel
- [ ] Only one mode active at a time
- [ ] CSS classes display correctly
- [ ] Color swatches appear for color properties
- [ ] File path opens in editor when clicked

## Future Enhancements

- Add search/filter for CSS properties
- Show inherited styles vs direct styles
- Display pseudo-elements (::before, ::after)
- Add "Copy CSS" button
- Show CSS specificity information
- Highlight matched CSS rules from stylesheets
