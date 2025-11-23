# CSS File Discovery Service

**Status**: In Development (Week 11)
**Priority**: High
**Complexity**: Medium

---

## 📋 Overview

The CSS File Discovery Service is a **deterministic, file-based system** that finds CSS/SCSS files related to a selected component. Its primary purpose is to provide AI agents with the **exact CSS files** they need as context when users request style changes.

### Design Philosophy

> **"Find what's findable. Skip what's in the code already."**

This service focuses **ONLY** on discovering external CSS files. It does NOT handle:
- Inline styles (part of component code)
- CSS-in-JS (styled-components, Emotion - part of component code)
- UI framework props (MUI, Chakra - handled by separate AI-Driven Toolbar feature)
- CDN stylesheets (read-only, used as-is, no modification needed)

---

## 🎯 Core Objectives

### Primary Goal
**Find CSS files that style a component and send them to AI Agent as context**

### Why This Matters
- Users request style changes 90% of the time
- AI agents need the RIGHT files to make accurate edits
- Without this, AI has to search through entire codebase (slow, resource-intensive)
- With this, AI gets perfect context in first attempt (fast, accurate)

---

## ✅ What We CAN Find (Deterministic)

| Scenario | Findable? | Strategy | Example |
|----------|-----------|----------|---------|
| **Plain CSS** | ✅ YES | Co-located file | `Button.tsx` → `Button.css` |
| **CSS Modules** | ✅ YES | Co-located module | `Button.tsx` → `Button.module.css` |
| **SCSS/SASS** | ✅ YES | Co-located preprocessor | `Button.tsx` → `Button.scss` |
| **Same-folder styles** | ✅ YES | Directory search | `index.css`, `styles.css` |
| **Global CSS** | ✅ YES | Root-level search | `src/global.css`, `src/App.css` |
| **Tailwind Config** | ✅ YES | Workspace root | `tailwind.config.js` |
| **Parent directory styles** | ✅ YES | Parent traversal | `../global.css` |

---

## ❌ What We DON'T Handle (Not File-Based)

| Scenario | Why Not? | Handled By |
|----------|----------|------------|
| **Inline styles** | `style={{ color: 'red' }}` - Part of component code | AI gets from component file |
| **MUI/Chakra props** | `<Button variant="contained" />` - Props, not files | AI-Driven Toolbar (schema-based) |
| **Styled-components** | CSS embedded in JS - Part of component code | AI gets from component file |
| **Emotion/CSS-in-JS** | Runtime-generated classes - Part of component code | AI gets from component file |
| **CDN CSS** | `https://cdn.../bootstrap.css` - Read-only, used as-is | Framework hints only (no modification) |
| **node_modules CSS** | Compiled libraries - Not meant to be edited | Framework hints only |

### Key Insight: CDN Stylesheets

**You're absolutely correct!** CDN stylesheets (Bootstrap, Tailwind CDN, etc.) are **consumed as-is**, not modified. We:
- ✅ Detect their presence (e.g., "Bootstrap v5.3 loaded")
- ✅ Send framework hints to AI
- ❌ Don't try to read their CSS (CORS blocked anyway)
- ❌ Don't try to modify them (they're external resources)

Example:
```html
<!-- User includes Bootstrap CDN -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">

<!-- We detect: "Bootstrap v5.3 present" -->
<!-- We DON'T try to read/modify it -->
<!-- AI knows to use Bootstrap classes correctly -->
```

---

## 🏗️ Clean Architecture

### Separation of Concerns

```
┌──────────────────────────────────────────────────────────┐
│           CSS File Discovery Service                     │
│  (Deterministic, file-based, no AI logic)               │
│                                                          │
│  Input:  componentFilePath                              │
│  Output: CSS files, framework hints, confidence         │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│           CSS Rule Matcher (iframe)                      │
│  (Runtime CSS rules from document.styleSheets)          │
│                                                          │
│  Input:  element                                        │
│  Output: Matched CSS rules, selectors, specificity     │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│           Style Context Builder                          │
│  (Combines discovery + matching + hints)                │
│                                                          │
│  Input:  componentFile + inspectData                    │
│  Output: Complete StyleContext for AI                   │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│           Public API (for AI Agent)                      │
│  (Clean, tool-callable interface)                       │
│                                                          │
│  Methods:                                               │
│  - getStyleContext(componentPath, selector)             │
│  - findCSSFiles(componentPath)                          │
│  - detectFrameworks()                                   │
└──────────────────────────────────────────────────────────┘
```

---

## 📐 Discovery Strategies (Priority Order)

### Strategy 1: Co-located CSS Module (HIGHEST)
```
Button.tsx → Button.module.css
Button.tsx → Button.module.scss
```

