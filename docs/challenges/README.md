# Roopik Development Challenges

> Collection of technical challenges encountered during Roopik development and their solutions.

---

## Browser Preview V2 (WebContentsView) Challenges

These documents cover challenges faced while implementing the Browser Preview V2 feature using Electron's WebContentsView.

### Core Issues Resolved

| Challenge | Status | Document |
|-----------|--------|----------|
| Website reloads on tab switch | RESOLVED | [Tab Switching](./BROWSER_VIEW_TAB_SWITCHING.md) |
| Ghost browser views on IDE reload | RESOLVED | [Ghost Process](./BROWSER_VIEW_GHOST_PROCESS.md) |
| Double browser view creation | RESOLVED | [Double Initialization](./BROWSER_VIEW_DOUBLE_INITIALIZATION.md) |
| Placeholder hidden by native view | RESOLVED | [Visibility](./WEBCONTENTSVIEW_VISIBILITY.md) |
| Localhost/dev server not loading | RESOLVED | [Localhost Loading](./LOCALHOST_LOADING.md) |

---

## Quick Reference

### The Tab Switch Problem
**Issue**: Browser view destroyed on tab switch, causing page reload.
**Solution**: Only hide in `clearInput()`, destroy only in `dispose()`.
**File**: [BROWSER_VIEW_TAB_SWITCHING.md](./BROWSER_VIEW_TAB_SWITCHING.md)

### The Ghost Process Problem
**Issue**: Browser view persists after IDE reload as uncontrollable "ghost".
**Solution**: Safety Leash pattern - attach window lifecycle listeners to auto-destroy.
**File**: [BROWSER_VIEW_GHOST_PROCESS.md](./BROWSER_VIEW_GHOST_PROCESS.md)

### The Double Initialization Problem
**Issue**: Race condition creates two browser views simultaneously.
**Solution**: Single entry point - only initialize in `setInput()`, not `createEditor()`.
**File**: [BROWSER_VIEW_DOUBLE_INITIALIZATION.md](./BROWSER_VIEW_DOUBLE_INITIALIZATION.md)

### The Visibility Problem
**Issue**: WebContentsView renders above all DOM elements, hiding placeholder.
**Solution**: Use native `setVisible()` API instead of CSS.
**File**: [WEBCONTENTSVIEW_VISIBILITY.md](./WEBCONTENTSVIEW_VISIBILITY.md)

### The Localhost Loading Problem
**Issue**: `http://localhost:5173` shows white screen with no errors (silent failure).
**Solution**: Configure session with proxy bypass, certificate verification, and permission handlers.
**File**: [LOCALHOST_LOADING.md](./LOCALHOST_LOADING.md)

---

## Key Files

```
src/vs/workbench/contrib/roopik/
├── browser/
│   └── projectModeV2/
│       └── projectModeV2Editor.ts    # Editor lifecycle, visibility
│
└── electron-main/
    └── projectModeV2/
        └── browserViewServiceV2.ts   # Native view management, Safety Leash
```

---

## Patterns Learned

### 1. Visibility Toggle Pattern (from Cursor IDE)
```typescript
// Tab switch away: HIDE, don't destroy
clearInput() → setBrowserVisible(false)

// Tab switch back: SHOW, don't recreate
setInput() → setBrowserVisible(true)

// Tab close: DESTROY
dispose() → destroyBrowserView()
```

### 2. Safety Leash Pattern
```typescript
// Attach to window lifecycle events
window.webContents.once('did-start-loading', autoDestroy);
window.once('closed', autoDestroy);
window.webContents.once('render-process-gone', autoDestroy);
```

### 3. Single Entry Point Pattern
```typescript
// DON'T: Multiple initialization points
createEditor() → initializeBrowserView()  // Call 1
setInput() → initializeBrowserView()      // Call 2 (race!)

// DO: Single initialization point
createEditor() → DOM only
setInput() → initializeBrowserView()      // Only call site
```

### 4. State Sync Pattern
```typescript
// DON'T: Use stale input URL
controlBar.setUrl(input.url);  // Original URL, not current!

// DO: Get current state from browser
const state = await browserService.getNavigationState(viewId);
controlBar.setUrl(state.url);  // Actual current URL
```

### 5. Localhost Session Pattern
```typescript
// Configure session BEFORE creating browser view
const browserSession = session.fromPartition('persist:roopik-browser');

// Bypass proxy for localhost
await browserSession.setProxy({
    mode: 'direct',
    proxyBypassRules: 'localhost;127.0.0.1;[::1];*.local'
});

// Trust all certificates (dev servers use self-signed)
browserSession.setCertificateVerifyProc((_request, callback) => callback(0));

// Auto-grant permissions
browserSession.setPermissionRequestHandler((_, permission, callback) => {
    callback(['media', 'clipboard-read', 'clipboard-write'].includes(permission));
});
```

---

## Debugging Tips

### Enable Logging
All challenges were debugged using strategic logging:
```typescript
this.logger.info(`[ProjectModeV2] #${this.instanceId} clearInput: browser view preserved (viewId=${this.browserViewId})`);
```

### Instance Counter
Track which editor instance is logging:
```typescript
private static instanceCounter = 0;
private readonly instanceId = ++ProjectModeV2Editor.instanceCounter;
```

### Main Process Logs
Check main process console for native view operations:
```
[ProjectModeV2] SAFETY LEASH TRIGGERED - Auto-destroying browser view 2
```

---

## Related Documentation

- [WebContentsView Browser Ghost](../WebcontentsView%20Browser%20Ghost.md)
- [Mode 2 Security](../MODE2_SECURITY.md)
- [Core Migration Architecture](../CORE_MIGRATION_ARCHITECTURE.md)
