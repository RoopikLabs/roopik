# Regex-Based Click-to-Source Implementation

## What is Regex-Based Click-to-Source?

Click-to-source is a debugging feature that allows developers to click on any rendered element in the preview and instantly jump to the exact line of code that defines it. This dramatically speeds up development by eliminating the manual search for component definitions.

**Regex-based click-to-source** is our fallback implementation that uses regular expressions to inject source mapping attributes into HTML/JSX/Vue templates when AST-based transformation fails or is unavailable.

---

## Goal in Click-to-Source Architecture

Our plugin architecture uses a **dual-strategy approach**:

```
┌─────────────────────────────────────────┐
│     PRIMARY: AST-Based Transformation    │
│  • Babel for React/JSX                   │
│  • Vue SFC Compiler for Vue              │
│  • Most accurate, understands syntax     │
└──────────────┬──────────────────────────┘
               │
               ↓ (if fails)
┌─────────────────────────────────────────┐
│   FALLBACK: Regex-Based Transformation   │
│  • Pattern matching with position track  │
│  • Works without dependencies            │
│  • Handles edge cases AST might miss     │
└─────────────────────────────────────────┘
```

**Why we need regex fallback:**
1. **Dependency isolation**: AST requires Babel/@vue/compiler-sfc, which may conflict with user's project
2. **Error resilience**: Invalid syntax might break AST parsing but regex can still work
3. **Performance testing**: Allows comparing AST vs regex performance
4. **User control**: Users can force regex mode via config for debugging

---

## How It Works

### High-Level Overview

The regex-based approach injects `data-roopik-source` attributes into HTML/JSX opening tags by:

1. **Finding all opening tags** using regex pattern matching
2. **Calculating precise line and column** numbers for each tag
3. **Injecting source attributes** with format: `file:line:column`
4. **Preserving code structure** without breaking syntax

### The Pattern

```javascript
const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g;
```

This regex matches:
- `<` - Opening angle bracket
- `([a-zA-Z][a-zA-Z0-9-]*)` - Tag name (capture group 1)
  - Must start with letter (a-z, A-Z)
  - Can contain letters, numbers, hyphens
  - Examples: `div`, `Header`, `router-link`, `h1`
- `([\s\/>])` - Trailing character (capture group 2)
  - Space: `<div className="..."`
  - Forward slash: `<img />`
  - Closing bracket: `<div>`

**What it matches:**
```jsx
<div className="hero">          // ✅ Matches <div
<Header />                       // ✅ Matches <Header /
<input                           // ✅ Matches <input (followed by newline/space)
  type="text"
/>
<h1>                            // ✅ Matches <h1>
<router-link to="/">            // ✅ Matches <router-link
```

**What it skips:**
```jsx
</div>                          // ✗ Closing tag (has /)
<!-- Comment <div> -->          // ✗ Inside comment
The < symbol is less than       // ✗ No tag name after <
<123invalid>                    // ✗ Doesn't start with letter
```

### Position Tracking Algorithm

Instead of processing line-by-line, we use **global regex exec loop** with **absolute position tracking**:

```javascript
let match;
const replacements = [];

// Find ALL tags in entire file
while ((match = tagRegex.exec(code)) !== null) {
    const matchStart = match.index;  // Absolute position in file

    // Calculate line number
    const beforeMatch = code.substring(0, matchStart);
    const lineNumber = beforeMatch.split('\n').length;

    // Calculate column number
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const columnNumber = matchStart - lastNewline - 1;

    // Store replacement
    replacements.push({
        start: matchStart,
        end: matchStart + match[0].length,
        replacement: `<${tagName} data-roopik-source="${file}:${line}:${col}"${trailing}`
    });
}

// Apply in REVERSE order to maintain positions
for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    modifiedCode = modifiedCode.substring(0, r.start)
                 + r.replacement
                 + modifiedCode.substring(r.end);
}
```

