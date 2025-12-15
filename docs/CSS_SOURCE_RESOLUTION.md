# CSS Source Resolution in Style Inspect

## Overview

The Style Inspect panel uses Chrome DevTools Protocol (CDP) to resolve CSS source files for inspected elements. This document explains all the challenges we solved to make CSS source resolution work correctly across different scenarios.

---

## Architecture: Single CDP Call, Centralized Processing

The entire Style Inspect panel is powered by **one CDP call** and **one orchestrator** that processes all data. The UI simply displays pre-computed results.

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                   User clicks element in browser                    │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        CDP (Chrome DevTools Protocol)               │
│                                                                     │
│   CSS.getMatchedStylesForNode({ nodeId })  ← ONE CALL               │
│                                                                     │
│   Returns: {                                                        │
│     inlineStyle: {...},           ← style="" attribute              │
│     matchedCSSRules: [...],       ← All CSS rules for this element  │
│     inherited: [                  ← Parent chain styles             │
│       { matchedCSSRules: [...] }, ← Direct parent's rules           │
│       { matchedCSSRules: [...] }, ← Grandparent's rules             │
│       ...                         ← Up to <html>                    │
│     ]                                                               │
│   }                                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│            styleSourceOrchestrator.getElementStyles()               │
│                 (electron-main/projectMode/cssResolvers/)           │
│                                                                     │
│   ONE METHOD orchestrates all processing:                           │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ 1. processMatchedRules(cdp.matchedCSSRules)                 │   │
│   │    → Resolve source files, parse selectors                  │   │
│   │    → Output: matchedRules[]                                 │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ 2. processInlineStyles(cdp.inlineStyle)                     │   │
│   │    → Extract style="" properties                            │   │
│   │    → Output: inlineStyles[]                                 │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ 3. processInheritedStyles(cdp.inherited,                    │   │
│   │                           matchedRules, inlineStyles)       │   │
│   │    → Process parent chain                                   │   │
│   │    → Mark overridden (strikethrough) vs not-inheritable     │   │
│   │    → Uses: isInheritableProperty() helper                   │   │
│   │    → Output: inheritedStyles[]                              │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ 4. buildResolvedProperties(matchedRules, inlineStyles,      │   │
│   │                            inheritedStyles)                 │   │
│   │    → Build final computed values list                       │   │
│   │    → Skip non-inheritable from inherited (they don't apply) │   │
│   │    → Uses: isInheritableProperty() helper                   │   │
│   │    → Output: properties[]                                   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│   Returns: ElementStyleInfo {                                       │
│     matchedRules,      → Used by "Element Styles" & "Reset Styles"  │
│     inlineStyles,      → Used by "Inline Styles"                    │
│     inheritedStyles,   → Used by "Inherited"                        │
│     properties         → Used by "All Computed"                     │
│   }                                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                styleInspectPanel.ts (UI - Browser Process)          │
│                   (browser/projectMode/components/)                 │
│                                                                     │
│   render(data: ElementStyleInfo) {                                  │
│     // UI just DISPLAYS pre-processed data - NO logic here!        │
│                                                                     │
│     createInlineStylesSection(data.inlineStyles)                    │
│     createRulesSection(elementRules)      ← "Element Styles"        │
│     createInheritedSection(data.inheritedStyles)                    │
│     createRulesSection(resetRules)        ← "Reset Styles" (* only) │
│     createStylesSection(data.properties)  ← "All Computed"          │
│   }                                                                 │
│                                                                     │
│   // Only UI-level filtering: split matchedRules by selector        │
│   elementRules = matchedRules.filter(r => r.selector !== '*')       │
│   resetRules = matchedRules.filter(r => r.selector === '*')         │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Methods Reference

| Method | Location | Purpose |
|--------|----------|---------|
| `getElementStyles()` | styleSourceOrchestrator.ts | **Main orchestrator** - calls CDP, coordinates all processing |
| `processMatchedRules()` | styleSourceOrchestrator.ts | Parse CDP rules, resolve source file paths |
| `processInlineStyles()` | styleSourceOrchestrator.ts | Extract `style=""` attribute properties |
| `processInheritedStyles()` | styleSourceOrchestrator.ts | Process parent chain, mark override/inheritable flags |
| `buildResolvedProperties()` | styleSourceOrchestrator.ts | Build "All Computed" from all processed data |
| `isInheritableProperty()` | styleSourceOrchestrator.ts | **Shared helper** - determines if property inherits |
| `render()` | styleInspectPanel.ts | Display pre-processed data (no CSS logic) |

### What Each UI Section Displays

| UI Section | Data Source | Processing |
|------------|-------------|------------|
| **Inline Styles** | `data.inlineStyles` | Direct display |
| **Element Styles** | `data.matchedRules` | Filter: exclude `*` selectors |
| **Reset Styles** | `data.matchedRules` | Filter: only `*` selectors |
| **Inherited** | `data.inheritedStyles` | Direct display (flags pre-computed) |
| **All Computed** | `data.properties` | Direct display (already filtered) |

### File Structure

```
electron-main/projectMode/cssResolvers/
├── styleSourceOrchestrator.ts   ← ALL processing logic (single source of truth)
├── cdpCssService.ts             ← CDP communication wrapper
├── urlToPathConverter.ts        ← Browser URL → local file path
└── sourceMapResolver.ts         ← SCSS/LESS external source maps

browser/projectMode/components/
└── styleInspectPanel.ts         ← UI rendering only (no CSS interpretation)

common/cssResolvers/
└── types.ts                     ← Shared TypeScript interfaces
```

### Design Principles

1. **Single CDP Call** - One `CSS.getMatchedStylesForNode()` fetches everything
2. **Centralized Processing** - All interpretation in `styleSourceOrchestrator.ts`
3. **Shared Helpers** - `isInheritableProperty()` used consistently everywhere
4. **Dumb UI** - Panel just renders pre-computed data, no CSS logic
5. **One-Way Data Flow** - CDP → Orchestrator → UI (no back-and-forth)

---

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

## Style Inspect Panel: How Each Section Works

The Style Inspect panel displays CSS information in multiple sections. Understanding how each section is computed helps debug issues and ensures consistent behavior.

### Panel Sections Overview

```
┌─────────────────────────────────────┐
│ ELEMENT                             │  ← Element info (tag, classes, id)
├─────────────────────────────────────┤
│ INLINE STYLES (N)                   │  ← style="" attribute on element
├─────────────────────────────────────┤
│ ELEMENT STYLES (N)                  │  ← CSS rules targeting THIS element
├─────────────────────────────────────┤
│ INHERITED (N)                       │  ← Styles from parent elements
│   Inherited from body               │
│   Inherited from section.hero       │
├─────────────────────────────────────┤
│ RESET STYLES (N)                    │  ← Universal selectors (*, *::before)
├─────────────────────────────────────┤
│ ALL COMPUTED (N)                    │  ← Final computed values with sources
└─────────────────────────────────────┘
```

### Data Flow

All sections are populated from `styleSourceOrchestrator.getElementStyles()`:

```typescript
// styleSourceOrchestrator.ts
async getElementStyles(request): Promise<GetElementStylesResult> {
    // 1. Get CDP data
    const matchedStyles = await cdp.CSS.getMatchedStylesForNode({ nodeId });

    // 2. Process element's own rules → matchedRules[]
    const { rules: matchedRules } = await this.processMatchedRules(matchedStyles.matchedCSSRules);

    // 3. Process inline styles → inlineStyles[]
    const inlineStyles = this.processInlineStyles(matchedStyles.inlineStyle);

    // 4. Process inherited styles → inheritedStyles[]
    // IMPORTANT: Pass element's own styles to correctly track overrides!
    const inheritedStyles = await this.processInheritedStyles(
        matchedStyles.inherited,
        matchedRules,      // ← Element's CSS rules
        inlineStyles       // ← Element's inline styles
    );

    // 5. Build "All Computed" list → properties[]
    const properties = this.buildResolvedProperties(matchedRules, inlineStyles, inheritedStyles);

    return { matchedRules, inlineStyles, inheritedStyles, properties };
}
```

### CSS Inheritance: The Key Concept

**Not all CSS properties inherit!** This is fundamental to how the Inherited section works.

#### Inheritable Properties (pass to children)
```css
/* These properties naturally flow down to child elements */
font-family, font-size, font-weight, font-style
color, line-height, letter-spacing, word-spacing
text-align, text-indent, text-transform
visibility, cursor, list-style
```

#### Non-Inheritable Properties (do NOT pass to children)
```css
/* These properties only affect the element they're defined on */
background, background-color, background-image
margin, padding, border
width, height, display, position
overflow, z-index, opacity
```

### Why This Matters for the UI

When displaying **inherited styles**, we show rules from parent elements. But we need to distinguish:

| Property State | Visual Treatment | Meaning |
|----------------|------------------|---------|
| **Active** | Normal text | Property inherits and applies to element |
| **Overridden** | ~~Strikethrough~~ | A closer rule defines the same property |
| **Not Inheritable** | Greyed out | Property doesn't inherit (like `background-color`) |

### Override Logic: Who Wins?

CSS cascade priority (highest to lowest):

```
1. Element's inline styles          style="color: red"
2. Element's CSS rules              .btn { color: blue }
3. Parent's inline styles           (inherited)
4. Parent's CSS rules               body { color: black }
5. Grandparent's rules              html { color: gray }
6. Browser defaults                 (user-agent)
```

**Example: Tracking overrides**

```html
<body style="color: #333; background: white;">
  <section class="hero">  <!-- .hero { color: blue; } -->
    <button class="btn">  <!-- .btn { color: white; } -->
      Click me
    </button>
  </section>
</body>
```

For the `<button>`:

| Property | Final Value | Source | Status |
|----------|-------------|--------|--------|
| `color` | `white` | `.btn` rule | **Active** (wins) |
| `color` | `blue` | `.hero` rule (inherited) | **Overridden** by `.btn` |
| `color` | `#333` | `body` inline (inherited) | **Overridden** by `.hero` |
| `background` | `white` | `body` inline | **Not Inheritable** (greyed) |

### Implementation: `processInheritedStyles()`

This method ensures inherited properties are correctly marked:

```typescript
private async processInheritedStyles(
    inherited: CDPMatchedStylesResponse['inherited'],
    elementMatchedRules?: MatchedCSSRule[],    // Element's own rules
    elementInlineStyles?: InlineStyleProperty[] // Element's inline styles
): Promise<InheritedStyleInfo[]> {

    // Step 1: Collect all properties defined on the element itself
    const overriddenProps = new Set<string>();

    // Inline styles have highest priority
    for (const style of elementInlineStyles) {
        if (this.isInheritableProperty(style.name)) {
            overriddenProps.add(style.name);
        }
    }

    // Then element's CSS rules
    for (const rule of elementMatchedRules) {
        for (const prop of rule.properties) {
            if (this.isInheritableProperty(prop.name) && !prop.isOverridden) {
                overriddenProps.add(prop.name);
            }
        }
    }

    // Step 2: Process each parent element's styles
    for (const parent of inherited) {
        for (const rule of parent.matchedRules) {
            for (const prop of rule.properties) {
                const isInheritable = this.isInheritableProperty(prop.name);
                const isOverriddenByCloser = overriddenProps.has(prop.name);

                // Track this property for even-farther ancestors
                if (isInheritable && !isOverriddenByCloser) {
                    overriddenProps.add(prop.name);
                }

                return {
                    ...prop,
                    // Struck through: inheritable but overridden by closer rule
                    isOverridden: isInheritable && isOverriddenByCloser,
                    // Greyed out: property doesn't inherit at all
                    isNotInheritable: !isInheritable
                };
            }
        }
    }
}
```

### Implementation: `buildResolvedProperties()` (All Computed)

This builds the final computed values list:

```typescript
private buildResolvedProperties(
    matchedRules: MatchedCSSRule[],
    inlineStyles: InlineStyleProperty[],
    inheritedStyles: InheritedStyleInfo[]
): ResolvedCSSProperty[] {
    const properties: ResolvedCSSProperty[] = [];
    const seenProperties = new Set<string>();

    // 1. Inline styles (highest priority, never overridden)
    for (const style of inlineStyles) {
        properties.push({ ...style, isOverridden: false });
        seenProperties.add(style.name);
    }

    // 2. Element's CSS rules (high to low specificity)
    for (const rule of matchedRules.reverse()) {
        for (const prop of rule.properties) {
            properties.push({
                ...prop,
                isOverridden: seenProperties.has(prop.name)
            });
            seenProperties.add(prop.name);
        }
    }

    // 3. Inherited styles - ONLY INHERITABLE PROPERTIES!
    // Non-inheritable properties (background, margin, etc.) are NOT added
    // because they don't actually apply to this element
    for (const inherited of inheritedStyles) {
        for (const prop of inherited.matchedRules.flatMap(r => r.properties)) {
            if (!this.isInheritableProperty(prop.name)) {
                continue;  // Skip non-inheritable!
            }
            properties.push({
                ...prop,
                sourceType: 'inherited',
                isOverridden: seenProperties.has(prop.name)
            });
            seenProperties.add(prop.name);
        }
    }

    return properties;
}
```

### Key Principle: Single Source of Truth

**IMPORTANT**: The `isInheritableProperty()` check must be used consistently everywhere:

1. **Inherited section**: Show non-inheritable as greyed out
2. **All Computed section**: Completely skip non-inheritable inherited properties
3. **Override tracking**: Only track inheritable properties in the override set

If these checks are inconsistent, you get bugs like:
- "background-color shows active in All Computed but greyed in Inherited"
- "color shows overridden in one place but active in another"

### The `isInheritableProperty()` Helper

```typescript
private isInheritableProperty(name: string): boolean {
    const INHERITABLE_PROPERTIES = new Set([
        // Font properties
        'font', 'font-family', 'font-size', 'font-style', 'font-weight',
        'font-variant', 'font-stretch', 'font-size-adjust',
        // Text properties
        'color', 'line-height', 'letter-spacing', 'word-spacing',
        'text-align', 'text-indent', 'text-transform', 'text-shadow',
        'white-space', 'direction', 'word-break', 'overflow-wrap',
        // List properties
        'list-style', 'list-style-type', 'list-style-position', 'list-style-image',
        // Other
        'visibility', 'cursor', 'quotes', 'orphans', 'widows'
    ]);
    return INHERITABLE_PROPERTIES.has(name);
}
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

---

## Changelog

- **Dec 2024**: Added "Architecture: Single CDP Call, Centralized Processing" section at top with detailed flow diagram showing how data flows from CDP → Orchestrator → UI.
- **Dec 2024**: Added "Style Inspect Panel: How Each Section Works" section explaining inheritance, overrides, and the single-source-of-truth principle for `isInheritableProperty()` checks.
