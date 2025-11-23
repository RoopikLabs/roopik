# Message Bridge System

## Overview

The Message Bridge simplifies communication between **iframe ↔ webview ↔ extension** by automatically forwarding messages and providing type-safe helper functions.

**Before**: Manual `postMessage` chains with repetitive code
**After**: Clean, type-safe abstractions with automatic forwarding

---

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Iframe    │ ──────> │   Webview    │ ──────> │  Extension  │
│ (localhost) │         │  (React App) │         │  (Node.js)  │
└─────────────┘         └──────────────┘         └─────────────┘
     postMessage          Message Bridge          vscode.postMessage
```

---

## Files

### Webview Side
- **`webview/src/utils/messageTypes.ts`** - TypeScript types for all messages
- **`webview/src/utils/messageBridge.ts`** - Bridge implementation and helpers

### Extension Side
- **`src/types/previewMessages.ts`** - TypeScript types for extension messages

---

## Usage

### 1. Setup Message Bridge (Webview)

In your React component (e.g., `ProjectView.tsx`):

```typescript
import { setupMessageBridge, sendToIframe, sendToExtension } from '../utils/messageBridge';
import type { IframeToWebviewMessage } from '../utils/messageTypes';

// Setup bridge on mount
useEffect(() => {
  const cleanup = setupMessageBridge(vscode, (message: IframeToWebviewMessage) => {
    // Handle messages that need webview-side processing
    switch (message.type) {
      case 'roopik-navigate':
        // Update address bar, navigation history, etc.
        setAddressBarValue(message.url);
        break;

      case 'roopik-inspect-element':
        // Update inspected element state
        setInspectedElement(message.element);
        break;
    }
  });

  return cleanup; // Cleanup on unmount
}, []);
```

**What it does:**
- ✅ Automatically forwards iframe messages to extension
- ✅ Transforms message types (e.g., `roopik-click-to-source` → `click-to-source`)
- ✅ Calls your callback for messages that need local handling

---

### 2. Send Messages to Iframe

```typescript
import { sendToIframe } from '../utils/messageBridge';

// Send debug mode toggle
sendToIframe(iframeRef.current, {
  type: 'roopik-toggle-debug',
  enabled: true
});

// Send inspect mode toggle
sendToIframe(iframeRef.current, {
  type: 'roopik-toggle-inspect',
  enabled: true
});

// Send handshake
sendToIframe(iframeRef.current, {
  type: 'ROOPIK_HANDSHAKE_SYN',
  secret: 'ROOPIK_IDE_HANDSHAKE_v1'
});
```

**Benefits:**
- ✅ Type-safe (TypeScript checks message structure)
- ✅ Handles iframe null checks automatically
- ✅ Error handling built-in

---

### 3. Send Messages to Extension

```typescript
import { sendToExtension } from '../utils/messageBridge';

// Send click-to-source
sendToExtension(vscode, {
  type: 'click-to-source',
  file: '/path/to/file.jsx',
  line: 42,
  column: 10
});

// Send toggle highlight mode
sendToExtension(vscode, {
  type: 'toggle-highlight-mode',
  enabled: true
});

// Stop server
sendToExtension(vscode, {
  type: 'stop-server'
});
```

---

### 4. Handle Messages in Extension

In your extension code (e.g., `projectPreviewPanel.ts`):

```typescript
import type { ExtensionMessage, ExtensionClickToSourceMessage } from './types/previewMessages';

this._panel.webview.onDidReceiveMessage(
  async (message: ExtensionMessage) => {
    switch (message.type) {
      case 'click-to-source':
        await this._handleClickToSource(message);
        break;

      case 'iframe-log':
        // Handle log message
        this._iframeLogger.info(message.args);
        break;

      // ... other cases
    }
  }
);
```

**Benefits:**
- ✅ Type-safe message handling
- ✅ TypeScript autocomplete for message properties
- ✅ Compile-time error checking

---

## Message Types

### Iframe → Webview

| Type | Description | Forwarded? |
|------|-------------|------------|
| `roopik-log` | Console log from iframe | ✅ Yes → `iframe-log` |
| `roopik-click-to-source` | Click-to-source event | ✅ Yes → `click-to-source` |
| `roopik-title-change` | Page title changed | ✅ Yes → `update-title` |
| `roopik-navigate` | Navigation occurred | ✅ Yes → `navigate` |
| `roopik-browser-shortcut-blocked` | Browser shortcut blocked | ❌ No (local only) |
| `roopik-inspect-element` | Element inspected | ❌ No (local only) |

### Webview → Iframe

| Type | Description |
|------|-------------|
| `roopik-toggle-debug` | Toggle debug mode |
| `roopik-toggle-inspect` | Toggle inspect mode |
| `ROOPIK_HANDSHAKE_SYN` | Authentication handshake |
| `roopik-init-url` | Initialize URL |

### Webview → Extension

| Type | Description |
|------|-------------|
| `iframe-log` | Console log (from iframe) |
| `click-to-source` | Click-to-source event |
| `toggle-highlight-mode` | Toggle highlight mode |
| `navigate` | Navigation occurred |
| `update-title` | Update panel title |
| `stop-server` | Stop dev server |

---

## Message Flow Examples

### Example 1: Click-to-Source

```
1. User clicks element in iframe
   ↓
