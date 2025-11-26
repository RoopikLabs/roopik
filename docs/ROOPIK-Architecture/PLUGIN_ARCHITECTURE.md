# Plugin Architecture - Framework-Agnostic Preview System

## 🎯 Overview

Roopik IDE's Mode 2 preview system has been refactored to support multiple frameworks through a **modular plugin architecture**. This allows us to:

- ✅ Support React, Vue, Svelte, and plain HTML projects
- ✅ Easily add new framework support without touching core code
- ✅ Maintain security (auth + handshake) across all frameworks
- ✅ Enable/disable click-to-source based on framework capabilities

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   ViteServerManager.ts                       │
│   Detects framework → Sends to serverWorker.js              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                   serverWorker.js (Main)                     │
│   • Framework Detection (auto or manual)                     │
│   • Plugin Selection via pluginFactory                       │
│   • Vite Server Creation                                     │
└────────┬───────────────────────────────────────┬────────────┘
         │                                       │
         ↓                                       ↓
┌────────────────────────┐          ┌──────────────────────────┐
│  Universal Plugins      │          │  Framework-Specific      │
│  (All Frameworks)       │          │  Plugins (Conditional)   │
├────────────────────────┤          ├──────────────────────────┤
│ • authMiddleware       │          │ • reactSourcePlugin      │
│ • roopikInjectPlugin   │          │ • vueSourcePlugin        │
└────────────────────────┘          │ • svelteSourcePlugin     │
                                    │ • plainHtmlSourcePlugin  │
                                    └──────────────────────────┘
```

---

## 📦 File Structure

```
extensions/roopik/src/devServer/
├── frameworkDetector.js         ← Detects framework from package.json
├── serverWorker.js               ← Main worker process (refactored)
└── plugins/
    ├── authMiddleware.js         ← Security (User-Agent detection)
    ├── roopikInjectPlugin.js     ← HTML injection (handshake, click-to-source)
    ├── pluginFactory.js          ← Strategy pattern for plugin selection
    ├── reactSourcePlugin.js      ← React/JSX source mapping (Babel AST)
    ├── vueSourcePlugin.js        ← Vue SFC source mapping (stub)
    ├── plainHtmlSourcePlugin.js  ← Plain HTML (no-op)
    └── [future] svelteSourcePlugin.js
```

---

## 🔌 Plugin Types

### 1. **Universal Plugins** (Always Active)

#### `authMiddleware.js`
- **Purpose**: Block external browsers (Chrome, Edge, etc.)
- **Technology**: User-Agent detection (Electron vs external)
- **Framework Support**: ✅ All frameworks
- **Location**: Vite middleware chain

```javascript
// User-Agent based authentication
if (userAgent.includes('Electron') || userAgent.includes('VSCode')) {
  next(); // Allow VSCode webview
} else {
  res.statusCode = 403; // Block external browsers
}
```

#### `roopikInjectPlugin.js`
- **Purpose**: Inject handshake + click-to-source runtime code
- **Technology**: HTML injection via `transformIndexHtml`
- **Framework Support**: ✅ All frameworks
- **Features**:
  - PostMessage handshake (security layer 2)
  - Click-to-source listener (Ctrl/Cmd + Click)
  - Navigation tracking
  - Debug mode toggle

```javascript
transformIndexHtml(html) {
  return html.replace('</body>', ROOPIK_INJECT_SCRIPT + '</body>');
}
```

---

### 2. **Framework-Specific Plugins** (Conditional)

#### `reactSourcePlugin.js`
- **Purpose**: Add `data-roopik-source` attributes to React JSX elements
- **Technology**: Babel AST transformation
- **Framework Support**: React (Vite), SolidJS (Vite)
- **Status**: ✅ **Fully Implemented**

**How it works**:
1. Intercepts `.jsx` and `.tsx` files
2. Uses Babel to parse JSX into AST
3. Visits `JSXOpeningElement` nodes
4. Adds `data-roopik-source="file.tsx:line:col"` attribute
5. Returns transformed code

**Example**:

```jsx
// Before (input)
<button onClick={handleClick}>Click me</button>