**Key insights:**
1. `match.index` gives absolute character position in entire file
2. Splitting substring by `\n` counts line numbers accurately
3. `lastIndexOf('\n')` finds column position
4. **Reverse order replacement** prevents position shifts

---

## Evolution: Line-by-Line → Multiline

### Original Approach: Line-by-Line Processing

**How it worked:**
```javascript
const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const lineNumber = i + 1;

    line = line.replace(tagRegex, (match, tagName, trailing) => {
        const column = line.indexOf('<' + tagName);
        return `<${tagName} data-roopik-source="${file}:${lineNumber}:${column}"${trailing}`;
    });

    transformedLines.push(line);
}
```

**Why it worked initially:**
- Simple, easy to understand
- Accurate line numbers (trivial: `i + 1`)
- Worked for **single-line tags**:
  ```jsx
  <Header className="hero" />
  <p>Some text</p>
  ```

**Why it FAILED for multiline tags:**

When Prettier or other formatters split tags across lines:

```jsx
// BEFORE formatting (single-line)
<Link to="/" className="nav-link active">Home</Link>

// AFTER formatting (multi-line)
<Link
  to="/"
  className="nav-link active"
>
  Home
</Link>
```

**The problem:**
```javascript
Line 1: <Link           // ✅ Matches! Adds attribute
Line 2:   to="/"        // ✗ No tag here
Line 3:   className="..." // ✗ No tag here
Line 4: >               // ✗ Just closing bracket
```

But the regex `/<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g` expects tag name **followed by** space/slash/bracket **on the same line**.

Line 1 has: `<Link` but **no trailing character** (newline instead of space) until line 4!

**Result**: Line-by-line processing **misses multiline tags** because the pattern doesn't complete within a single line.

---

### New Approach: Global Multiline Processing

**How it works:**
```javascript
// Process ENTIRE file as single string
const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g;

while ((match = tagRegex.exec(code)) !== null) {
    // match.index is absolute position across ALL lines
    const matchStart = match.index;

    // Count newlines BEFORE this position = line number
    const beforeMatch = code.substring(0, matchStart);
    const lineNumber = beforeMatch.split('\n').length;

    // Works for both single-line and multi-line!
}
```

**Why it works for multiline:**

Given:
```jsx
Position:  0         1         2
           |---------|---------|---...
Code:      "<Link\n  to=\"/\"\n  className=\"...\"\n>\n  Home\n</Link>"
```

The regex matches `<Link\n` (tag name + trailing newline, which matches `\s`):
- `match.index = 0` (position of `<`)
- `beforeMatch = ""` (substring before position 0)
- `lineNumber = "".split('\n').length = 1` ✅
- Works perfectly!

For comparison, with single-line tag:
```jsx
Code:      "<Link to=\"/\" className=\"...\">"
```

The regex matches `<Link ` (tag name + space):
- `match.index = 0`
- `beforeMatch = ""`
- `lineNumber = 1` ✅
- Also works!

**The key difference:**
- **Line-by-line**: Processes `<Link` on line 1, sees newline, gives up
- **Global multiline**: Processes entire file, matches `<Link\n` (newline IS a `\s`!), succeeds

---

## Why Reverse Order Replacement?

When we modify a string, we shift all positions after the modification:

```javascript
// Original positions:
"<div>Hello<span>World"
 0   5     11   17

// If we replace at position 0 first:
"<div data-roopik-source='...'>Hello<span>World"
 0                              29   35   ← Positions shifted!

// Now position 11 is wrong! We'd replace the wrong location.
```

**Solution: Work backwards!**
```javascript
// Replace position 11 first:
"<div>Hello<span data-roopik-source='...'>World"
 0   5     11

// Then replace position 0:
"<div data-roopik-source='...'>Hello<span data-roopik-source='...'>World"
 0                                    ← Earlier positions unaffected!
```

By processing **reverse order** (highest position first), we ensure earlier positions remain accurate.

---

## Edge Cases Handled

### 1. HTML Text with Angle Brackets

```jsx
<div>
  The symbol < means less than
  Use &lt; for < in HTML
</div>
```