2. Iframe sends: { type: 'roopik-click-to-source', file: '...', line: 42 }
   ↓
3. Message Bridge transforms to: { type: 'click-to-source', file: '...', line: 42 }
   ↓
4. Extension receives and opens file in VS Code
```

### Example 2: Navigation

```
1. User navigates in iframe
   ↓
2. Iframe sends: { type: 'roopik-navigate', url: 'http://localhost:5173/about' }
   ↓
3. Message Bridge forwards to extension AND calls local handler
   ↓
4. Webview updates address bar (local handler)
   ↓
5. Extension logs navigation (forwarded message)
```

### Example 3: Toggle Debug Mode

```
1. User clicks "EDIT" button in webview
   ↓
2. Webview calls: sendToIframe(iframeRef, { type: 'roopik-toggle-debug', enabled: true })
   ↓
3. Iframe receives and enables debug mode
```

---

## Adding New Message Types

### Step 1: Add Type Definition

**`webview/src/utils/messageTypes.ts`**:

```typescript
// Add to IframeToWebviewMessage union
export interface IframeNewFeatureMessage {
  type: 'roopik-new-feature';
  data: string;
}

export type IframeToWebviewMessage =
  | IframeLogMessage
  | IframeClickToSourceMessage
  // ... existing types
  | IframeNewFeatureMessage; // Add here
```

### Step 2: Add Transformation (if forwarding)

**`webview/src/utils/messageBridge.ts`**:

```typescript
function transformIframeToExtension(
  iframeMessage: IframeToWebviewMessage
): WebviewToExtensionMessage | null {
  switch (iframeMessage.type) {
    // ... existing cases

    case 'roopik-new-feature':
      return {
        type: 'new-feature', // Extension message type
        data: iframeMessage.data
      };
  }
}
```

### Step 3: Add Extension Type

**`src/types/previewMessages.ts`**:

```typescript
export interface ExtensionNewFeatureMessage {
  type: 'new-feature';
  data: string;
}

export type ExtensionMessage =
  | ExtensionIframeLogMessage
  // ... existing types
  | ExtensionNewFeatureMessage; // Add here
```

### Step 4: Handle in Extension

**`src/projectPreviewPanel.ts`**:

```typescript
switch (message.type) {
  case 'new-feature':
    // Handle new feature
    break;
}
```

---

## Benefits

### ✅ Type Safety
- All messages are typed
- TypeScript catches errors at compile time
- Autocomplete for message properties

### ✅ Less Boilerplate
- No manual `postMessage` chains
- Automatic message transformation
- Built-in error handling

### ✅ Maintainability
- Single source of truth for message types
- Easy to add new message types
- Clear separation of concerns

### ✅ Debugging
- Centralized message logging
- Easy to trace message flow
- Type errors caught early

---

## Migration Guide

### Before (Manual)

```typescript
// Manual postMessage
window.addEventListener('message', (event) => {
  if (event.data.type === 'roopik-click-to-source') {
    vscode.postMessage({
      type: 'click-to-source',
      file: event.data.file,
      line: event.data.line,
      // ... manually map all fields
    });
  }
});

// Manual iframe communication
iframe.contentWindow?.postMessage({
  type: 'roopik-toggle-debug',
  enabled: true
}, '*');
```

### After (Message Bridge)

```typescript
// Automatic forwarding
setupMessageBridge(vscode, (message) => {
  // Only handle local messages
  if (message.type === 'roopik-navigate') {
    setAddressBarValue(message.url);
  }
});

// Type-safe helpers
sendToIframe(iframeRef.current, {
  type: 'roopik-toggle-debug',
  enabled: true
});
```

---

## Best Practices

1. **Always use the bridge** - Don't bypass it with manual `postMessage`
2. **Type your messages** - Add new types to `messageTypes.ts`
3. **Handle locally when needed** - Use the callback for webview-side state updates
4. **Keep transformations simple** - Bridge should just forward/transform, not add logic
5. **Document new messages** - Update this README when adding new message types

---

## Troubleshooting

### Messages not forwarding?

- Check that `setupMessageBridge` is called in `useEffect`
- Verify message type starts with `roopik-` (for iframe messages)
- Check browser console for errors

### Type errors?

- Ensure message types are added to the union types
- Check that transformation function handles the new type
- Verify extension types match webview types

### Messages not received?

- Check iframe is loaded (`iframeRef.current?.contentWindow`)
- Verify message structure matches type definition
- Check CSP allows `postMessage` communication

---

## Future Enhancements

- [ ] Request/response pattern (promise-based)
- [ ] Message validation at runtime
- [ ] Message logging/debugging tool
- [ ] Message versioning
- [ ] Automatic retry on failure

