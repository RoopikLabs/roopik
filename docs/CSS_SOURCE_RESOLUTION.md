# CSS Source Resolution in Style Inspect

## Overview

The Style Inspect panel uses Chrome DevTools Protocol (CDP) to resolve CSS source files for inspected elements. This document explains all the challenges we solved to make CSS source resolution work correctly across different scenarios.

## Two Main Scenarios

### Scenario 1: External CSS Files (React, Plain HTML)
CSS is in **separate `.css` files** that are linked via `<link>` tags or imported.

```
src/
├── App.jsx          ← Component
├── App.css          ← Separate CSS file
└── index.css        ← Global styles
```

### Scenario 2: Single File Components - SFC (Vue, Svelte, Solid)
CSS is **embedded within the component file** in a `<style>` block.

```vue
<!-- Footer.vue -->
<template>
  <footer class="footer">...</footer>
</template>

<script>...</script>

<style scoped>        ← CSS starts at line 20
.footer {             ← Line 21
  background: #1f2937;
}
</style>
```

---

## Problem 1: CDP Stylesheet Discovery Timing (External CSS)

### Symptom
CSS rules showed `index.html` as the source file instead of the actual `styles.css`.

### Root Cause
CDP's `CSS.styleSheetAdded` events fire when stylesheets load during page rendering. If the CSS domain is enabled too late (after stylesheets load) or not re-enabled on page reload, these events are missed and the stylesheet cache remains empty.

### How CDP Stylesheet Discovery Works

```
Page Load Timeline:
─────────────────────────────────────────────────────────────────►

did-start-loading     HTML parsed       Stylesheets loaded     did-stop-loading
        │                  │                    │                      │
        ▼                  ▼                    ▼                      ▼
   [Enable CSS]      [<link> tags]     [CSS.styleSheetAdded]    [Too late!]
                      encountered           events fire
```

**Key insight**: `CSS.styleSheetAdded` events fire synchronously when stylesheets are parsed. The CSS domain must be enabled BEFORE stylesheets load to capture these events.

### Solution

1. **Enable CSS domain in `did-start-loading`** (not `did-stop-loading`)
2. **Reset state on each page load** via `resetForPageLoad()`:
   - Clear stylesheet cache
   - Remove from `cssEnabledViews` set (allows re-enabling)
   - Clean up old event listeners

```typescript
// browserViewService.ts - did-start-loading handler
webContents.on('did-start-loading', () => {
    this.enableCSSForStyleInspection(browserViewId);
});

// enableCSSForStyleInspection
private async enableCSSForStyleInspection(browserViewId: number): Promise<void> {
    this.cdpCssService.resetForPageLoad(browserViewId);  // Clear old state
    await this.cdpCssService.ensureCSSEnabled(browserViewId);  // Re-enable & listen
}
```

---

## Problem 2: Vite Injects CSS as Inline Styles (React/Vue/Svelte)

### Symptom
In development mode, CSS files showed as `.jsx` or `.vue` files instead of `.css` files.

### Root Cause
Vite's development server **injects CSS as inline `<style>` tags** instead of serving separate CSS files. CDP reports these stylesheets with:
- `isInline: true` or `isInline: false` (varies)
- `sourceURL: ''` (empty!)
- `sourceMapURL: 'data:application/json;base64,...'` (contains actual source info)

### What CDP Returns for Vite-Injected Styles

```javascript
// CDPStyleSheetHeader for a Vite-injected style
{
  styleSheetId: 'style-sheet-41064-4',
  isInline: true,           // or false!
  sourceURL: '',            // Empty - no direct source URL
  sourceMapURL: 'data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6L3Byb2plY3Qvc3JjL0Fib3V0LmNzcyJdLC4uLn0='
                            // ^^^ Base64-encoded source map with actual file path!
}
```

### Solution

**Decode the base64 source map** to extract the original file path:

```typescript
private extractSourceFromInlineSourceMap(sourceMapURL: string | undefined): string | null {
    if (!sourceMapURL) return null;

    const base64Match = sourceMapURL.match(/^data:application\/json;base64,(.+)$/);
    if (!base64Match) return null;

    try {
        const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
        const sourceMap = JSON.parse(decoded);

        // Source map contains: { sources: ['C:/project/src/About.css'], ... }
        if (sourceMap.sources && sourceMap.sources.length > 0) {
            return sourceMap.sources[0];  // Original file path!
        }
    } catch {}
    return null;
}
```

