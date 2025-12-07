# Multi-Framework Sandbox Pipeline: Challenges & Solutions

This document captures the challenges faced while building the multi-framework sandbox pipeline and the solutions implemented. This will serve as a reference for adding future framework support.

---

## Architecture Overview

The sandbox pipeline transforms component source code into executable bundles that run in VSCode webviews. It uses ESBuild for bundling and CDN (esm.sh) for runtime dependencies.

```
User Code (.jsx, .vue, .svelte, .html)
         │
         ▼
┌─────────────────────────┐
│   Framework Detection   │  ← Detects framework from file extensions & imports
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Build Mode Selection  │  ← 'virtual' (in-memory) or 'disk' (temp files)
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│   ESBuild Transform     │  ← Bundles code, resolves imports to CDN
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Synthetic Entry       │  ← Framework-specific mount code
└─────────────────────────┘
         │
         ▼
    Bundled JS → Webview
```

---

## Challenge 1: Virtual vs Disk-Based Builds

### Problem
ESBuild plugins for Vue and Svelte require **actual files on disk**. They can't work with in-memory virtual file systems because they:
- Use Node.js `fs` module internally
- Need to resolve relative imports from disk paths
- Generate source maps referencing file paths

### Solution
Implemented two build modes:

| Mode | Frameworks | How It Works |
|------|-----------|--------------|
| `virtual` | React, Solid, Preact, HTML | In-memory virtual FS plugin |
| `disk` | Vue, Svelte | Write to temp directory, build, cleanup |

```typescript
type BuildMode = 'virtual' | 'disk';

const FRAMEWORK_BUILD_CONFIGS: Record<Framework, { mode: BuildMode; getPlugins: () => Plugin[] }> = {
  react:  { mode: 'virtual', getPlugins: () => [] },
  vue:    { mode: 'disk',    getPlugins: () => [vuePlugin()] },
  svelte: { mode: 'disk',    getPlugins: () => [sveltePlugin({ ... })] },
  // ...
};
```

**Disk build flow:**
1. Create temp directory: `fs.mkdtempSync(path.join(os.tmpdir(), 'roopik-sandbox-'))`
2. Write all files to temp directory
3. Run ESBuild with absolute entry point path
4. Clean up temp directory in `finally` block

**Cross-platform:** Uses `path.join()`, `os.tmpdir()` - works on Windows, macOS, Linux.

---

## Challenge 2: CDN Resolver Intercepting Local Files

### Problem
The CDN resolver plugin filter `/^[^.\/]/` (matches paths not starting with `.` or `/`) was incorrectly catching:
1. **Windows absolute paths**: `C:\Users\...\roopik-main-entry.js` - starts with `C`, not `.` or `/`
2. **Synthetic entry file**: `roopik-main-entry.js` - doesn't start with `.` or `/`

This caused: `"The entry point cannot be marked as external"`

### Solution
Added multiple skip checks in CDN resolver:

```typescript
// Helper for cross-platform absolute path detection
const isAbsolutePath = (p: string): boolean => {
  // Windows: C:\, D:\, etc. or \\network\path
  // Unix: /path
  return /^([A-Za-z]:|\\\\|\/)/i.test(p);
};

build.onResolve({ filter: /^[^.\/]/ }, args => {
  const packagePath = args.path;

  // Skip absolute paths (local files)
  if (isAbsolutePath(packagePath)) return null;

  // Skip synthetic entry point
  if (packagePath.startsWith('roopik-')) return null;

  // Skip local files in disk builds
  if (localFiles?.has(packagePath)) return null;

  // ... resolve to CDN
});
```

---

## Challenge 3: Framework Detection

### Problem
Initial detection logic had issues:
1. **Svelte matching HTML**: Old rule `code.includes('<script>') && code.includes('<style>')` matched vanilla HTML too
2. **Default to React**: When no framework detected, defaulting to React caused issues for HTML files

### Solution
Detection priority based on specificity:

```typescript
// 1. Definitive file extensions (highest priority)
if (filename.endsWith('.vue')) return 'vue';
if (filename.endsWith('.svelte')) return 'svelte';

// 2. Definitive imports (framework-specific)
if (code.includes('from \'svelte\'')) return 'svelte';  // NOT just <script> tags
if (code.includes('solid-js')) return 'solid';
if (code.includes('preact')) return 'preact';

// 3. React detection
if (code.includes('from \'react\'')) return 'react';

// 4. Vanilla HTML (no framework imports, starts with <)
if (code.trim().startsWith('<')) return 'html';

// 5. Default to React for JSX-like code
return 'react';
```

**Key insight:** Svelte detection should check for `from 'svelte'` imports, not just `<script>` + `<style>` tags.

---

## Challenge 4: Svelte 5 Compatibility

### Problem 1: CDN Version Mismatch
- Local `esbuild-svelte@0.9.x` uses Svelte 5 compiler
- Svelte 5 generates imports to `svelte/internal/client`, `svelte/internal/flags/legacy`
- CDN was configured for Svelte 4.x which doesn't have these paths

**Error:** `404 Not Found` for `https://esm.sh/svelte@4.2.15/internal/client?dev`