// After (output)
<button data-roopik-source="App.tsx:42:8" onClick={handleClick}>Click me</button>
```

**Fallback**: If Babel fails, uses regex-based injection (less reliable)

---

#### `vueSourcePlugin.js`
- **Purpose**: Add source tracking to Vue Single File Components
- **Technology**: `@vue/compiler-sfc` (future)
- **Framework Support**: Vue 3 (Vite)
- **Status**: ⏳ **Stub** (not yet implemented)

**Future implementation**:
1. Parse `.vue` files using `@vue/compiler-sfc`
2. Transform `<template>` AST to add `data-roopik-source`
3. Recompile template

**Current behavior**: No-op (preview works, click-to-source disabled)

---

#### `plainHtmlSourcePlugin.js`
- **Purpose**: No-op for plain HTML projects
- **Technology**: None (static files have no compilation step)
- **Framework Support**: Plain HTML/CSS/JS (Vite)
- **Status**: ✅ **Implemented** (no-op)

**Rationale**: Plain HTML has no compilation step, so we can't reliably add source attributes.

**Trade-offs**:
- ✅ Preview works perfectly
- ✅ Security (auth + handshake) works
- ❌ Click-to-source not available

---

## 🧠 Framework Detection

### `frameworkDetector.js`

**Purpose**: Automatically detect framework from `package.json`

**Detection Logic**:
```javascript
detectFramework(projectRoot) {
  const deps = { ...dependencies, ...devDependencies };

  if (deps['vite']) {
    if (deps['react'] || deps['@vitejs/plugin-react']) return 'react-vite';
    if (deps['vue'] || deps['@vitejs/plugin-vue']) return 'vue-vite';
    if (deps['svelte']) return 'svelte-vite';
    return 'plain-html-vite'; // Vite with no framework
  }

  if (deps['next']) return 'nextjs';
  if (deps['nuxt']) return 'nuxt';

  return 'unknown';
}
```

**Supported Frameworks**:
| Framework ID | Description | Click-to-Source |
|--------------|-------------|-----------------|
| `react-vite` | React + Vite | ✅ Babel AST |
| `vue-vite` | Vue 3 + Vite | ⏳ Future |
| `svelte-vite` | Svelte + Vite | ⏳ Future |
| `solid-vite` | SolidJS + Vite | ✅ Reuses React plugin |
| `plain-html-vite` | Plain HTML + Vite | ❌ No-op |
| `nextjs` | Next.js | ⏳ Future |
| `nuxt` | Nuxt | ⏳ Future |

---

## 🎨 Plugin Factory (Strategy Pattern)

### `pluginFactory.js`

**Purpose**: Select appropriate source plugin based on framework

```javascript
function getSourcePlugin(framework, extensionNodeModules) {
  switch (framework) {
    case 'react-vite':
      return createReactSourcePlugin(extensionNodeModules);

    case 'vue-vite':
      return createVueSourcePlugin(extensionNodeModules);

    case 'solid-vite':
      return createReactSourcePlugin(extensionNodeModules); // Reuses React!

    case 'plain-html-vite':
      return createPlainHtmlSourcePlugin();

    default:
      return createPlainHtmlSourcePlugin(); // Safe fallback
  }
}
```

**Benefits**:
- ✅ Single source of truth for plugin selection
- ✅ Easy to add new frameworks (just add a case)
- ✅ Clean separation of concerns

---

## 🔧 How It Works (End-to-End)

### **1. User Opens Project Preview**

```typescript
// projectPreviewPanel.ts
ProjectPreviewPanel.createOrShow(extensionUri, projectRoot);
```

### **2. Extension Starts Server**

```typescript
// viteServerManager.ts
const framework = this.detectFramework(); // "react-vite", "vue-vite", etc.
const url = await this.startWorker(framework);
```

### **3. Worker Process Starts**

```javascript
// serverWorker.js
process.on('message', async (message) => {
  const { root, framework } = message.payload;

  // Auto-detect framework (more accurate than hint)
  const detectedFramework = detectFramework(root);
  console.log('Framework:', getFrameworkDisplayName(detectedFramework));

  // Get appropriate source plugin
  const sourcePlugin = getSourcePlugin(detectedFramework, extensionNodeModules);

  // Create Vite server with plugins
  const server = await createServer({
    plugins: [
      authMiddleware,      // Security layer 1
      sourcePlugin,        // Framework-specific source tracking
      roopikInjectPlugin   // Security layer 2 + runtime code
    ]
  });
});
```

### **4. Vite Transforms Code**

**React Example**:
```javascript
// reactSourcePlugin.js transform()
if (file.endsWith('.jsx')) {
  const result = babel.transformSync(code, {
    plugins: [roopikBabelPlugin] // Adds data-roopik-source
  });
  return result;
}
```

### **5. HTML Injected**

```javascript
// roopikInjectPlugin.js transformIndexHtml()
html = html.replace('</body>', ROOPIK_INJECT_SCRIPT + '</body>');
```

### **6. Browser Loads Preview**

1. **Security Layer 1**: authMiddleware checks User-Agent
   - ✅ Electron → Allow
   - ❌ Chrome → Block with 403

2. **Security Layer 2**: roopikInjectPlugin hides page
   - Waits for handshake from webview
   - Shows page only after correct secret received

3. **Click-to-Source**: User Ctrl+Clicks element
   - Runtime script finds `data-roopik-source` attribute
   - Sends `postMessage` to webview
   - Extension opens file at exact line/column

---

## 🚀 Adding a New Framework

### Example: Adding Svelte Support

**Step 1**: Create plugin file

```javascript
// plugins/svelteSourcePlugin.js
const { preprocess } = require('svelte/compiler');

