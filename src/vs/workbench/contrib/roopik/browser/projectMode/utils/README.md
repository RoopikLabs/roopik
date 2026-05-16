# Browser Preview Utility Functions

## Overview

This directory contains **shared utility functions** used across browser preview features to ensure consistency and prevent bugs caused by code duplication.

## Why These Utilities Exist

### The Problem

Previously, `stripRoopikMetadata()` and `getElementSelector()` were duplicated in multiple locations:

- Context menu handler (`browserViewService.ts`)
- Inspect mode script (`inspectModeScript.ts`)
- Inline chat feature

**This caused critical bugs:**

- ❌ Regex differences between copies led to HTML corruption
- ❌ Fixes applied to one location didn't propagate to others
- ❌ Different selector algorithms gave inconsistent results

### The Solution

**Single Source of Truth**: All shared logic now lives in `htmlUtils.ts`.

## Files

### `htmlUtils.ts`

Contains standardized functions used across browser preview features:

#### `stripRoopikMetadata(html: string): string`

Removes all `data-roopik-*` attributes from HTML strings.

**Used by:**

- Context menu "Attach Element to Context"
- Inspect mode "Attach" button
- Inspect mode inline chat

**Regex Pattern:**

```javascript
/\s+data-roopik-[a-z-]+\s*=\s*"[^"]*"/gi;
```

**Key Details:**

- `\s+` at start ensures attribute has leading space (prevents matching inside values)
- `\s*=\s*` handles spaces around equals sign
- Generic `[a-z-]+` matches any lowercase attribute name
- Case-insensitive (`i` flag) for robustness

**Example:**

```javascript
// Input:
<a data-roopik-source="file.jsx:1:2:3:4" data-roopik-component="Link" class="btn">Text</a>

// Output:
<a class="btn">Text</a>
```

#### `getElementSelector(el: Element): string | null`

Generates unique CSS selector path from root to element.

**Used by:**

- Context menu "Attach Element to Context"
- Inspect mode element selection
- Inspect mode drag & drop

**Algorithm:**

1. Start at target element, traverse up to root
2. Use ID if available (stops traversal - IDs are unique)
3. Add class names for specificity
4. Add `:nth-of-type(N)` to disambiguate siblings
5. Build path with `>` separator

**Example:**

```javascript
// Element: <a class="btn btn-primary">
// Result: "#root > div.app > main.content > section.hero:nth-of-type(1) > a.btn.btn-primary:nth-of-type(1)"
```

#### Helper Functions

- `getStripMetadataScriptSource()`: Returns JS string for injection
- `getElementSelectorScriptSource()`: Returns JS string for injection

## Usage

### In TypeScript Files

```typescript
import { stripRoopikMetadata, getElementSelector } from "./utils/htmlUtils.js";

const cleanHtml = stripRoopikMetadata(element.outerHTML);
const selector = getElementSelector(element);
```

### In Injected Scripts

Since injected scripts can't import modules, they must **copy** the function definitions:

```typescript
// inspectModeScript.ts
function stripRoopikMetadata(html) {
	// SHARED UTILITY: Synchronized with htmlUtils.ts
	return html
		.replace(/\s+data-roopik-[a-z-]+\s*=\s*"[^"]*"/gi, "")
		.replace(/\s+/g, " ")
		.trim();
}
```

⚠️ **Important**: Any changes to these functions MUST be updated in both:

1. `htmlUtils.ts` (source of truth)
2. Injected scripts (manual sync)

⚠️ **CRITICAL - Template Literal Escaping**:

When copying regex patterns to template literals (like `INSPECT_MODE_SCRIPT`), **backslashes must be DOUBLE-ESCAPED**:

```javascript
// In htmlUtils.ts (normal TypeScript):
/\s+/g  // ✅ Correct - matches whitespace

// In template literal (inspectModeScript.ts):
/\s+/g  // ❌ WRONG - becomes /s+/g, matches letter 's'!
/\\s+/g // ✅ Correct - becomes /\s+/g, matches whitespace
```

This is because template literals interpret `\s` as an escape sequence, stripping the backslash.

### In Main Process (via executeJavaScript)

```typescript
const result = await webContents.executeJavaScript(`
    (function() {
        // Inline the function from htmlUtils
        function stripRoopikMetadata(html) { /* ... */ }

        const el = document.elementFromPoint(x, y);
        return {
            html: stripRoopikMetadata(el.outerHTML),
            selector: getElementSelector(el)
        };
    })();
`);
```

## Maintenance

### When Adding New Utilities

1. Add to `htmlUtils.ts` with full JSDoc
2. Export both TypeScript function and script source helper
3. Update this README
4. Update all injection sites

### When Modifying Utilities

1. Update `htmlUtils.ts` first
2. Search for all copies in injected scripts
3. Update each copy with same logic
4. Test both context menu AND inspect mode
5. Verify no HTML corruption or selector differences

### Testing Checklist

After any changes:

- [ ] Context menu "Attach Element to Context" works
- [ ] Inspect mode "Attach" button works
- [ ] Inspect mode inline chat works
- [ ] HTML is not corrupted (check `class`, `href`, etc.)
- [ ] Selectors are identical from both sources
- [ ] All `data-roopik-*` attributes are removed

## Regex Bug Fix History

### Bug #1: Matching Inside Attribute Values

**Before fix:**

```javascript
/\s*data-roopik-[a-z-]+="[^"]*"\s*/gi;
```

**Problem**: `\s*` (zero or more spaces) at start allowed matching inside attribute values.

**After fix:**

```javascript
/\s+data-roopik-[a-z-]+\s*=\s*"[^"]*"/gi;
```

**Solution**: `\s+` (one or more spaces) ensures attribute must have leading space.

### Bug #2: Template Literal Backslash Escaping (CRITICAL!)

**Before fix (in inspectModeScript.ts template literal):**

```javascript
// Inside template literal:
.replace(/\s+/g, ' ')  // ❌ Becomes /s+/g - matches letter 's'!
```

**Problem**: In template literals, `\s` is interpreted as an escape sequence. The backslash gets stripped, leaving `/s+/g` which matches the letter `s` instead of whitespace!

**Symptoms:**

```html
<!-- Input: -->
<a class="btn" href="/signin" data-discover="true">
	<!-- Output (CORRUPTED - every 's' replaced with space): -->
	<a cla="btn" href="/ ignin" data-di cover="true"></a
></a>
```

**After fix:**

```javascript
// Inside template literal - DOUBLE ESCAPE!
.replace(/\\s+/g, ' ')  // ✅ Becomes /\s+/g - matches whitespace
```

**Solution**: Double-escape backslashes in template literals: `\s` → `\\s`

## Related Files

- `browserViewService.ts` - Context menu handler (uses inline copy)
- `inspectModeScript.ts` - Inject mode script (uses inline copy)
- `editor.ts` - Handler for both flows (could import directly)

---

**Last Updated**: December 2024
**Maintainer**: Roopik Team
