# ESM Sandbox Execution in VSCode Webview

## The Challenge

Execute ES Module (ESM) code with CDN imports inside an iframe within a VSCode extension webview.

## Why ESM Only (No CommonJS)

1. **AI generates ESM** - Modern AI models output `import/export` syntax
2. **User-editable code** - Users modify AI-generated code directly
3. **Single source of truth** - No conversion between formats needed
4. **Modern development** - ESM is the standard for frontend development

Converting between ESM and CommonJS adds complexity, potential bugs, and breaks the seamless editing experience.

## The Problem

The bundled code from Core's ESBuild pipeline looks like:
```javascript
import React from "https://esm.sh/react@18.2.0?dev";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client?dev";
// ... component code
```

### Attempt 1: Regular `<script>` tag
```
Error: Cannot use import statement outside a module
```
Regular scripts don't support ESM syntax.

### Attempt 2: `<script type="module">` with blob URL
```javascript
const blob = new Blob([code], { type: 'text/javascript' });
const blobUrl = URL.createObjectURL(blob);
await import(blobUrl);
```
```
Error: Loading script 'blob:...' violates Content Security Policy
```
VSCode webview CSP blocks `blob:` URLs for scripts.

### Attempt 3: UMD scripts from CDN
Tried loading React as UMD from esm.sh:
```html
<script src="https://esm.sh/react@18.2.0/umd/react.development.js"></script>
```
```
Error: Unexpected token 'export'
```
esm.sh returns ESM, not UMD - the `/umd/` path doesn't work as expected.

## The Solution

**Inline the ESM code directly in `<script type="module">`:**

```javascript
function generateSandboxHTML(bundledCode: string): string {
  return `<!DOCTYPE html>
<html>
<body>
  <div id="root"></div>
  <script type="module">
${bundledCode}
  </script>
</body>
</html>`;
}
```

### Why This Works

1. `<script type="module">` enables ESM syntax (import/export)
2. Inline code doesn't require blob URLs - no CSP issues
3. CDN imports (`https://esm.sh/...`) are allowed by CSP
4. The iframe's `srcDoc` renders the HTML with the module script

### CSP Configuration (CanvasPanel.ts)

```
script-src ${cspSource} 'unsafe-inline' 'unsafe-eval' https://esm.sh https://cdn.skypack.dev;
frame-src blob: data: https:;
connect-src https://esm.sh https://cdn.skypack.dev;
```

Key points:
- `'unsafe-inline'` allows inline scripts
- `https://esm.sh` allows CDN imports
- `frame-src` allows the iframe to load

## File Locations

- **SandboxCard.tsx** - `generateSandboxHTML()` function
- **CanvasPanel.ts** - CSP configuration in `getHtml()`
- **Core Pipeline** - Outputs ESM with CDN imports (no changes needed)

## Lessons Learned

1. VSCode webviews have strict CSP - blob URLs won't work for scripts
2. Inline `<script type="module">` bypasses blob URL restrictions
3. esm.sh CDN works perfectly with inline ESM imports
4. Keep the module format consistent end-to-end (AI -> Edit -> Preview -> Export)