### Edge Case: isInline=false but Empty sourceURL

We discovered some stylesheets have `isInline: false` but still have empty `sourceURL` with a valid `sourceMapURL`. Our original enhancement condition missed these:

```typescript
// OLD (broken): Only enhanced isInline=true
if (cached.header.isInline && !cached.header.sourceURL) { ... }

// NEW (fixed): Enhance any stylesheet with empty sourceURL and valid sourceMapURL
const needsEnhancement = !cached.header.sourceURL && (
    cached.header.isInline || cached.header.sourceMapURL
);
```

---

## Problem 3: Wrong Line Numbers in SFC Files (Vue/Svelte)

### Symptom
- Chrome DevTools shows: `Footer.vue:21` (correct!)
- Our panel shows: `Footer.vue:2` (wrong!)

### Root Cause
For SFC files, the CSS is embedded within the component. CDP reports line numbers in two different ways:

**Case A: Using `startLine` offset (Vue with some configs)**
- `CDPStyleSheetHeader.startLine` = 20 (where `<style>` tag begins)
- `rule.style.range.startLine` = 0 (relative to stylesheet)
- Actual line = 0 + 20 + 1 (1-indexed) = **21**

**Case B: Using source map mappings (Svelte, Vue with Vite)**
- `CDPStyleSheetHeader.startLine` = 0 (CSS extracted to virtual file)
- `rule.style.range.startLine` = 1 (in extracted CSS)
- **Source map** contains the mapping: line 1 in extracted CSS → line 21 in original `.svelte`

### Why Simple Offset Didn't Work

We initially tried just adding `startLine` offset:

```typescript
// This worked for some Vue configs...
if (sheetHeader.startLine > 0) {
    location.line += sheetHeader.startLine;
}
```

But for Svelte and Vite-processed Vue, `startLine` is `0` because Vite extracts CSS to a virtual stylesheet. The **source map** contains the actual line mappings.

### Solution: Decode VLQ Source Map Mappings

Source maps use **Base64 VLQ encoding** for compact line/column mappings. We implemented a VLQ decoder to resolve positions:

```typescript
resolvePositionFromInlineSourceMap(
    sourceMapURL: string,   // data:application/json;base64,...
    line: number,           // Line in compiled CSS (1-indexed)
    column: number          // Column (0-indexed)
): { file: string; line: number; column: number } | null {
    // 1. Decode base64 to JSON
    const sourceMap = JSON.parse(Buffer.from(base64, 'base64').toString());

    // 2. Decode VLQ mappings
    // mappings: "AAAA;AACA,OACE;EACE,gBAAA"
    //           ^^^^^ semicolons = lines, commas = segments

    // 3. Find mapping for target line/column
    // Returns: { file: 'Footer.svelte', line: 21, column: 2 }
}
```

### VLQ Decoding Explained

Source map `mappings` string format:
- `;` separates **lines** in generated CSS
- `,` separates **segments** within a line
- Each segment is Base64 VLQ encoded: `[genCol, sourceIdx, origLine, origCol, nameIdx?]`
- Values are **relative** to previous segment

Example:
```
mappings: "AAAA;AACA,OACE"
          │     │     │
          │     │     └─ Third line, segment 1
          │     └─ Second line, segment 1
          └─ First line, segment 1
```

---

## Problem 4: Simple Filenames from Source Maps

### Symptom
```
[URLToPathConverter] Failed to parse URL: App.svelte TypeError: Invalid URL
```

### Root Cause
Source maps sometimes contain just filenames (e.g., `App.svelte`) instead of full URLs or paths. Our URL converter tried to parse these as URLs.

### Solution
Handle simple filenames before URL parsing:

```typescript
convert(url: string): string | null {
    // Handle simple filenames from source maps (Vue SFC, Svelte, etc.)
    if (!url.includes('://') && !url.startsWith('/')) {
        // It's a relative filename - resolve against project root
        return path.join(this.projectRoot, 'src', url);
    }

    // ... URL parsing logic
}
```

---

## Summary: External CSS vs SFC CSS

| Aspect | External CSS (.css files) | SFC CSS (Vue/Svelte) |
|--------|---------------------------|----------------------|
| **File location** | Separate `.css` file | Embedded in component |
| **CDP `sourceURL`** | Full URL (e.g., `http://localhost:5173/src/App.css`) | Empty (extracted by Vite) |
| **CDP `sourceMapURL`** | May have `.map` file reference | Base64-encoded inline source map |
| **CDP `startLine`** | 0 (CSS starts at line 0 of file) | 0 or N (varies by framework) |
| **Line resolution** | Direct from `sourceURL` | Decode VLQ source map mappings |
| **Our solution** | Capture `CSS.styleSheetAdded` events early | Decode inline source map for file + line |

