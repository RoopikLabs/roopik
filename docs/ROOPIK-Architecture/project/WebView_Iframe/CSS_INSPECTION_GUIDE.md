# CSS Inspection & Source Tracking Guide

## 📋 Overview

This document explains how Roopik's inspect mode captures, categorizes, and tracks CSS styles from multiple sources in web applications. It covers the browser APIs used, different scenarios handled, and implementation patterns.

---

## 🎯 Goals & Use Cases

### Primary Goals
1. **Show computed styles** - Display final applied CSS for any element
2. **Track style sources** - Identify which CSS file each style comes from
3. **Differentiate style types** - Separate direct, inherited, and default styles
4. **Handle pseudo-elements** - Capture `::before` and `::after` styles
5. **Multi-file support** - Work with complex projects having multiple CSS files

### Use Cases
- Debug why a style is (or isn't) applied
- Understand CSS inheritance and cascade
- Find which CSS file needs modification
- Learn CSS specificity and override patterns
- Inspect component-scoped styles in React/Vue/etc.

---

## 🔧 Core Browser APIs

### 1. `getComputedStyle()` - Final Applied Styles

Returns the **final computed values** for all CSS properties on an element (after cascade, inheritance, and defaults).

```javascript
const element = document.querySelector('.button');
const computed = window.getComputedStyle(element);

console.log(computed.backgroundColor); // "rgb(255, 0, 0)"
console.log(computed.fontSize); // "16px"
```

**Features:**
- ✅ Always available (never blocked by CORS)
- ✅ Includes inherited properties
- ✅ Shows final resolved values (not raw CSS)
- ✅ Supports pseudo-elements via second parameter

**Pseudo-elements:**
```javascript
const beforeStyles = window.getComputedStyle(element, '::before');
const afterStyles = window.getComputedStyle(element, '::after');

// Check if pseudo-element exists
if (beforeStyles.content !== 'none' && beforeStyles.content !== 'normal') {
  console.log('::before exists with content:', beforeStyles.content);
}
```

**Limitations:**
- ❌ Doesn't tell you WHERE the style came from (which CSS file/rule)
- ❌ Can't retrieve `:hover`, `:active`, `:focus` unless element is in that state

---

### 2. `document.styleSheets` - All Loaded CSS

Returns a **live collection** of all stylesheets loaded in the document.

```javascript
const sheets = Array.from(document.styleSheets);

sheets.forEach(sheet => {
  console.log('Source:', sheet.href || 'inline <style>');
  console.log('Rules:', sheet.cssRules.length);
});
```

**What It Contains:**

| Source Type | `sheet.href` | `sheet.cssRules` | Accessible? |
|-------------|--------------|------------------|-------------|
| External CSS (`<link>`) | Full URL | Array of rules | ✅ If same-origin |
| Inline CSS (`<style>`) | `null` | Array of rules | ✅ Always |
| CSS Modules (React) | URL or `null` | Array of rules | ✅ Always |
| Tailwind/Generated | `null` | Array of rules | ✅ Always |
| CDN CSS (Bootstrap, etc.) | CDN URL | ⚠️ Blocked | ❌ CORS error |

**Example Output:**
```javascript
// React App Example
document.styleSheets[0].href → "http://localhost:5173/src/global.css"
document.styleSheets[1].href → "http://localhost:5173/src/BottomActionBar.css"
document.styleSheets[2].href → null (inline <style> from CSS Module)
document.styleSheets[3].href → "https://cdn.jsdelivr.net/npm/bootstrap/..."
```

---

### 3. `element.matches()` - Selector Matching

Tests if an element matches a CSS selector.

```javascript
const button = document.querySelector('.primary-button');

button.matches('.button'); // true
button.matches('.primary-button'); // true
button.matches('#submit'); // false (unless it has id="submit")
```

**Use Case:** Check if a CSS rule applies to an element.

---

## 📚 Finding CSS Sources for an Element

### Basic Implementation

```javascript
function findMatchingCSSRules(element) {
  const matchedRules = [];

  // Loop through all stylesheets
  for (const sheet of document.styleSheets) {
    const source = sheet.href || 'inline <style>';

    try {
      // Loop through rules in this stylesheet
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSStyleRule) {
          // Check if selector matches our element
          if (element.matches(rule.selectorText)) {
            matchedRules.push({
              selector: rule.selectorText,
              cssFile: source,
              styles: rule.style.cssText,
              specificity: calculateSpecificity(rule.selectorText)
            });
          }
        }
      }
    } catch (e) {
      // Cross-origin stylesheet - CORS blocked
      console.warn('Cannot access stylesheet:', source);
    }
  }

  return matchedRules;
}
```

**Example Output:**
```javascript
[
  {
    selector: '.button',
    cssFile: 'http://localhost:5173/src/global.css',
    styles: 'padding: 10px; border-radius: 4px;',
    specificity: '0,1,0'
  },
  {
    selector: '.bottom-action-bar .button',
    cssFile: 'http://localhost:5173/src/BottomActionBar.css',
    styles: 'background: red; color: white;',
    specificity: '0,2,0'
  }
]
```

---

## 🎨 CSS Specificity Calculation

CSS specificity determines which rule wins when multiple rules target the same element.

**Format:** `a,b,c,d`
- `a` = Inline styles (1,0,0,0)
- `b` = IDs (0,1,0,0)
- `c` = Classes, attributes, pseudo-classes (0,0,1,0)
- `d` = Elements, pseudo-elements (0,0,0,1)

```javascript
function calculateSpecificity(selector) {
  let inline = 0; // style="" attribute (not in selector, always 1,0,0,0)
  let ids = (selector.match(/#[^\s+>~.[:]+/g) || []).length;
  let classes = (selector.match(/\.[^\s+>~.[:]+/g) || []).length;
  let attrs = (selector.match(/\[[^\]]+\]/g) || []).length;
  let pseudoClasses = (selector.match(/:[^\s+>~.[:]+/g) || []).length;
  let elements = (selector.match(/^[a-z]+|[\s+>~][a-z]+/gi) || []).length;
  let pseudoElements = (selector.match(/::[^\s+>~.[:]+/g) || []).length;

  return `${inline},${ids},${classes + attrs + pseudoClasses},${elements + pseudoElements}`;
}

// Examples
calculateSpecificity('#header .nav-item'); // "0,1,1,0"
calculateSpecificity('div.container > p'); // "0,0,1,2"
calculateSpecificity('button[type="submit"]:hover'); // "0,0,3,1"
```

---

## 🔄 Inherited vs Direct vs Default Styles

### Style Categories

1. **Direct (Element's Own Styles)**
   - Inline styles: `<div style="color: red">`
   - CSS rules that directly match this element

2. **Inherited (From Parents)**
   - Properties that cascade from ancestors
   - Examples: `color`, `font-family`, `line-height`, `text-align`

3. **Browser Default (User-Agent Stylesheet)**
   - Built-in browser styles
   - Example: `<h1>` has default `font-size: 2em`

### Detection Logic

```javascript
function categorizeStyles(element) {
  const computed = window.getComputedStyle(element);
  const inherited = [];
  const direct = [];
  const defaults = [];

  // Properties that CAN be inherited
  const inheritableProps = new Set([
    'color', 'font-family', 'font-size', 'font-weight', 'font-style',
    'line-height', 'text-align', 'text-indent', 'text-transform',
    'letter-spacing', 'word-spacing', 'white-space', 'direction',
    'cursor', 'visibility', 'list-style', 'quotes'
  ]);

  // Get matched CSS rules for this element
  const matchedRules = findMatchingCSSRules(element);
  const directProperties = new Set();

  // Mark properties that are directly styled by CSS rules
  matchedRules.forEach(rule => {
    const styles = rule.styles.split(';').filter(Boolean);
    styles.forEach(style => {
      const [prop] = style.split(':').map(s => s.trim());
      if (prop) {
        // Convert kebab-case to camelCase
        const camelProp = prop.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        directProperties.add(camelProp);
      }
    });
  });

  // Check inline styles
  if (element.style.length > 0) {
    for (let i = 0; i < element.style.length; i++) {
      directProperties.add(element.style[i]);
    }
  }

  // Get parent's computed styles for comparison
  const parent = element.parentElement;
  const parentComputed = parent ? window.getComputedStyle(parent) : null;

  // Important CSS properties to check
  const importantProps = [
    'display', 'position', 'width', 'height', 'margin', 'padding',
    'backgroundColor', 'color', 'fontSize', 'fontWeight', 'fontFamily',
    'border', 'borderRadius', 'boxShadow', 'opacity', 'zIndex'
  ];

  importantProps.forEach(prop => {
    const value = computed[prop];

    if (directProperties.has(prop)) {
      // Directly styled on this element
      const sources = findAllSourcesForProperty(element, prop);
      direct.push({
        property: prop,
        value: value,
        sources: sources
      });
    } else if (inheritableProps.has(prop) && parentComputed) {
      // Check if inherited from parent
      if (parentComputed[prop] === value) {
        inherited.push({
          property: prop,
          value: value,
          inheritedFrom: 'parent'
        });
      } else {
        // Default value (not inherited)
        defaults.push({
          property: prop,
          value: value,
          source: 'browser default'
        });
      }
    } else {
      // Not inheritable, likely a default
      defaults.push({
        property: prop,
        value: value,
        source: 'browser default'
      });
    }
  });

  return { direct, inherited, defaults };
}
```

**Example Output:**
```javascript
{
  direct: [
    {
      property: 'backgroundColor',
      value: 'rgb(255, 0, 0)',
      sources: [
        { cssFile: 'BottomActionBar.css', selector: '.button' }
      ]
    }
  ],
  inherited: [
    { property: 'color', value: 'white', inheritedFrom: 'parent' },
    { property: 'fontFamily', value: 'Arial', inheritedFrom: 'parent' }
  ],
  defaults: [
    { property: 'display', value: 'block', source: 'browser default' }
  ]
}
```

---

## 📦 Multiple CSS Sources for Same Property

When multiple CSS rules set the same property, the **cascade** determines which wins.

### Finding All Sources

```javascript
function findAllSourcesForProperty(element, propertyName) {
  const sources = [];

  // Convert camelCase to kebab-case for CSS
  const cssProp = propertyName.replace(/([A-Z])/g, '-$1').toLowerCase();

  for (const sheet of document.styleSheets) {
    const cssFile = sheet.href || 'inline <style>';

    try {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSStyleRule && element.matches(rule.selectorText)) {
          const value = rule.style.getPropertyValue(cssProp);
          if (value) {
            sources.push({
              cssFile: cssFile,
              selector: rule.selectorText,
              value: value,
              specificity: calculateSpecificity(rule.selectorText),
              important: rule.style.getPropertyPriority(cssProp) === 'important'
            });
          }
        }
      }
    } catch (e) {
      // CORS blocked
    }
  }

  // Sort by specificity and !important
  sources.sort((a, b) => {
    if (a.important && !b.important) return -1;
    if (!a.important && b.important) return 1;
    return b.specificity.localeCompare(a.specificity);
  });

  return sources;
}
```

**Example:**
```javascript
// Element: <button class="primary-button submit-btn">

findAllSourcesForProperty(button, 'backgroundColor')

// Returns (sorted by specificity):
[
  {
    cssFile: 'BottomActionBar.css',
    selector: '.submit-btn',
    value: 'green',
    specificity: '0,1,0',
    important: true  // ← WINS due to !important
  },
  {
    cssFile: 'global.css',
    selector: '.primary-button',
    value: 'blue',
    specificity: '0,1,0',
    important: false
  },
  {
    cssFile: 'global.css',
    selector: 'button',
    value: 'gray',
    specificity: '0,0,1',
    important: false
  }
]
```

---

## 🌐 Framework & Environment Support

### React / Vue / Angular / Svelte

✅ **Fully Supported**

- CSS Modules → Appear as inline `<style>` tags or separate files
- Scoped styles → Accessible via `document.styleSheets`
- Component styles → Injected as `<style>` tags
- Global styles → Loaded as `<link>` or `<style>`

**Example (React with CSS Modules):**
```javascript
document.styleSheets[0].href → "http://localhost:5173/src/App.css"
document.styleSheets[1].href → null // Button.module.css (inline)
document.styleSheets[2].href → null // Generated Tailwind (inline)
```

### Dev Mode vs Production

| Environment | Stylesheet Format | Accessible? |
|-------------|------------------|-------------|
| **Dev (Vite/Webpack)** | `<style>` tags or same-origin `<link>` | ✅ YES |
| **Production (Built)** | Bundled CSS files or inline | ✅ YES |
| **CDN Styles** | Cross-origin `<link>` | ⚠️ CORS blocked |

### Plain HTML / Static Sites

✅ **Fully Supported**

```html
<link rel="stylesheet" href="/css/global.css">
<link rel="stylesheet" href="/css/components.css">
<style>
  .custom { color: red; }
</style>
```

All three sources are accessible via `document.styleSheets`.

---

## ⚠️ CORS Limitations & Workarounds

### The Problem

Cross-origin CSS files (e.g., Bootstrap from CDN) are **blocked** by browser security:

```javascript
const cdnSheet = document.styleSheets[3]; // Bootstrap CDN
console.log(cdnSheet.href); // "https://cdn.jsdelivr.net/npm/bootstrap/..."
console.log(cdnSheet.cssRules); // ❌ SecurityError: Blocked by CORS
```

### Why We Can't Fix It

- CORS is controlled by the **server** hosting the CSS
- The server must send `Access-Control-Allow-Origin: *` header
- We (the client) **cannot bypass** this security restriction

### Workarounds

1. **Use `getComputedStyle()` instead**
   - Shows final applied values (always accessible)
   - Doesn't tell you which rule/file, but shows end result

2. **Graceful error handling**
   ```javascript
   try {
     for (const rule of sheet.cssRules) {
       // Process rule
     }
   } catch (e) {
     console.warn('Cannot access stylesheet (CORS):', sheet.href);
     // Continue with other sheets
   }
   ```

3. **Display a note to user**
   - "Some styles from CDN couldn't be analyzed due to CORS policy"
   - Show the CDN URL so they know which styles are blocked

4. **Self-host critical CSS**
   - Download Bootstrap/Tailwind and serve from your domain
   - Makes it same-origin and accessible

---

## 🎯 Pseudo-Elements (::before, ::after)

### Detection

Pseudo-elements only exist if they have content:

```javascript
function extractPseudoElementStyles(element, pseudoElement) {
  try {
    const computed = window.getComputedStyle(element, pseudoElement);
    const content = computed.getPropertyValue('content');

    // Check if pseudo-element exists
    if (!content || content === 'none' || content === 'normal') {
      return null; // Doesn't exist
    }

    // Extract meaningful styles
    const styles = {};
    if (content) styles.content = content;
    if (computed.display !== 'inline') styles.display = computed.display;
    if (computed.position !== 'static') styles.position = computed.position;
    // ... extract other properties

    return Object.keys(styles).length > 0 ? styles : null;
  } catch (e) {
    return null;
  }
}

// Usage
const beforeStyles = extractPseudoElementStyles(element, '::before');
const afterStyles = extractPseudoElementStyles(element, '::after');

if (beforeStyles) {
  console.log('::before exists:', beforeStyles);
}
if (afterStyles) {
  console.log('::after exists:', afterStyles);
}
```

### Limitations

- ✅ Can retrieve `::before` and `::after`
- ❌ Cannot retrieve `:hover`, `:active`, `:focus` unless element is in that state
- ❌ No way to get pseudo-class styles dynamically

---

## 📝 Implementation Checklist

### Phase 1: Basic Style Extraction ✅
- [x] Extract computed styles via `getComputedStyle()`
- [x] Handle pseudo-elements (`::before`, `::after`)
- [x] Filter out default/unchanged properties
- [x] Send to parent via postMessage

### Phase 2: CSS Source Tracking (Next)
- [ ] Loop through `document.styleSheets`
- [ ] Find matching CSS rules for element
- [ ] Extract CSS file paths (`sheet.href`)
- [ ] Calculate specificity for each rule
- [ ] Handle CORS errors gracefully

### Phase 3: Style Categorization (Future)
- [ ] Differentiate direct vs inherited styles
- [ ] Compare with parent element styles
- [ ] Identify browser default styles
- [ ] Show cascade order (which rule wins)

### Phase 4: UI Enhancements (Future)
- [ ] Display CSS file source next to each property
- [ ] Show all competing rules for a property
- [ ] Add "Copy CSS" button
- [ ] Highlight overridden styles
- [ ] Add specificity indicators

---

## 🔗 Related Resources

- [MDN: getComputedStyle()](https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle)
- [MDN: document.styleSheets](https://developer.mozilla.org/en-US/docs/Web/API/Document/styleSheets)
- [MDN: CSS Specificity](https://developer.mozilla.org/en-US/docs/Web/CSS/Specificity)
- [MDN: CSS Cascade](https://developer.mozilla.org/en-US/docs/Web/CSS/Cascade)
- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

## 📄 Notes

- This document is a living reference and will be updated as new features are implemented
- Code examples are simplified for clarity - production code includes additional error handling
- Performance considerations: Iterating through all stylesheets on every inspect can be slow for large projects - consider caching or debouncing
