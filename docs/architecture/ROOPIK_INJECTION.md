# Roopik Click-to-Source Injection Script

Due to browser cross-origin security, Roopik cannot directly access your Vite dev server iframe.

Instead, you need to **add a script to your project** that will communicate with Roopik.

## Quick Setup

### For React Projects

Add this to your `index.html` **before** `</body>`:

```html
<!-- Roopik Click-to-Source Integration -->
<script>
  if (window.parent !== window) {
    // Running in iframe (Roopik preview)
    console.log('[Roopik] Click-to-source enabled');

    let debugMode = false;

    // Listen for messages from Roopik
    window.addEventListener('message', (event) => {
      if (event.data.type === 'roopik-toggle-debug') {
        debugMode = event.data.enabled;
        console.log('[Roopik] Debug mode:', debugMode ? 'ON' : 'OFF');
      }
    });

    // Notify parent of URL changes
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        window.parent.postMessage({
          type: 'roopik-navigate',
          url: location.href
        }, '*');
      }
    }, 500);

    // Click-to-source listener
    document.addEventListener('click', (event) => {
      if (!debugMode || !(event.metaKey || event.ctrlKey)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const target = event.target;

      // Find React Fiber
      const fiberKey = Object.keys(target).find(key =>
        key.startsWith('__reactFiber') ||
        key.startsWith('_reactFiber') ||
        key === '_reactInternalFiber'
      );

      if (!fiberKey) {
        console.log('[Roopik] No React fiber found');
        return;
      }

      let fiber = target[fiberKey];

      // Walk up fiber tree
      while (fiber) {
        const source = fiber._debugSource || fiber._source;

        if (source && source.fileName) {
          console.log('[Roopik] Found source:', source);

          // Send to parent webview
          window.parent.postMessage({
            type: 'roopik-click-to-source',
            file: source.fileName,
            line: source.lineNumber,
            column: source.columnNumber,
            componentName: getComponentName(fiber)
          }, '*');

          return;
        }

        fiber = fiber.return;
      }

      console.log('[Roopik] No source info found');
    }, true);

    function getComponentName(fiber) {
      if (fiber.type && typeof fiber.type === 'function') {
        return fiber.type.name || fiber.type.displayName || 'Component';
      }
      if (fiber.type && typeof fiber.type === 'string') {
        return fiber.type;
      }
      return 'Unknown';
    }

    // Initial URL notification
    window.parent.postMessage({
      type: 'roopik-navigate',
      url: location.href
    }, '*');
  }
</script>
```

### For Vue Projects

Same script works! Vue also has source metadata in dev mode.

### For Plain HTML Projects

Simpler version (no React Fiber):

```html
<script>
  if (window.parent !== window) {
    console.log('[Roopik] Preview mode enabled');

    let debugMode = false;

    window.addEventListener('message', (event) => {
      if (event.data.type === 'roopik-toggle-debug') {
        debugMode = event.data.enabled;
      }
    });

    // URL tracking
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        window.parent.postMessage({
          type: 'roopik-navigate',
          url: location.href
        }, '*');
      }
    }, 500);

    // Click handler
    document.addEventListener('click', (event) => {
      if (!debugMode || !(event.metaKey || event.ctrlKey)) {
        return;
      }

      event.preventDefault();

      // For plain HTML, just send element info
      window.parent.postMessage({
        type: 'roopik-click-to-source',
        file: 'index.html', // You'll need to track this
        element: event.target.tagName
      }, '*');
    }, true);

    window.parent.postMessage({
      type: 'roopik-navigate',
      url: location.href
    }, '*');
  }
</script>
```

## How It Works

1. **Script runs inside your app** (not in webview)
2. **Has access to React Fiber** and DOM
3. **Uses `postMessage`** to send data to Roopik webview
4. **Roopik webview** receives messages and opens files

## Testing

1. Add script to your project's `index.html`
2. Restart Vite dev server
3. Open in Roopik preview
4. Toggle Debug Mode
5. Ctrl+Click on components!

---

**Next**: I'll update `projectPreviewPanel.ts` to receive these messages!
