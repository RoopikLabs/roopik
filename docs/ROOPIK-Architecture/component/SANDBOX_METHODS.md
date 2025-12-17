# Sandbox Card Methods Documentation

Complete reference for all public methods available in `NewSandboxCard` class.

---

## Table of Contents
- [Reload Methods](#reload-methods)
- [State Management](#state-management)
- [Position & Size](#position--size)
- [Device Emulation](#device-emulation)
- [Drag Operations](#drag-operations)
- [Update Methods](#update-methods)

---

## Reload Methods

### `reloadComponent()`

**Smart reload** - Recreates the webview and forces fresh processing from original source code.

#### When to Use
- Component fails to render due to CDN issues
- HTTP timeouts occur
- Component gets stuck in error state
- Cache issues prevent proper rendering
- User changes code and wants to re-render

#### How It Works

```typescript
// 1. User clicks reload button or code is updated
reloadComponent()
```

**Complete Flow:**

```typescript
// Step 1: Clear error state
this._state = 'loading'
this.sandbox.state = 'loading'
this.sandbox.errorMessage = undefined

// Step 2: Destroy old webview completely
webviewElement.dispose()
webviewContainer.remove()
webviewWrapper.remove()

// Step 3: Create fresh webview
createWebview()
  ↓
  // Automatically triggers after 500ms
  setTimeout(() => {
    processComponentWithPipeline()
  }, 500)

// Step 4: Pipeline Processing
processComponentWithPipeline()
  ↓
  // Detect framework (React/Vue/Svelte/etc)
  const framework = detectFramework(this.sandbox.sessionCode)
  // Returns: 'react', 'vue', 'svelte', 'solid', 'preact', or 'html'

  ↓
  // Get correct file extension
  const filename = getFilenameForFramework(framework)
  // Returns: 'Component.jsx', 'Component.vue', 'Component.svelte', etc.

  ↓
  // Send to ESBuild pipeline in MAIN PROCESS
  const jobId = await pipelineService.processComponent({
    id: this.sandbox.id,
    source: 'ai',
    files: {
      [filename]: this.sandbox.sessionCode  // ← ORIGINAL SOURCE CODE!
    },
    dependencies: getDependenciesForFramework(framework)
    // e.g., { 'react': '18', 'react-dom': '18' }
  })

  ↓
  // Wait for ESBuild to finish compilation
  const result = await pipelineService.waitForCompletion(jobId)

  ↓
  // Send bundled code to webview
  webviewElement.postMessage({
    type: 'execute',
    code: result.bundledCode  // ← ESBuild compiled & bundled!
  })
```

**What ESBuild Does (Main Process):**

1. **Takes original code** from `sandbox.sessionCode`
2. **Compiles JSX/TSX** → JavaScript
3. **Bundles imports** → Single file
4. **Resolves dependencies** → CDN URLs (esm.sh)
5. **Applies framework plugins** (Vue SFC compiler, Svelte preprocessor)
6. **Returns bundled code** → Ready to execute

**Webview Execution:**

```javascript
// Inside the webview iframe:
window.addEventListener('message', async (event) => {
  if (event.data.type === 'execute') {
    // Create blob URL from bundled code
    const blobUrl = URL.createObjectURL(
      new Blob([event.data.code], { type: 'application/javascript' })
    )

    // Execute as ES module
    await import(blobUrl)

    // Clean up
    URL.revokeObjectURL(blobUrl)
  }
})
```

#### Benefits

✅ **Complete fresh start** - New iframe, new JavaScript context
✅ **Fresh HTTP cache** - New CDN requests bypass stale cache
✅ **Error state cleared** - Removes stuck error states
✅ **Memory leak prevention** - Old webview fully disposed
✅ **Recompiles from source** - Always uses latest original code

#### Example Usage

```typescript
// Manual reload
sandboxCard.reloadComponent()

// Automatic reload when code changes
sandboxCard.update({
  sessionCode: newCode
})
// ↑ This triggers reprocessing automatically
```

#### Console Output

```
[NewSandboxCard] Smart reload initiated...
[NewSandboxCard] Smart reload complete - fresh webview created
[NewSandboxCard] ✅ Rendered via pipeline! {
  framework: 'react',
  cdnUrls: ['https://esm.sh/react@18?dev', 'https://esm.sh/react-dom@18/client?dev'],
  size: 1234
}
```

---

## State Management

### `setState(state: SandboxState, errorMessage?: string)`

Updates the render state of the sandbox.

#### Parameters
- `state`: `'loading' | 'ready' | 'error'`
- `errorMessage`: Optional error message (only used when state is 'error')

#### Example

```typescript
// Set loading state
sandboxCard.setState('loading')

// Set error state with message
sandboxCard.setState('error', 'Failed to fetch CDN resources')

// Set ready state
sandboxCard.setState('ready')
```

### `setSelected(selected: boolean)`

Sets the selection state and updates visual styling.

#### Visual Changes
- **Selected**: Blue border (`rgba(59, 130, 246, 0.8)`)
- **Not Selected**: Default border

#### Example

```typescript
sandboxCard.setSelected(true)  // Shows blue selection border
sandboxCard.setSelected(false) // Removes selection
```

### `setFocused(focused: boolean)`

Sets the focus state (typically for fullscreen/expanded mode).

#### Visual Changes
- **Focused**: Purple border (`rgba(168, 85, 247, 0.8)`)
- **Not Focused**: Default border

#### Example

```typescript
sandboxCard.setFocused(true)  // Shows purple focus border
sandboxCard.setFocused(false) // Removes focus
```

---

## Position & Size

### `updatePosition(x: number, y: number)`

Updates the sandbox position on the canvas.

#### Example

```typescript
sandboxCard.updatePosition(100, 200)
// Moves card to x=100px, y=200px
```

### `updateSize(width: number, height: number)`

Updates the sandbox dimensions and re-applies device emulation.

#### Example

```typescript
sandboxCard.updateSize(800, 600)
// Resizes card to 800x600px
// Automatically recalculates device emulation scaling
```

### `updateZIndex(zIndex: number)`

Updates the stacking order of the sandbox.

#### Example

```typescript
sandboxCard.updateZIndex(10)
// Brings card to front (higher z-index)
```

---

## Device Emulation

### `setGlobalDeviceMode(mode: DevicePreset)`

Sets the global device mode (only applies if sandbox has no override).

#### Device Presets
- `'auto'`: Natural size, fills available space
- `'desktop'`: 1920×1080px
- `'laptop'`: 1366×768px
- `'tablet'`: 768×1024px
- `'mobile'`: 375×667px

#### Example

```typescript
sandboxCard.setGlobalDeviceMode('mobile')
// If sandbox has no override, switches to mobile view
```

### `forceDeviceMode(mode: DevicePreset)`

Forces a device mode, clearing any sandbox-specific override.

#### Example

```typescript
sandboxCard.forceDeviceMode('tablet')
// Clears override and forces tablet mode
```

### `resetToGlobalDeviceMode()`

Removes sandbox-specific device mode override.

#### Example

```typescript
sandboxCard.resetToGlobalDeviceMode()
// Returns to using global device mode
```

---

## Drag Operations

### `setDragging(dragging: boolean)`

Sets the dragging state and optimizes performance.

#### Performance Optimizations When Dragging
- ✅ Disables `backdrop-filter` (GPU-heavy blur)
- ✅ Disables CSS transitions
- ✅ Disables webview pointer events
- ✅ Simplifies box-shadow
- ✅ Changes cursor to `grabbing`

#### Auto-Clears Overlap
When dragging ends (`dragging = false`), automatically clears overlap indicator.

#### Example

```typescript
// Start drag
sandboxCard.setDragging(true)
// ↑ Disables heavy CSS for smooth dragging

// End drag
sandboxCard.setDragging(false)
// ↑ Re-enables glass effects, clears overlap
```

### `setOverlapping(overlapping: boolean)`

Shows/hides the overlap warning indicator during drag.

#### Visual Changes
- **Overlapping**: Yellow/amber border (`rgba(251, 191, 36, 0.8)`)
- **Not Overlapping**: Normal drag border

#### Example

```typescript
sandboxCard.setOverlapping(true)
// Shows yellow warning border
```

### `applyDragOffset(offsetX: number, offsetY: number)`

Applies visual transform during drag (doesn't update actual position).

#### How It Works
Uses `transform: translate3d()` for GPU-accelerated movement.

#### Example

```typescript
// During mouse move
const offsetX = mouseX - dragStartX
const offsetY = mouseY - dragStartY
sandboxCard.applyDragOffset(offsetX, offsetY)
// ↑ Card follows mouse smoothly
```

### `commitDragPosition(newX: number, newY: number)`

Commits the final position after drag ends.

#### How It Works
1. Clears the transform
2. Updates actual position
3. Updates sandbox data

#### Example

```typescript
// On mouse up
const finalX = sandbox.x + offsetX
const finalY = sandbox.y + offsetY
sandboxCard.commitDragPosition(finalX, finalY)
// ↑ Finalizes position, clears transform
```

---

## Update Methods

### `update(sandbox: Partial<Sandbox>)`

Updates sandbox data and re-renders affected parts.

#### Triggers
- **Position change** (`x`, `y`) → Calls `updatePosition()`
- **Size change** (`width`, `height`) → Calls `updateSize()`
- **Z-index change** (`zIndex`) → Calls `updateZIndex()`
- **Code change** (`sessionCode`) → Calls `processComponentWithPipeline()`

#### Example

```typescript
// Update position
sandboxCard.update({ x: 100, y: 200 })

// Update size
sandboxCard.update({ width: 800, height: 600 })

// Update code (triggers recompilation!)
sandboxCard.update({
  sessionCode: newReactCode
})
// ↑ Automatically recompiles and re-renders

// Update multiple properties
sandboxCard.update({
  x: 100,
  y: 200,
  width: 800,
  height: 600,
  sessionCode: newCode
})
```

---

## Getters

### `getElement(): HTMLElement`

Returns the container DOM element.

#### Example

```typescript
const container = sandboxCard.getElement()
container.classList.add('custom-class')
```

### `getSandbox(): Sandbox`

Returns the sandbox data object.

#### Example

```typescript
const sandbox = sandboxCard.getSandbox()
console.log(sandbox.id, sandbox.x, sandbox.y)
```

---

## Lifecycle

### `dispose()`

Cleans up and removes the sandbox card.

#### What It Does
1. Disposes webview element
2. Removes container from DOM
3. Calls parent disposable cleanup

#### Example

```typescript
sandboxCard.dispose()
// ↑ Completely removes card and cleans up resources
```

---

## Framework Detection

The sandbox card automatically detects the framework from code:

### Detection Logic

```typescript
// Vue SFC
if (code.includes('<template>') && code.includes('<script'))
  → 'vue' → 'Component.vue'

// Svelte
if (code.includes('<script>') && code.includes('<style>') && !code.includes('<template>'))
  → 'svelte' → 'Component.svelte'

// Vanilla HTML
if (code.trim().startsWith('<') && !code.includes('import React'))
  → 'html' → 'index.html'

// Solid
if (code.includes('solid-js'))
  → 'solid' → 'Component.tsx'

// Preact
if (code.includes('preact'))
  → 'preact' → 'Component.jsx'

// Default
  → 'react' → 'Component.jsx'
```

### Dependency Resolution

Each framework gets its dependencies automatically:

```typescript
{
  'react': { 'react': '18', 'react-dom': '18' },
  'vue': { 'vue': '3.4.21' },
  'svelte': { 'svelte': '4.2.15' },
  'solid': { 'solid-js': '1.8.0' },
  'preact': { 'preact': '10.19.0' },
  'html': {}
}
```

---

## Best Practices

### ✅ DO

- Use `update()` for batch changes
- Call `reloadComponent()` when stuck in error state
- Use `setDragging()` for smooth drag performance
- Dispose cards when no longer needed

### ❌ DON'T

- Don't manipulate DOM directly (use methods)
- Don't skip `setDragging(false)` after drag
- Don't forget to dispose when removing cards
- Don't bypass the pipeline (always use `update()` for code changes)

---

## Performance Tips

1. **Dragging**: Always call `setDragging(true)` before drag starts
2. **Batch Updates**: Use single `update()` call for multiple changes
3. **Device Emulation**: Use global mode when possible (less per-card overhead)
4. **Reload**: Only reload when necessary (it recreates the entire webview)

---

*Last Updated: 2025-12-01*