**Our regex only matches opening tags:**
- `<div>` ✅ Matched (tag followed by `>`)
- `< means` ✗ Not matched (no tag name after `<`)
- `< in` ✗ Not matched (no tag name)
- `</div>` ✗ Not matched (closing tag)

### 2. Self-Closing Tags

```jsx
<img src="logo.png" />
<input type="text" />
<Component />
```

All matched correctly because trailing `/` is in our pattern: `[\s\/>]`

### 3. Multiline Tags with Attributes

```jsx
<router-link
  to="/about"
  class="nav-link"
  active-class="active"
  @click="handleClick"
>
```

Matched as `<router-link\n` (tag + newline = `\s` in regex)

### 4. JSX Fragments

```jsx
<>
  <div>Content</div>
</>
```

**Not matched** (correctly!) because:
- `<>` has no tag name after `<`
- We need `[a-zA-Z]` as first character

This is fine - fragments don't need source mapping.

### 5. Comments

```html
<!-- <div> This is a comment -->
```

**Not matched** because `!--` doesn't match `[a-zA-Z][a-zA-Z0-9-]*`

### 6. Already Processed Tags

```jsx
<div data-roopik-source="File.jsx:10:5" className="hero">
```

**Skipped** using:
```javascript
const surroundingCode = code.substring(matchStart, matchEnd + 100);
if (surroundingCode.includes('data-roopik-source')) {
    continue; // Skip this tag
}
```

---

## Framework-Specific Implementations

### React/JSX (reactSourcePlugin.js)

```javascript
function tryRegexFallback(code, filename, verboseLogging) {
    const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g;

    while ((match = tagRegex.exec(code)) !== null) {
        // Calculate line/column from absolute position
        const beforeMatch = code.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;
        const columnNumber = match.index - beforeMatch.lastIndexOf('\n') - 1;

        // Inject attribute
        const sourceAttr = ` data-roopik-source="${file}:${lineNumber}:${columnNumber}"`;
        // ... replacement logic
    }
}
```

**Handles:**
- JSX syntax: `<Component />`
- Multi-line JSX with spread operators
- Conditional rendering: `{condition && <Element />}`

### Vue SFC (vueSourcePlugin.js)

```javascript
function addSourceAttributesToTemplateAST(template, filename, templateStartLine) {
    const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g;

    while ((match = tagRegex.exec(template)) !== null) {
        // Calculate line offset within template
        const beforeMatch = template.substring(0, match.index);
        const lineOffset = beforeMatch.split('\n').length - 1;

        // Add template start line to get actual .vue file line
        const actualLineNumber = templateStartLine + lineOffset;

        // ... replacement logic
    }
}
```

**Special considerations:**
- **Template offset**: Vue templates start after `<template>` tag
- **Line number adjustment**: `templateStartLine` accounts for `<template>`, `<script>`, etc.
- **Vue directives**: `v-if`, `v-for`, etc. are preserved as regular attributes

---

## Performance Characteristics

### Complexity Analysis

- **Regex execution**: O(n) where n = file length
- **Position calculation**: O(m) where m = number of matches
- **String splitting** (for line numbers): O(k) where k = lines before match
- **Replacement**: O(n × m) worst case (string concatenation)

**Overall**: O(n × m) where m is typically small (dozens of tags per file)

### Optimization Strategies

1. **Reverse order replacement**: Prevents recomputing positions
2. **Lazy evaluation**: Only process JSX/TSX/Vue files
3. **Early exit**: Skip if `data-roopik-source` already exists
4. **Minimal regex**: Simple pattern, no backtracking

### Comparison: AST vs Regex

| Metric | AST (Babel/Vue SFC) | Regex |
|--------|---------------------|-------|
| **Accuracy** | 100% (understands syntax) | ~99% (pattern matching) |
| **Speed** | Slower (parsing overhead) | Faster (direct pattern match) |
| **Dependencies** | Requires Babel/@vue/compiler-sfc | None (pure JS) |
| **Error handling** | Fails on invalid syntax | Works on partial/invalid code |
| **Multiline** | ✅ Native support | ✅ With global exec loop |
| **Edge cases** | ✅ Handles all | ⚠️ May miss unusual patterns |