---

## Framework Support Status

| Framework | External CSS | SFC/Embedded CSS | Status |
|-----------|--------------|------------------|--------|
| Plain HTML | ✅ Works | N/A | ✅ |
| React | ✅ Works | N/A (CSS Modules) | ✅ |
| Vue.js | ✅ Works | ✅ Works | ✅ |
| Svelte | ✅ Works | ✅ Works | ✅ |
| Solid | ✅ Should work | ✅ Should work | Untested |
| Angular | ✅ Should work | ✅ Should work | Untested |

The solution is **framework-agnostic** because it relies on:
1. CDP's standard `CSS.styleSheetAdded` events
2. Standard source map format (all bundlers use this)
3. VLQ decoding (standard source map encoding)

---

## Files Involved

| File | Purpose |
|------|---------|
| `cdpCssService.ts` | CDP wrapper, stylesheet cache, event listener, source map extraction, VLQ decoding |
| `browserViewService.ts` | Page lifecycle hooks, triggers CSS enabling |
| `styleSourceOrchestrator.ts` | Orchestrates resolution, applies offsets or source map lookups |
| `urlToPathConverter.ts` | Converts browser URLs to local file paths |
| `sourceMapResolver.ts` | Resolves SCSS/LESS source maps (external `.map` files) |

---

## Key Code Paths

### For External CSS Files
```
1. Page loads → did-start-loading
2. resetForPageLoad() clears cache
3. CSS.enable triggers CSS.styleSheetAdded events
4. Events populate styleSheetCache with { sourceURL: 'http://localhost/App.css', ... }
5. On inspect → getStyleSheetHeader() returns cached header
6. urlToPathConverter converts URL to local path
7. rule.style.range gives line number directly
```

### For SFC Files (Vue/Svelte)
```
1. Page loads → did-start-loading
2. CSS.styleSheetAdded fires with { sourceURL: '', sourceMapURL: 'data:...base64...' }
3. On inspect → getStyleSheetHeader() detects empty sourceURL
4. enhanceInlineStyleHeader() extracts file path from source map
5. resolvePositionFromInlineSourceMap() decodes VLQ mappings
6. Returns { file: 'Footer.vue', line: 21 } ← correct line in SFC!
```

---

## Debugging Tips

### If CSS sources aren't resolving:

1. **Check `CSS.styleSheetAdded` events are received**
   - Add logging in the event handler
   - Verify `resetForPageLoad()` is called on navigation

2. **Check stylesheet cache contents**
   - Log `styleSheetCache` after page load
   - Verify `sourceURL` or `sourceMapURL` is present

3. **For SFC files showing wrong lines**:
   - Log `sheetHeader.sourceMapURL` - should be base64 data URL
   - Log the decoded source map's `sources` and `mappings`
   - Verify VLQ decoding produces correct line numbers

4. **For "Invalid URL" errors**:
   - Check if `sourceURL` is a simple filename
   - Ensure `urlToPathConverter` handles non-URL strings

### Useful Debug Logs

```typescript
console.log('[CDPCssService] styleSheetAdded:', {
    styleSheetId: header.styleSheetId,
    isInline: header.isInline,
    sourceURL: header.sourceURL,
    sourceMapURL: header.sourceMapURL?.slice(0, 50) + '...',
    startLine: header.startLine
});

console.log('[StyleSourceOrchestrator] Resolved position:', {
    selector: rule.selectorList.text,
    file: location.file,
    line: location.line,
    resolvedVia: hasInlineSourceMap ? 'VLQ source map' : 'startLine offset'
});
```

---

## Future Considerations: Live CSS Editing

When implementing live CSS editing, we'll need to:

1. **Reverse the mapping** - Given a line in the source file, find the corresponding position in the injected `<style>` tag
2. **Use CDP `CSS.setStyleTexts`** - Modify styles in the browser
3. **Handle source map updates** - Source maps may need regeneration after edits
4. **Consider HMR integration** - Vite's HMR may interfere with direct CSS edits

The VLQ decoder we built can potentially be extended to support reverse lookups (original → generated).

---

*Last updated: December 2024*