### Strategy 2: Co-located Stylesheet (HIGH)
```
Button.tsx → Button.css
Button.tsx → Button.scss
Button.tsx → Button.sass
```

### Strategy 3: Same-folder Common Styles (MEDIUM)
```
components/Button.tsx → components/index.css
components/Button.tsx → components/styles.css
```

### Strategy 4: Parent Directory Global (MEDIUM)
```
components/Button.tsx → global.css
components/Button.tsx → App.css
```

### Strategy 5: Tailwind Config (FRAMEWORK)
```
tailwind.config.js (workspace root)
```

### Strategy 6: Root Global CSS (LOW)
```
src/index.css
src/globals.css
src/main.css
```

---

## 💻 Implementation

### Core Service Interface

```typescript
export class CSSFileDiscoveryService {
  /**
   * Find CSS files related to a component
   * Pure, deterministic, no AI logic
   */
  async findRelatedCSSFiles(
    componentFilePath: string
  ): Promise<CSSFileDiscoveryResult>;

  /**
   * Detect frameworks (hints only, not files)
   */
  detectFramework(): FrameworkHints;
}

export interface CSSFileDiscoveryResult {
  componentFile: string;
  cssFiles: CSSFile[];
  framework: FrameworkHints;
  confidence: 'high' | 'medium' | 'low';
}

export interface CSSFile {
  path: string;
  relativePath: string;
  type: 'css' | 'scss' | 'sass' | 'less' | 'module' | 'tailwind-config';
  content: string;
  source: string; // Which strategy found this
}

export interface FrameworkHints {
  tailwind?: boolean;
  bootstrap?: boolean;
  mui?: boolean;
  chakra?: boolean;
  antd?: boolean;
}
```

### Runtime CSS Rule Extraction (Iframe)

```javascript
// In roopikInjectPlugin.js
function extractCSSRulesForElement(element) {
  const matchedRules = [];

  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i];
    const source = sheet.href || '<inline>';

    try {
      const rules = sheet.cssRules || sheet.rules;

      for (let j = 0; j < rules.length; j++) {
        const rule = rules[j];

        if (rule.type === CSSRule.STYLE_RULE) {
          if (element.matches(rule.selectorText)) {
            matchedRules.push({
              selector: rule.selectorText,
              cssText: rule.style.cssText,
              source: source,
              specificity: calculateSpecificity(rule.selectorText)
            });
          }
        }
      }
    } catch (e) {
      // CORS blocked or invalid
      matchedRules.push({
        source: source,
        blocked: true,
        message: 'External stylesheet (CORS or CDN)'
      });
    }
  }

  return matchedRules;
}
```

### Style Context Builder

```typescript
export class StyleContextBuilder {
  /**
   * Build complete style context for AI Agent
   * This is the ONLY method AI Agent needs to call
   */
  async buildContext(
    componentFilePath: string,
    inspectData: InspectData
  ): Promise<StyleContext>;
}

export interface StyleContext {
  // Discovered CSS files (high confidence)
  cssFiles: CSSFile[];

  // Runtime matched rules
  matchedRules: MatchedRule[];

  // Framework hints (not files, just metadata)
  frameworks: FrameworkHints;

  // Natural language instructions for AI
  aiHints: string;
}
```

---

## 🎯 Usage by AI Agent Extension

### Example: User requests "Change button color to red"

```typescript
// 1. AI Agent calls public API
const styleAPI = getRoopikStyleAPI();
const context = await styleAPI.getStyleContext(
  '/workspace/src/Button.tsx',
  '.primary-button'
);

// 2. Context returned:
{
  cssFiles: [
    {
      path: '/workspace/src/Button.module.css',
      relativePath: 'Button.module.css',
      type: 'module',
      content: '.button { background: blue; }',
      source: 'co-located-css-module'
    }
  ],
  matchedRules: [
    {
      selector: '.button',
      cssText: 'background: blue; color: white;',
      file: '/workspace/src/Button.module.css',
      confidence: 'high'
    }
  ],
  frameworks: {
    tailwind: false,
    mui: false
  },
  aiHints: `
Found 1 CSS file:
- Button.module.css (module)

Matched CSS Rule:
.button { background: blue; color: white; }

Confidence: High
Edit Button.module.css to change styles.
  `
}

// 3. AI generates edit
const prompt = `
User wants: "Change button color to red"

Current CSS in Button.module.css:
.button {
  background: blue;
  color: white;
}

Task: Change background to red.
`;

const response = await claude.generate(prompt);

// 4. Apply changes
await applyCodeChanges(response.edits);
```

---

## 🔧 Tool-Callable Design