function createSvelteSourcePlugin(extensionNodeModules) {
  return {
    name: 'roopik-svelte-source',
    enforce: 'pre',

    transform(code, id) {
      if (!id.endsWith('.svelte')) return null;

      // Use Svelte preprocessor to add data-roopik-source
      const processed = preprocess(code, {
        markup({ content, filename }) {
          return {
            code: addSourceAttributes(content, filename)
          };
        }
      });

      return processed;
    }
  };
}

module.exports = { createSvelteSourcePlugin };
```

**Step 2**: Add to plugin factory

```javascript
// pluginFactory.js
const { createSvelteSourcePlugin } = require('./svelteSourcePlugin');

function getSourcePlugin(framework, extensionNodeModules) {
  switch (framework) {
    // ... existing cases
    case 'svelte-vite':
      return createSvelteSourcePlugin(extensionNodeModules);
  }
}
```

**Step 3**: Update framework detector (already done!)

**Step 4**: Test with Svelte project ✅

---

## ✅ Benefits of This Architecture

### 1. **Loose Coupling**
- Each plugin is independent
- Framework-specific logic is isolated
- Core server code doesn't know about React/Vue/etc.

### 2. **Open/Closed Principle**
- Open for extension (add new frameworks)
- Closed for modification (don't touch core)

### 3. **Single Responsibility**
- Each plugin does one thing
- Easy to test in isolation

### 4. **Dependency Injection**
- Plugins receive `extensionNodeModules` path
- No global state

### 5. **Fail-Safe Fallback**
- Unknown frameworks → plain HTML plugin
- Babel fails → regex fallback
- Always provides preview (even without click-to-source)

---

## 🧪 Testing Strategy

### Unit Tests (Future)

```javascript
// frameworkDetector.test.js
test('detects React + Vite', () => {
  const framework = detectFramework('/path/to/react-vite-project');
  expect(framework).toBe('react-vite');
});

// pluginFactory.test.js
test('returns React plugin for react-vite', () => {
  const plugin = getSourcePlugin('react-vite', '/path/to/node_modules');
  expect(plugin.name).toBe('roopik-react-source');
});
```

### Integration Tests (Manual)

1. ✅ **React Project**: Click-to-source works, auth works
2. ⏳ **Vue Project**: Preview works, auth works, click-to-source disabled
3. ⏳ **Plain HTML**: Preview works, auth works, no click-to-source

---

## 📝 Next Steps

1. ✅ **Test React project** with refactored architecture
2. ⏳ **Test plain HTML project** (should work without click-to-source)
3. ⏳ **Test Vue project** (should work without click-to-source)
4. ⏳ **Implement Vue source plugin** (use `@vue/compiler-sfc`)
5. ⏳ **Implement Svelte source plugin** (use Svelte preprocessor)
6. ⏳ **Add unit tests** for framework detector and plugin factory

---

## 🎓 Key Takeaways

- **Security is framework-agnostic**: Auth + handshake work everywhere
- **Source tracking is framework-specific**: Each framework needs its own plugin
- **Always provide preview**: Even if click-to-source isn't available
- **Fail gracefully**: Unknown frameworks get plain HTML plugin
- **Easy to extend**: New frameworks = new plugin file + one line in factory

---

**Last Updated**: November 19, 2025
**Status**: ✅ Refactoring Complete, Ready for Testing