### Solution 1: Use Svelte 5 everywhere
```typescript
// STABLE_VERSIONS
'svelte': '5.45.2',  // Match locally installed version

// getDependenciesForFramework
'svelte': { 'svelte': '5.45.2' }
```

### Problem 2: Legacy API (onMount) Not Working
Svelte 5 defaults to "runes mode" which doesn't support the old lifecycle API.

**Error:** `effect_orphan` - effects called outside component context

### Solution 2: Enable Compatibility Mode
```typescript
const plugin = sveltePlugin({
  compilerOptions: {
    generate: 'client',
    dev: true,
    compatibility: {
      componentApi: 4  // Enable Svelte 4 component API
    }
  }
});
```

### Problem 3: Removed Compiler Option
Initial attempt used `legacy: { componentApi: true }` which was removed in Svelte 5.

**Error:** `Invalid compiler option: The legacy option has been removed`

### Solution 3: Use New Option Name
Changed from `legacy` to `compatibility`:
```typescript
// OLD (Svelte 5 beta)
legacy: { componentApi: true }

// NEW (Svelte 5 stable)
compatibility: { componentApi: 4 }
```

### Synthetic Entry for Svelte
With compatibility mode, use the traditional constructor pattern:
```typescript
if (framework === 'svelte') {
  return `
import UserComponent from '${importPath}';
const Component = UserComponent.default || UserComponent;
new Component({ target: document.getElementById('root') });
`;
}
```

**Result:** Supports both Svelte 4 style (`onMount`, `onDestroy`) and Svelte 5 runes (`$state`, `$effect`).

---

## Challenge 5: Vanilla HTML Support

### Problem
Vanilla HTML/CSS/JS doesn't need ESBuild bundling - it should inject directly into the DOM.

### Solution
Skip ESBuild entirely for HTML framework:

```typescript
if (framework === 'html') {
  const result = this.transformHTML(input.files);
  return { bundledCode: result.code, cdnUrls: [], ... };
}

private transformHTML(files: Record<string, string>): { code: string } {
  let html = '', css = '', js = '';

  for (const [filename, content] of Object.entries(files)) {
    if (filename.endsWith('.html')) html += content;
    if (filename.endsWith('.css')) css += content;
    if (filename.endsWith('.js')) js += content;
  }

  return { code: `
    (function() {
      // Inject CSS
      const style = document.createElement('style');
      style.textContent = ${JSON.stringify(css)};
      document.head.appendChild(style);

      // Inject HTML
      document.getElementById('root').innerHTML = ${JSON.stringify(html)};

      // Execute JS
      ${js}
    })();
  `};
}
```

---

## Framework Support Matrix

| Framework | Build Mode | Plugin | CDN Version | Entry Pattern |
|-----------|-----------|--------|-------------|---------------|
| React | virtual | - | 18.2.0 | `createRoot().render()` |
| Vue | disk | esbuild-plugin-vue3 | 3.4.0 | `createApp().mount()` |
| Svelte | disk | esbuild-svelte | 5.45.2 | `new Component({ target })` |
| Solid | virtual | - | 1.8.7 | `render(() => Component())` |
| Preact | virtual | - | 10.19.3 | `render(Component())` |
| HTML | virtual | - | - | Direct DOM injection |

---

## Adding New Framework Support

To add a new framework (e.g., Next.js, Nuxt, SvelteKit):

1. **Add to Framework type** (`types.ts`):
   ```typescript
   export type Framework = 'react' | 'vue' | ... | 'newframework';
   ```

2. **Add detection logic** (`componentParser.ts`, `sandboxCard.ts`, `editorFullscreen.ts`):
   ```typescript
   if (filename.endsWith('.newext')) return 'newframework';
   if (code.includes('from \'newframework\'')) return 'newframework';
   ```

3. **Add build config** (`esbuildTransformer.ts`):
   ```typescript
   newframework: {
     mode: 'disk',  // or 'virtual'
     getPlugins: () => [newframeworkPlugin({ ... })]
   }
   ```

4. **Add stable version**:
   ```typescript
   'newframework': 'x.y.z',
   ```

5. **Add synthetic entry**:
   ```typescript
   if (framework === 'newframework') {
     return `
       import { mount } from 'newframework';
       import Component from '${importPath}';
       mount(Component, document.getElementById('root'));
     `;
   }
   ```

6. **Add dependencies mapping**:
   ```typescript
   'newframework': { 'newframework': 'x.y.z' }
   ```

7. **Add filename mapping**:
   ```typescript
   'newframework': 'Component.newext'
   ```

---

## Key Files

- `esbuildTransformer.ts` - Main build logic, CDN resolver, synthetic entries
- `componentParser.ts` - Framework detection from files
- `sandboxCard.ts` - UI-level framework detection and dependencies
- `editorFullscreen.ts` - Same as sandboxCard for fullscreen mode
- `types.ts` - Framework type definitions

---

## Debugging Tips

1. **Check console logs**: `[ESBuildTransformer]`, `[CDN]` prefixes show build flow
2. **Network tab**: Verify CDN URLs are resolving (200 OK, not 404)
3. **Metafile**: ESBuild metafile shows all resolved imports
4. **Temp directory**: For disk builds, log `tempDir` to inspect written files

---

*Last updated: December 2025*