Each service method can be exposed as an AI tool:

```typescript
const tools = [
  {
    name: 'find_css_files',
    description: 'Find CSS files related to a component',
    parameters: {
      componentPath: { type: 'string', required: true }
    },
    function: async (componentPath: string) => {
      const api = getRoopikStyleAPI();
      return api.findCSSFiles(componentPath);
    }
  },
  {
    name: 'get_style_context',
    description: 'Get complete style context (files + rules + hints)',
    parameters: {
      componentPath: { type: 'string', required: true },
      elementSelector: { type: 'string', required: true }
    },
    function: async (componentPath: string, selector: string) => {
      const api = getRoopikStyleAPI();
      return api.getStyleContext(componentPath, selector);
    }
  },
  {
    name: 'detect_frameworks',
    description: 'Detect CSS frameworks used in project',
    function: async () => {
      const api = getRoopikStyleAPI();
      return api.detectFrameworks();
    }
  }
];
```

---

## 📊 Coverage Analysis

### Expected Success Rates

| Project Type | Success Rate | Why |
|--------------|--------------|-----|
| **Plain HTML/CSS** | 95% | Direct CSS files |
| **React + CSS Modules** | 90% | Co-located modules |
| **React + SCSS** | 90% | Co-located SCSS |
| **Tailwind Project** | 85% | Config + utility classes |
| **Vue + Scoped Styles** | 85% | Single-file components |
| **Next.js + Global CSS** | 80% | Global + page-level CSS |
| **MUI/Chakra Project** | 40% | Mostly props (Toolbar handles) |
| **Styled-components** | 30% | CSS-in-JS (code context) |

---

## 🚀 Implementation Phases

### Phase 1: File Discovery (Week 11)
- [ ] Implement `CSSFileDiscoveryService`
- [ ] Port existing `StyleContextGatherer` strategies
- [ ] Add framework detection
- [ ] Write unit tests

### Phase 2: Runtime Matching (Week 11)
- [ ] Enhance `roopikInjectPlugin.js` with rule extraction
- [ ] Send matched rules to extension host
- [ ] Match runtime rules to discovered files

### Phase 3: Context Builder (Week 11-12)
- [ ] Combine discovery + matching
- [ ] Generate AI hints
- [ ] Export clean public API

### Phase 4: UI Integration (Week 12)
- [ ] Show CSS file sources in inspect panel
- [ ] Add "Open in Editor" button
- [ ] Display confidence level
- [ ] Show framework hints

---

## 🎓 Key Architectural Decisions

### 1. **No AI Logic in Discovery Service**
- Service is pure, deterministic
- AI logic belongs in AI Agent Extension
- Discovery can be used by any tool

### 2. **File-Based Only**
- We find files, not parse component code
- Component code is already sent to AI anyway
- Focus on what's NOT already in code context

### 3. **Framework Hints, Not Files**
- We detect frameworks (Tailwind, MUI, Bootstrap)
- We DON'T try to read their compiled CSS
- We tell AI "Project uses X framework"

### 4. **CDN Stylesheets = Read-Only**
- CDN CSS is consumed as-is (Bootstrap, Tailwind CDN)
- No need to read (CORS blocked anyway)
- No need to modify (they're external resources)
- Just detect presence and inform AI

### 5. **Modular, Tool-Callable**
- Each method can be called as AI tool
- Clean interfaces, no tight coupling
- Easy to test, easy to extend

---

## 🔗 Related Features

### Current Feature
**CSS File Discovery Service** - Find CSS files for AI context

### Future Features (Separate)
- **AI-Driven Properties Toolbar** - Schema-based UI for component props (MUI, Chakra, etc.)
- **Visual Style Editor** - Direct CSS editing in inspect panel
- **Design Token Integration** - Sync with Figma/design systems

### Complementary Features
- **Click-to-Source** - Already implemented, opens component file
- **Inspect Mode** - Already implemented, shows computed styles
- **Style Context Gatherer** - Existing code, being enhanced

---

## 📝 Notes

### Why This Architecture?

1. **Clean Separation**: Discovery ≠ AI ≠ UI
2. **Reusable**: Other tools can use discovery service
3. **Testable**: Each layer tested independently
4. **Scalable**: Easy to add new strategies
5. **Maintainable**: Clear boundaries, single responsibilities

### What This Enables

- ✅ AI gets perfect context in first attempt
- ✅ Fast, accurate style changes
- ✅ No need for AI to search entire codebase
- ✅ Works offline (file-based)
- ✅ Framework-agnostic (detects any framework)

---

**Last Updated**: 2025-11-22
**Author**: Roopik Team
**Status**: Architecture finalized, ready for implementation