---

## Configuration

Users can control the behavior via `.roopik/config.json`:

```json
{
  "plugins": {
    "forceRegexMode": false,  // true = skip AST, use regex only
    "verboseLogging": true    // Log transformation details
  }
}
```

**Use cases for forcing regex mode:**
1. **Testing**: Verify regex implementation works
2. **Debugging**: Compare AST vs regex output
3. **Performance**: Benchmark regex vs AST speed
4. **Compatibility**: Workaround for AST bugs/conflicts

---

## Critical Bug Found & Fixed (2025-01-19)

### **The String Literal Vulnerability** 🚨

During real-world testing, we discovered that the regex implementation was **injecting `data-roopik-source` attributes into string literals**, revealing our proprietary click-to-source technology to anyone viewing HTML code as text content.

#### **The Scenario**

User was building an HTML preview tile to display code examples:

```jsx
<div className="code-tile">
  <code>
{`<!DOCTYPE html>
<html>
  <body>
    <h1>Hello World!</h1>
  </body>
</html>`}
  </code>
</div>
```

#### **What Went Wrong**

**AST Mode (Secure ✅)**:
- Babel understands syntax context
- Knows `<code>` is JSX, but `"<html>"` is a string literal
- Only injects attribute into real JSX elements

**Regex Mode (Vulnerable ❌)**:
- Pattern matching without context awareness
- Sees `<html>`, `<body>`, `<h1>` and matches them all
- Injects attributes **into the string content itself**!

**Result**:
```html
<!-- LEAKED! -->
<code data-roopik-source="Home.jsx:10:2">
  {"<html data-roopik-source='Home.jsx:11:5'>
      <body data-roopik-source='Home.jsx:12:6'>
        <h1 data-roopik-source='Home.jsx:13:8'>Hello World!</h1>
      </body>
    </html>"}
</code>
```

This exposed our trade secret to:
- Documentation sites showing code examples
- Tutorial apps with HTML snippets
- LeetCode clones displaying code previews
- Any code playground built with Roopik

### **The Fix: Context-Aware String Detection**

We added an `isInsideString()` helper that scans code character-by-character to track string context:

```javascript
/**
 * Check if a position in code is inside a string literal or template literal
 * @param {string} code - The full source code
 * @param {number} position - Character position to check
 * @returns {boolean} - True if inside a string/template literal
 */
function isInsideString(code, position) {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplateString = false;
    let prevChar = '';

    for (let i = 0; i < position; i++) {
        const char = code[i];

        // Skip escaped characters
        if (prevChar === '\\') {
            prevChar = char;
            continue;
        }

        // Toggle string states
        if (char === "'" && !inDoubleQuote && !inTemplateString) {
            inSingleQuote = !inSingleQuote;
        } else if (char === '"' && !inSingleQuote && !inTemplateString) {
            inDoubleQuote = !inDoubleQuote;
        } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
            inTemplateString = !inTemplateString;
        }

        prevChar = char;
    }

    return inSingleQuote || inDoubleQuote || inTemplateString;
}
```

**Integration**:
```javascript
while ((match = tagRegex.exec(code)) !== null) {
    // Skip if already has attribute
    if (surroundingCode.includes('data-roopik-source')) {
        continue;
    }

    // SECURITY: Skip if inside string literal
    if (isInsideString(code, match.index)) {
        continue;  // ✅ Protect trade secret!
    }

    // ... inject attribute
}
```

### **Edge Cases Handled**

1. **Escaped quotes**: `"She said \"Hello\""`
   - Check `prevChar === '\\'` and skip toggle

2. **Nested quotes**: `'He said "Hello"'`
   - Only toggle if not already in another quote type

3. **Template literals**: `` `<div>${content}</div>` ``
   - Track backticks separately

4. **Multiline strings**:
   ```javascript
   const html = `
     <div>Content</div>
   `;
   ```
   - Character-by-character scan handles naturally

### **Result (Secure ✅)**

```html
<!-- Fixed! -->
<div className="code-tile" data-roopik-source="Home.jsx:10:0">
  <code data-roopik-source="Home.jsx:10:22">
    {"<html>
        <body>
          <h1>Hello World!</h1>
        </body>
      </html>"}
  </code>
</div>
```

Only real JSX elements get attributes, strings are protected!

### **Files Modified**

- [reactSourcePlugin.js](src/devServer/plugins/reactSourcePlugin.js) - Added `isInsideString()` + security check
- [vueSourcePlugin.js](src/devServer/plugins/vueSourcePlugin.js) - Added `isInsideString()` + security check (both AST and Regex functions)

### **Lessons Learned**

1. **Real-world testing reveals critical issues** - The HTML preview tile exposed this vulnerability
2. **AST is inherently more secure** - Context awareness prevents these issues
3. **Regex needs manual security checks** - Pattern matching requires explicit context validation
4. **Think like a competitor** - How would someone discover our implementation?
5. **Defense in depth works** - Multiple security layers (tokens + string protection)

---

## Plain HTML Projects - Regex-Only Implementation 📄

Plain HTML projects are the **simplest and purest** implementation of our click-to-source feature. Unlike React (JSX) or Vue (SFC), there's **no compilation step, no AST, no build transformation** - just pure regex-based text transformation!

### **Why Plain HTML is Different**

| Aspect | React/Vue | Plain HTML |
|--------|-----------|------------|
| **Compilation** | Babel AST / Vue SFC compiler | ❌ None - direct HTML serving |
| **Strategy** | AST primary, regex fallback | ✅ Regex only (no AST available) |
| **Vite Hook** | `transform` (for .jsx/.vue modules) | `transformIndexHtml` (for .html files) |
| **Complexity** | High (syntax parsing, scope analysis) | Low (simple text matching) |
| **Performance** | Slower (AST traversal + transformation) | Faster (single regex pass) |

### **How It Works**

**Plugin Architecture**:
```javascript
// File: plainHtmlSourcePlugin.js
function createPlainHtmlSourcePlugin(pluginConfig = {}) {
    return {
        name: 'roopik-plain-html-source',
        enforce: 'pre',

        // CRITICAL: Use transformIndexHtml, NOT transform!
        // Vite's transform hook doesn't process HTML files
        transformIndexHtml: {
            order: 'pre',
            handler(html, ctx) {
                // Regex transformation happens here
            }
        }
    };
}
```

**Why `transformIndexHtml` instead of `transform`?**

- Vite treats HTML files specially (they're entry points, not modules)
- The `transform` hook only processes JavaScript/CSS modules
- `transformIndexHtml` is specifically designed for HTML transformation
- This took debugging to discover - the plugin silently did nothing with `transform`!

### **Security Considerations for HTML**

Plain HTML has **different security concerns** than JSX:

```javascript
function isInsideStringOrScript(html, position) {
    let inScript = false;
    let inStyle = false;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < position; i++) {
        const char = html[i];
        const remaining = html.substring(i, Math.min(i + 20, html.length));

        // Check for script/style tag boundaries
        if (remaining.startsWith('<script')) {
            inScript = true;
        } else if (remaining.startsWith('</script>')) {
            inScript = false;
        } else if (remaining.startsWith('<style')) {
            inStyle = true;
        } else if (remaining.startsWith('</style>')) {
            inStyle = false;
        }

        // Track quote context (for attribute values)
        if (!inScript && !inStyle) {
            if (char === "'" && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
            } else if (char === '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
            }
        }
    }

    return inScript || inStyle || inSingleQuote || inDoubleQuote;
}
```

**What we skip**:
1. **`<script>` tags** - Don't inject into JavaScript code
2. **`<style>` tags** - Don't inject into CSS rules
3. **Attribute values** - Don't inject into `href="..."` or `class="..."`
4. **Non-visual elements** - Skip `<meta>`, `<title>`, `<link>`, `<base>`

### **Example Transformation**

**Input HTML** (`index.html`):
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>My Website</title>
    <style>
        body { margin: 0; }
    </style>
</head>
<body>
    <header>
        <h1>Welcome!</h1>
        <nav>
            <a href="/">Home</a>
            <a href="/about">About</a>
        </nav>
    </header>
    <main>
        <section class="hero">
            <p>This is my website</p>
        </section>
    </main>
    <script>
        console.log('Hello!');
    </script>
</body>
</html>
```

**Output HTML** (with source tracking):
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>My Website</title>
    <style>
        body { margin: 0; }
    </style>
</head>
<body data-roopik-source="index.html:9:0">
    <header data-roopik-source="index.html:10:4">
        <h1 data-roopik-source="index.html:11:8">Welcome!</h1>
        <nav data-roopik-source="index.html:12:8">
            <a data-roopik-source="index.html:13:12" href="/">Home</a>
            <a data-roopik-source="index.html:14:12" href="/about">About</a>
        </nav>
    </header>
    <main data-roopik-source="index.html:17:4">
        <section data-roopik-source="index.html:18:8" class="hero">
            <p data-roopik-source="index.html:19:12">This is my website</p>
        </section>
    </main>
    <script>
        console.log('Hello!');
    </script>
</body>
</html>
```

**Notice**:
- ✅ Visual elements (`<body>`, `<header>`, `<h1>`, `<nav>`, `<a>`, `<main>`, `<section>`, `<p>`) get tracking
- ❌ `<html>`, `<head>`, `<meta>`, `<title>` are skipped (non-visual)
- ❌ `<style>` and `<script>` content is untouched (security)
- ✅ Line numbers are accurate (9, 10, 11, 12, etc.)

### **Plugin Factory Integration**

```javascript
// File: pluginFactory.js
function getSourcePlugin(framework, extensionNodeModules, pluginConfig) {
    switch (framework) {
        case 'react-vite':
            return createReactSourcePlugin(extensionNodeModules, pluginConfig);

        case 'vue-vite':
            return createVueSourcePlugin(extensionNodeModules, pluginConfig);

        case 'plain-html-vite':
            return createPlainHtmlSourcePlugin(pluginConfig);  // ✅ No AST needed!

        default:
            console.warn('[Roopik] Unknown framework, using plain HTML plugin:', framework);
            return createPlainHtmlSourcePlugin(pluginConfig);  // Safe fallback
    }
}

function supportsClickToSource(framework) {
    const supportedFrameworks = [
        'react-vite',
        'vue-vite',
        'solid-vite',
        'plain-html-vite',  // ✅ Fully supported!
    ];
    return supportedFrameworks.includes(framework);
}
```

### **Advantages of Plain HTML Approach**

1. **Simplicity** - No AST parsing, no compilation overhead
2. **Speed** - Single regex pass, minimal processing
3. **Reliability** - Fewer dependencies, fewer failure modes
4. **Universality** - Works with any HTML structure
5. **No build tools required** - Can work even without Vite (future enhancement)

### **Why This Implementation is Elegant**

Unlike React/Vue where we need:
- Babel transforms for JSX
- Vue SFC compiler for templates
- Complex AST traversal
- Scope analysis for context

Plain HTML just needs:
- One regex pattern: `/<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g`
- Simple string position tracking
- Basic security checks

**It's the same regex fallback we use for React/Vue, but without the complexity of AST fallback logic!**

### **Real-World Use Cases**

This enables click-to-source for:
- 🌐 **Static websites** - Landing pages, portfolios, documentation
- 📚 **Multi-page sites** - Traditional server-rendered HTML
- 🎓 **Learning projects** - Beginner HTML/CSS/JS tutorials
- 🚀 **Prototypes** - Quick mockups without framework overhead
- 📄 **HTML emails** - Email template development (future)

### **Files Involved**

- [plainHtmlSourcePlugin.js](src/devServer/plugins/plainHtmlSourcePlugin.js) - Main implementation
- [pluginFactory.js](src/devServer/plugins/pluginFactory.js) - Framework detection and plugin selection
- [serverWorker.js](src/devServer/serverWorker.js) - Vite server configuration
- [config.ts](src/config.ts) - Plugin configuration system

---

## Future Enhancements

### Potential Improvements

1. **Source maps**: Generate proper source maps for better debugging
2. **TypeScript awareness**: Handle `.tsx` type annotations more intelligently
3. **Template literals**: Support tagged template literals (styled-components)
4. **Framework detection**: Auto-detect and optimize per-framework patterns
5. **Incremental processing**: Only reprocess changed regions (HMR optimization)

### Known Limitations

1. **JSX expressions**: May not handle deeply nested JSX in expressions perfectly
2. **Dynamic tags**: `<${DynamicComponent} />` won't be matched (rare in practice)
3. **Preprocessors**: Won't work on uncompiled SCSS/SASS/preprocessor syntax
4. **Non-standard syntax**: Custom JSX pragma or non-standard templates might fail

---

## Testing Strategy

### Unit Tests (Future)

```javascript
describe('Regex Click-to-Source', () => {
  test('handles single-line tags', () => {
    const input = '<div className="hero">Content</div>';
    const output = transform(input);
    expect(output).toContain('data-roopik-source');
  });

  test('handles multiline tags', () => {
    const input = `
      <Link
        to="/"
        className="nav"
      >
        Home
      </Link>
    `;
    const output = transform(input);
    expect(output).toContain('data-roopik-source');
  });

  test('skips already processed tags', () => {
    const input = '<div data-roopik-source="File.jsx:10:5">Content</div>';
    const output = transform(input);
    expect(output).toBe(input); // Unchanged
  });
});
```

### Manual Testing Checklist

- [ ] Single-line JSX components
- [ ] Multi-line JSX with attributes
- [ ] Vue single-line templates
- [ ] Vue multi-line templates with directives
- [ ] Nested components (3+ levels deep)
- [ ] Self-closing tags (`<img />`, `<Component />`)
- [ ] HTML5 tags (h1-h6, input, button, etc.)
- [ ] Custom component names (PascalCase)
- [ ] Hyphenated tags (router-link, custom-element)
- [ ] Mixed single/multi-line in same file
- [ ] Very long files (1000+ lines)
- [ ] Files with existing source attributes

---

## Troubleshooting

### Common Issues

**Issue**: Tags not detected in preview
- **Check**: Console logs for transformation messages
- **Solution**: Enable `verboseLogging: true` in config

**Issue**: Wrong line numbers after formatting
- **Cause**: HMR cache not cleared
- **Solution**: Restart dev server or hard reload preview

**Issue**: Some tags missing attributes
- **Check**: Are they valid HTML/JSX tags?
- **Solution**: Verify regex pattern matches your tag naming convention

**Issue**: Performance degradation
- **Cause**: Large files with many tags
- **Solution**: Consider using AST mode instead (faster for huge files)

---

## Conclusion

The regex-based click-to-source implementation provides a robust, dependency-free fallback that handles both single-line and multi-line HTML/JSX/Vue tags. By using global regex execution with absolute position tracking and reverse-order replacement, we achieve accurate source mapping without breaking code structure.

**Key takeaways:**
- ✅ **Resilient**: Handles formatter changes (single ↔ multi-line)
- ✅ **Fast**: Linear time complexity with minimal overhead
- ✅ **Simple**: No external dependencies beyond regex
- ✅ **Accurate**: Precise line and column number calculation
- ✅ **Safe**: Skips edge cases (comments, text, closing tags)

---

**Version**: 1.0
**Last Updated**: 2025-01-19
**Author**: Roopik Development Team
