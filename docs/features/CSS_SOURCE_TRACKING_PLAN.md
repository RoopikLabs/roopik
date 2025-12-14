# CSS Source Tracking Implementation Plan

**Status**: Planning
**Priority**: High
**Created**: 2024-12-13

---

## Overview

Implement deterministic CSS source tracking for Mode 2 (Project Preview) using Chrome DevTools Protocol (CDP). This enables:

- **Click to CSS Source** - Open exact file:line where a CSS property is defined
- **Inline Edit** - Modify CSS values directly in the inspect panel
- **AI Context** - Agent knows exactly which file/line to edit
- **Multi-source View** - See all CSS rules affecting an element with cascade order

---

## Core Principles

1. **Deterministic over Heuristic** - Use CDP which gives exact source locations
2. **Modular Architecture** - Each resolver is independent, can be improved/replaced
3. **Graceful Degradation** - If source can't be found, don't show link (no errors)
4. **Use Existing Infrastructure** - Leverage our Vite plugin for source maps
5. **Focus on What's Possible** - Skip impossible cases (CDN, Tailwind JIT)

---

## Why CDP?

Chrome DevTools Protocol provides **deterministic** CSS information:

```javascript
// CDP CSS.getMatchedStylesForNode returns:
{
  inlineStyle: {                    // ← Clearly separated!
    cssProperties: [{ name: "margin", value: "16px" }]
  },
  matchedCSSRules: [{
    rule: {
      selectorList: { text: ".btn-primary" },
      styleSheetId: "123",
      style: {
        range: {
          startLine: 15,            // ← Exact line number!
          startColumn: 0,
          endLine: 18,
          endColumn: 1
        },
        cssProperties: [
          { name: "background", value: "blue", range: { startLine: 16, ... } }
        ]
      }
    }
  }]
}
```

**Benefits:**
- Inline styles clearly separated from CSS rules
- Exact line/column numbers for every property
- All matching rules returned (not just computed values)
- Handles specificity and cascade automatically
- Source maps integration built-in

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CSS Source Tracking System                            │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         Browser (CDP)                               │ │
│  │                                                                      │ │
│  │  User clicks element → DOM.getNodeForLocation → nodeId             │ │
│  │  CSS.getMatchedStylesForNode(nodeId) → all rules + inline         │ │
│  │  CSS.getStyleSheetText(styleSheetId) → file content               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                          │
│                              ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              electron-main/projectMode/cssResolvers/                │ │
│  │                                                                      │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │ │
│  │  │ cdpCssService   │  │ sourceMap       │  │ cssInJs         │    │ │
│  │  │                 │  │ Resolver        │  │ Detector        │    │ │
│  │  │ - getMatched    │  │                 │  │                 │    │ │
│  │  │   Styles()      │  │ - resolve()     │  │ - detect()      │    │ │
│  │  │ - getInline     │  │ - .scss→line    │  │ - emotion       │    │ │
│  │  │   Styles()      │  │ - .less→line    │  │ - styled-comp   │    │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘    │ │
│  │           │                    │                    │              │ │
│  │           └────────────────────┼────────────────────┘              │ │
│  │                                ▼                                    │ │
│  │                 ┌─────────────────────────────┐                    │ │
│  │                 │  styleSourceOrchestrator    │                    │ │
│  │                 │                             │                    │ │
│  │                 │  - combines all resolvers   │                    │ │
│  │                 │  - returns unified result   │                    │ │
│  │                 └─────────────────────────────┘                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                          │
│                              ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    browser/projectMode/                             │ │
│  │                                                                      │ │
│  │  ┌─────────────────────────────────────────────────────────────┐   │ │
│  │  │                   Inspect Panel UI                           │   │ │
│  │  │                                                               │   │ │
│  │  │  Element: <button class="btn-primary">                       │   │ │
│  │  │  [📄 Open Source]  Button.tsx:42                             │   │ │
│  │  │                                                               │   │ │
│  │  │  Styles:                                                      │   │ │
│  │  │  ┌─────────────────────────────────────────────────────────┐ │   │ │
│  │  │  │ background: #3B82F6  [→ button.css:15] [✎ Edit]        │ │   │ │
│  │  │  │ padding: 12px        [→ global.css:8]  [✎ Edit]        │ │   │ │
│  │  │  │ color: white         (inherited)                        │ │   │ │
│  │  │  └─────────────────────────────────────────────────────────┘ │   │ │
│  │  └─────────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/vs/workbench/contrib/roopik/
├── common/
│   └── cssResolvers/
│       └── types.ts                      # Shared interfaces
│
├── electron-main/
│   └── projectMode/
│       └── cssResolvers/
│           ├── index.ts                  # Exports all modules
│           ├── types.ts                  # Internal types
│           ├── cdpCssService.ts          # CDP CSS domain wrapper
│           ├── sourceMapResolver.ts      # SCSS/LESS source map parsing
│           ├── cssInJsDetector.ts        # Emotion/styled-components detection
│           ├── urlToPathConverter.ts     # URL → local file path
│           └── styleSourceOrchestrator.ts # Main orchestrator
│
└── browser/
    └── projectMode/
        ├── components/
        │   └── inspectPanel.ts           # Inspect Panel UI
        └── features/
            └── inspectMode.ts            # Enhanced (existing file)
```

---

## Coverage Matrix

| CSS Type | Source Detection | Line Number | Edit Support | Method |
|----------|-----------------|-------------|--------------|--------|
| **Plain CSS** (`.css`) | ✅ Yes | ✅ Yes | ✅ Yes | CDP direct |
| **CSS Modules** (`.module.css`) | ✅ Yes | ✅ Yes | ✅ Yes | CDP direct |
| **SCSS/SASS** | ✅ Yes | ✅ Yes | ✅ Yes | CDP + Source Maps |
| **LESS** | ✅ Yes | ✅ Yes | ✅ Yes | CDP + Source Maps |
| **PostCSS** | ✅ Yes | ✅ Yes | ✅ Yes | CDP + Source Maps |
| **Inline styles** | ✅ Yes | ✅ Yes | ✅ Yes | CDP `inlineStyle` → component file |
| **CSS-in-JS** (Emotion) | ✅ Detect | → Component | ✅ Yes | Detect + redirect to component |
| **CSS-in-JS** (styled-comp) | ✅ Detect | → Component | ✅ Yes | Detect + redirect to component |
| **Inherited styles** | ✅ Yes | ✅ Yes | ⚠️ Via parent | CDP `inherited` array |
| **Tailwind JIT** | ❌ Skip | ❌ N/A | ❌ N/A | No source file exists |
| **CDN CSS** | ❌ Skip | ❌ N/A | ❌ N/A | External, read-only |
| **node_modules** | ❌ Skip | ❌ N/A | ❌ N/A | Library code |

---

## Phase 1: Types & Interfaces

**File: `common/cssResolvers/types.ts`**

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Source location for a CSS property or rule
 */
export interface CSSSourceLocation {
	/** Absolute file path */
	file: string;
	/** Line number (1-indexed) */
	line: number;
	/** Column number (0-indexed) */
	column: number;
	/** End line (for range selection in editor) */
	endLine?: number;
	/** End column */
	endColumn?: number;
}

/**
 * Source type classification
 */
export type CSSSourceType =
	| 'css-file'      // Regular .css file
	| 'inline'        // style="" attribute
	| 'css-in-js'     // Emotion, styled-components, etc.
	| 'inherited'     // Inherited from parent element
	| 'user-agent';   // Browser default styles

/**
 * CSS-in-JS library identification
 */
export type CSSInJSLibrary = 'emotion' | 'styled-components' | 'linaria' | 'other';

/**
 * A resolved CSS property with full source information
 */
export interface ResolvedCSSProperty {
	/** Property name (e.g., "background-color") */
	name: string;

	/** Computed value (e.g., "rgb(59, 130, 246)") */
	value: string;

	/** How the style was applied */
	sourceType: CSSSourceType;

	/** Source file location (if identifiable) */
	location?: CSSSourceLocation;

	/** CSS selector that matched (e.g., ".btn-primary") */
	selector?: string;

	/** Is this property overridden by a higher-specificity rule? */
	isOverridden: boolean;

	/** Priority (!important) */
	isImportant?: boolean;

	/** CSS-in-JS library (if sourceType is 'css-in-js') */
	cssInJsLibrary?: CSSInJSLibrary;
}

/**
 * A CSS rule that matches the inspected element
 */
export interface MatchedCSSRule {
	/** Selector text (e.g., ".btn-primary", "button[type='submit']") */
	selector: string;

	/** Source file path */
	file: string;

	/** Location of the rule in source */
	location: CSSSourceLocation;

	/** All properties defined in this rule */
	properties: Array<{
		name: string;
		value: string;
		/** Is this specific property overridden? */
		isOverridden: boolean;
		/** Property location within rule */
		location?: CSSSourceLocation;
	}>;

	/** Specificity for cascade ordering (e.g., "0,1,0" for .class) */
	specificity?: string;

	/** Origin of the rule */
	origin: 'regular' | 'user-agent' | 'injected';
}

/**
 * Complete style information for an inspected element
 */
export interface ElementStyleInfo {
	/** Element tag name (lowercase) */
	tagName: string;

	/** Element ID attribute */
	id?: string;

	/** Element class list */
	classes: string[];

	/** HTML source location (from data-roopik-source attribute) */
	htmlSource?: CSSSourceLocation;

	/**
	 * All resolved CSS properties with sources
	 * Grouped by property name, showing final computed value and all sources
	 */
	properties: ResolvedCSSProperty[];

	/**
	 * All CSS rules that match this element
	 * Ordered by specificity (highest first)
	 */
	matchedRules: MatchedCSSRule[];

	/**
	 * Inline styles from style="" attribute
	 */
	inlineStyles: Array<{
		name: string;
		value: string;
		location?: CSSSourceLocation;  // Points to component file
	}>;

	/**
	 * CSS-in-JS detection result
	 */
	cssInJs?: {
		detected: boolean;
		library?: CSSInJSLibrary;
		/** Redirect to this component file for editing */
		componentFile?: string;
	};
}

/**
 * Request to get styles for an element
 */
export interface GetElementStylesRequest {
	/** Browser view ID */
	browserViewId: number;

	/** Element selector OR coordinates */
	target: string | { x: number; y: number };

	/** Project root for path resolution */
	projectRoot: string;
}

/**
 * Result from style source resolution
 */
export interface GetElementStylesResult {
	success: boolean;
	data?: ElementStyleInfo;
	error?: string;
}
```

---

## Phase 2: CDP CSS Service

**File: `electron-main/projectMode/cssResolvers/cdpCssService.ts`**

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { CSSSourceLocation, MatchedCSSRule, ResolvedCSSProperty } from '../../../common/cssResolvers/types.js';

/**
 * CDP CSS Domain Response Types
 */
interface CDPCSSProperty {
	name: string;
	value: string;
	important?: boolean;
	range?: CDPSourceRange;
}

interface CDPSourceRange {
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
}

interface CDPCSSRule {
	selectorList: { text: string };
	styleSheetId: string;
	origin: 'regular' | 'user-agent' | 'injected' | 'inspector';
	style: {
		cssProperties: CDPCSSProperty[];
		range?: CDPSourceRange;
	};
}

interface CDPMatchedStylesResponse {
	inlineStyle?: {
		cssProperties: CDPCSSProperty[];
	};
	matchedCSSRules: Array<{
		rule: CDPCSSRule;
	}>;
	inherited?: Array<{
		inlineStyle?: { cssProperties: CDPCSSProperty[] };
		matchedCSSRules: Array<{ rule: CDPCSSRule }>;
	}>;
}

interface CDPStyleSheetInfo {
	styleSheetId: string;
	sourceURL: string;
	sourceMapURL?: string;
}

/**
 * CDP CSS Service
 *
 * Provides deterministic CSS source resolution using Chrome DevTools Protocol.
 *
 * Key CDP methods:
 * - CSS.enable: Enable CSS domain
 * - CSS.getMatchedStylesForNode: Get all styles for an element
 * - CSS.getInlineStylesForNode: Get inline styles
 * - CSS.getStyleSheetText: Get stylesheet content
 * - DOM.querySelector: Find element by selector
 * - DOM.getNodeForLocation: Get node at coordinates
 */
export class CDPCssService {

	constructor(
		private readonly browserService: IBrowserViewService
	) {}

	/**
	 * Get all matched styles for an element via CDP
	 *
	 * @param browserViewId - Browser view to query
	 * @param nodeId - DOM node ID (from DOM.querySelector or DOM.getNodeForLocation)
	 */
	async getMatchedStyles(
		browserViewId: number,
		nodeId: number
	): Promise<CDPMatchedStylesResponse> {
		const result = await this.browserService.sendCDP(browserViewId, 'CSS.getMatchedStylesForNode', {
			nodeId
		});
		return result;
	}

	/**
	 * Get node ID for an element by selector
	 */
	async getNodeIdBySelector(
		browserViewId: number,
		selector: string
	): Promise<number | null> {
		// First get document root
		const doc = await this.browserService.sendCDP(browserViewId, 'DOM.getDocument', {});

		// Then query for element
		const result = await this.browserService.sendCDP(browserViewId, 'DOM.querySelector', {
			nodeId: doc.root.nodeId,
			selector
		});

		return result.nodeId || null;
	}

	/**
	 * Get node ID for element at coordinates
	 */
	async getNodeIdAtPoint(
		browserViewId: number,
		x: number,
		y: number
	): Promise<number | null> {
		const result = await this.browserService.sendCDP(browserViewId, 'DOM.getNodeForLocation', {
			x,
			y,
			includeUserAgentShadowDOM: false
		});

		return result.nodeId || null;
	}

	/**
	 * Get stylesheet information (URL, source map URL)
	 */
	async getStyleSheetInfo(
		browserViewId: number,
		styleSheetId: string
	): Promise<CDPStyleSheetInfo | null> {
		try {
			const result = await this.browserService.sendCDP(browserViewId, 'CSS.getStyleSheetText', {
				styleSheetId
			});

			// Note: The styleSheetId → URL mapping comes from CSS.styleSheetAdded events
			// We need to track these when CSS domain is enabled
			return {
				styleSheetId,
				sourceURL: result.sourceURL || '',
				sourceMapURL: result.sourceMapURL
			};
		} catch {
			return null;
		}
	}

	/**
	 * Convert CDP source range to our CSSSourceLocation
	 */
	convertRange(range: CDPSourceRange | undefined, file: string): CSSSourceLocation | undefined {
		if (!range) return undefined;

		return {
			file,
			line: range.startLine + 1,  // CDP is 0-indexed, we use 1-indexed
			column: range.startColumn,
			endLine: range.endLine + 1,
			endColumn: range.endColumn
		};
	}
}
```

---

## Phase 3: Source Map Resolver

**File: `electron-main/projectMode/cssResolvers/sourceMapResolver.ts`**

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { CSSSourceLocation } from '../../../common/cssResolvers/types.js';
// Note: We'll use the 'source-map' npm package for parsing

/**
 * Source Map Resolver
 *
 * Resolves compiled CSS locations (from SCSS, LESS, PostCSS) back to
 * original source files using CSS source maps.
 *
 * Source maps are automatically generated when:
 * - Vite's css.devSourcemap is enabled (we enable this in our plugin)
 * - SASS/LESS compilers generate source maps
 *
 * Source map format (ECMA-426):
 * {
 *   "version": 3,
 *   "sources": ["../src/button.scss"],
 *   "mappings": "AAAA,OACE...",
 *   "sourcesContent": ["...original scss..."]
 * }
 */
export class SourceMapResolver {

	// Cache parsed source maps
	private sourceMapCache = new Map<string, SourceMapConsumer>();

	/**
	 * Check if a source map exists for a CSS file
	 *
	 * Checks for:
	 * - Inline source map (data: URL in CSS)
	 * - External source map (.css.map file)
	 * - sourceMappingURL comment in CSS
	 */
	async hasSourceMap(cssFilePath: string): Promise<boolean> {
		// Check for .map file
		const mapPath = cssFilePath + '.map';
		try {
			await fs.access(mapPath);
			return true;
		} catch {
			// Check for inline source map in CSS content
			const cssContent = await fs.readFile(cssFilePath, 'utf-8');
			return cssContent.includes('sourceMappingURL=');
		}
	}

	/**
	 * Resolve a compiled CSS location to original source
	 *
	 * @param cssFilePath - Path to compiled CSS file
	 * @param line - Line in compiled CSS (1-indexed)
	 * @param column - Column in compiled CSS (0-indexed)
	 * @returns Original source location or null if not mappable
	 */
	async resolveToOriginal(
		cssFilePath: string,
		line: number,
		column: number
	): Promise<CSSSourceLocation | null> {
		try {
			const consumer = await this.getSourceMapConsumer(cssFilePath);
			if (!consumer) return null;

			// source-map library uses 1-indexed lines, 0-indexed columns
			const original = consumer.originalPositionFor({
				line,
				column
			});

			if (!original.source) return null;

			// Resolve relative source path
			const sourceFile = path.resolve(path.dirname(cssFilePath), original.source);

			return {
				file: sourceFile,
				line: original.line || 1,
				column: original.column || 0
			};
		} catch (error) {
			console.error('[SourceMapResolver] Failed to resolve:', error);
			return null;
		}
	}

	/**
	 * Get or create SourceMapConsumer for a CSS file
	 */
	private async getSourceMapConsumer(cssFilePath: string): Promise<SourceMapConsumer | null> {
		// Check cache
		if (this.sourceMapCache.has(cssFilePath)) {
			return this.sourceMapCache.get(cssFilePath)!;
		}

		try {
			const mapPath = cssFilePath + '.map';
			const mapContent = await fs.readFile(mapPath, 'utf-8');
			const consumer = await new SourceMapConsumer(JSON.parse(mapContent));

			this.sourceMapCache.set(cssFilePath, consumer);
			return consumer;
		} catch {
			return null;
		}
	}

	/**
	 * Clear cache (call when files change)
	 */
	clearCache(): void {
		for (const consumer of this.sourceMapCache.values()) {
			consumer.destroy();
		}
		this.sourceMapCache.clear();
	}
}
```

---

## Phase 4: CSS-in-JS Detector

**File: `electron-main/projectMode/cssResolvers/cssInJsDetector.ts`**

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { CSSInJSLibrary } from '../../../common/cssResolvers/types.js';

/**
 * CSS-in-JS detection result
 */
export interface CSSInJSDetectionResult {
	detected: boolean;
	library?: CSSInJSLibrary;
	/** The generated class name that was detected */
	generatedClassName?: string;
	/** Component file to redirect to (from data-roopik-source) */
	componentFile?: string;
}

/**
 * CSS-in-JS Detector
 *
 * Detects styles generated by CSS-in-JS libraries.
 * When detected, we redirect to the component file instead of trying
 * to find a CSS file (which doesn't exist).
 *
 * Detection patterns:
 * - Emotion: css-XXXXX classes, [data-emotion] attribute on <style> tags
 * - styled-components: sc-XXXXX classes, [data-styled] attribute
 * - Linaria: Similar patterns
 */
export class CSSInJsDetector {

	// Class name patterns for different libraries
	private readonly patterns: Record<CSSInJSLibrary, RegExp> = {
		'emotion': /\bcss-[a-z0-9]+\b/i,
		'styled-components': /\bsc-[a-zA-Z]+-?[a-zA-Z]*\b/,
		'linaria': /\bl[a-z0-9]+\b/,  // Linaria uses short hashes
		'other': /\b[a-z]{2,3}-[a-zA-Z0-9]{6,}\b/  // Generic pattern
	};

	/**
	 * Detect CSS-in-JS from element class names
	 *
	 * @param className - Element's className string
	 * @param componentFile - Component file from data-roopik-source (for redirect)
	 */
	detectFromClassName(
		className: string,
		componentFile?: string
	): CSSInJSDetectionResult {
		if (!className) {
			return { detected: false };
		}

		// Check each library pattern
		for (const [library, pattern] of Object.entries(this.patterns)) {
			const match = className.match(pattern);
			if (match) {
				return {
					detected: true,
					library: library as CSSInJSLibrary,
					generatedClassName: match[0],
					componentFile
				};
			}
		}

		return { detected: false };
	}

	/**
	 * Detect CSS-in-JS by checking <style> tag attributes
	 * Called via CDP to inspect the page's style elements
	 */
	async detectFromStyleTags(
		browserViewId: number,
		browserService: IBrowserViewService
	): Promise<CSSInJSDetectionResult[]> {
		const results: CSSInJSDetectionResult[] = [];

		// Execute script in browser to check style tags
		const styleTagInfo = await browserService.executeScript(browserViewId, `
			(function() {
				const results = [];
				document.querySelectorAll('style').forEach(style => {
					if (style.hasAttribute('data-emotion')) {
						results.push({ library: 'emotion', id: style.getAttribute('data-emotion') });
					}
					if (style.hasAttribute('data-styled')) {
						results.push({ library: 'styled-components', id: style.getAttribute('data-styled') });
					}
				});
				return results;
			})()
		`);

		for (const info of styleTagInfo) {
			results.push({
				detected: true,
				library: info.library as CSSInJSLibrary
			});
		}

		return results;
	}

	/**
	 * Check if a stylesheet ID belongs to a CSS-in-JS library
	 * (Some libraries create stylesheets with identifiable patterns)
	 */
	isGeneratedStyleSheet(styleSheetUrl: string): boolean {
		// CSS-in-JS typically has no URL or blob: URLs
		if (!styleSheetUrl || styleSheetUrl.startsWith('blob:')) {
			return true;
		}
		return false;
	}
}
```

---

## Phase 5: URL to Path Converter

**File: `electron-main/projectMode/cssResolvers/urlToPathConverter.ts`**

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * URL to Path Converter
 *
 * Converts browser URLs (from Vite dev server) to local file paths.
 *
 * Examples:
 * - http://localhost:5173/src/button.css → C:/project/src/button.css
 * - http://localhost:5173/@fs/C:/project/node_modules/x.css → C:/project/node_modules/x.css
 */
export class URLToPathConverter {

	constructor(
		private readonly projectRoot: string,
		private readonly devServerPort: number = 5173
	) {}

	/**
	 * Convert a browser URL to local file path
	 *
	 * @param url - URL from browser (e.g., http://localhost:5173/src/button.css)
	 * @returns Local file path or null if external/unmappable
	 */
	convert(url: string): string | null {
		if (!url) return null;

		try {
			const parsed = new URL(url);

			// Only handle localhost (dev server)
			if (!parsed.hostname.includes('localhost') && !parsed.hostname.includes('127.0.0.1')) {
				return null;  // External URL, can't map
			}

			let pathname = parsed.pathname;

			// Handle Vite's @fs prefix (absolute file paths)
			if (pathname.startsWith('/@fs/')) {
				// Remove /@fs/ prefix, rest is absolute path
				return pathname.slice(5);  // "/@fs/C:/project/file.css" → "C:/project/file.css"
			}

			// Handle node_modules virtual paths
			if (pathname.includes('/node_modules/')) {
				// These are library files, skip them
				return null;
			}

			// Regular project file: /src/button.css → projectRoot/src/button.css
			// Remove leading slash for path.join
			if (pathname.startsWith('/')) {
				pathname = pathname.slice(1);
			}

			return path.join(this.projectRoot, pathname);
		} catch {
			return null;
		}
	}

	/**
	 * Check if URL is from our dev server
	 */
	isLocalDevServer(url: string): boolean {
		try {
			const parsed = new URL(url);
			return (
				(parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
				parsed.port === String(this.devServerPort)
			);
		} catch {
			return false;
		}
	}

	/**
	 * Check if URL points to node_modules (library code)
	 */
	isNodeModules(url: string): boolean {
		return url.includes('/node_modules/');
	}
}
```

---

## Phase 6: Style Source Orchestrator

**File: `electron-main/projectMode/cssResolvers/styleSourceOrchestrator.ts`**

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type {
	ElementStyleInfo,
	ResolvedCSSProperty,
	MatchedCSSRule,
	CSSSourceLocation,
	GetElementStylesRequest,
	GetElementStylesResult
} from '../../../common/cssResolvers/types.js';
import { CDPCssService } from './cdpCssService.js';
import { SourceMapResolver } from './sourceMapResolver.js';
import { CSSInJsDetector } from './cssInJsDetector.js';
import { URLToPathConverter } from './urlToPathConverter.js';

/**
 * Style Source Orchestrator
 *
 * Main entry point for CSS source resolution.
 * Combines all resolvers to provide complete style information.
 *
 * Flow:
 * 1. Get element's DOM node ID via CDP
 * 2. Get all matched styles via CDP CSS.getMatchedStylesForNode
 * 3. For each stylesheet, convert URL to local path
 * 4. Check for source maps (SCSS/LESS) and resolve to original
 * 5. Detect CSS-in-JS and redirect to component file
 * 6. Return unified ElementStyleInfo
 */
export class StyleSourceOrchestrator {

	constructor(
		private readonly cdpService: CDPCssService,
		private readonly sourceMapResolver: SourceMapResolver,
		private readonly cssInJsDetector: CSSInJsDetector,
		private readonly urlToPathConverter: URLToPathConverter
	) {}

	/**
	 * Get complete style information for an element
	 *
	 * This is the MAIN method called by the UI/IPC.
	 */
	async getElementStyles(request: GetElementStylesRequest): Promise<GetElementStylesResult> {
		try {
			const { browserViewId, target, projectRoot } = request;

			// 1. Get node ID
			let nodeId: number | null;
			if (typeof target === 'string') {
				nodeId = await this.cdpService.getNodeIdBySelector(browserViewId, target);
			} else {
				nodeId = await this.cdpService.getNodeIdAtPoint(browserViewId, target.x, target.y);
			}

			if (!nodeId) {
				return { success: false, error: 'Element not found' };
			}

			// 2. Get matched styles via CDP
			const matchedStyles = await this.cdpService.getMatchedStyles(browserViewId, nodeId);

			// 3. Get element info (tag, classes, etc.)
			const elementInfo = await this.getElementInfo(browserViewId, nodeId);

			// 4. Process matched rules
			const matchedRules = await this.processMatchedRules(
				matchedStyles.matchedCSSRules,
				projectRoot
			);

			// 5. Process inline styles
			const inlineStyles = this.processInlineStyles(
				matchedStyles.inlineStyle,
				elementInfo.htmlSource
			);

			// 6. Build resolved properties list
			const properties = this.buildResolvedProperties(
				matchedRules,
				inlineStyles,
				matchedStyles.inherited
			);

			// 7. Detect CSS-in-JS
			const cssInJs = this.cssInJsDetector.detectFromClassName(
				elementInfo.classes.join(' '),
				elementInfo.htmlSource?.file
			);

			// 8. Build final result
			const result: ElementStyleInfo = {
				tagName: elementInfo.tagName,
				id: elementInfo.id,
				classes: elementInfo.classes,
				htmlSource: elementInfo.htmlSource,
				properties,
				matchedRules,
				inlineStyles,
				cssInJs: cssInJs.detected ? cssInJs : undefined
			};

			return { success: true, data: result };

		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Process CDP matched rules into our format
	 */
	private async processMatchedRules(
		cdpRules: Array<{ rule: CDPCSSRule }>,
		projectRoot: string
	): Promise<MatchedCSSRule[]> {
		const rules: MatchedCSSRule[] = [];

		for (const { rule } of cdpRules) {
			// Skip user-agent (browser default) and injected styles
			if (rule.origin !== 'regular') continue;

			// Get stylesheet URL
			const sheetInfo = await this.cdpService.getStyleSheetInfo(
				/* browserViewId */ 0, // TODO: pass this through
				rule.styleSheetId
			);

			if (!sheetInfo) continue;

			// Convert URL to local path
			let filePath = this.urlToPathConverter.convert(sheetInfo.sourceURL);
			if (!filePath) continue;  // External or unmappable

			// Get location
			let location = this.cdpService.convertRange(rule.style.range, filePath);
			if (!location) continue;

			// Check for source map (SCSS/LESS)
			if (await this.sourceMapResolver.hasSourceMap(filePath)) {
				const originalLocation = await this.sourceMapResolver.resolveToOriginal(
					filePath,
					location.line,
					location.column
				);
				if (originalLocation) {
					location = originalLocation;
					filePath = originalLocation.file;
				}
			}

			// Process properties
			const properties = rule.style.cssProperties
				.filter(p => p.name && !p.name.startsWith('-webkit-'))  // Skip vendor prefixes
				.map(p => ({
					name: p.name,
					value: p.value,
					isOverridden: false,  // Will be calculated later
					location: p.range ? this.cdpService.convertRange(p.range, filePath!) : undefined
				}));

			rules.push({
				selector: rule.selectorList.text,
				file: filePath,
				location,
				properties,
				origin: rule.origin
			});
		}

		// Mark overridden properties (later rules override earlier ones with same property)
		this.markOverriddenProperties(rules);

		return rules;
	}

	/**
	 * Mark properties that are overridden by higher-specificity rules
	 */
	private markOverriddenProperties(rules: MatchedCSSRule[]): void {
		const seenProperties = new Set<string>();

		// Rules are in specificity order (highest first)
		for (const rule of rules) {
			for (const prop of rule.properties) {
				if (seenProperties.has(prop.name)) {
					prop.isOverridden = true;
				} else {
					seenProperties.add(prop.name);
				}
			}
		}
	}

	/**
	 * Process inline styles
	 */
	private processInlineStyles(
		inlineStyle: { cssProperties: CDPCSSProperty[] } | undefined,
		htmlSource?: CSSSourceLocation
	): ElementStyleInfo['inlineStyles'] {
		if (!inlineStyle) return [];

		return inlineStyle.cssProperties
			.filter(p => p.name && p.value)
			.map(p => ({
				name: p.name,
				value: p.value,
				location: htmlSource  // Inline styles point to the element in component
			}));
	}

	/**
	 * Build the final resolved properties list
	 */
	private buildResolvedProperties(
		matchedRules: MatchedCSSRule[],
		inlineStyles: ElementStyleInfo['inlineStyles'],
		inherited?: Array<{ matchedCSSRules: Array<{ rule: CDPCSSRule }> }>
	): ResolvedCSSProperty[] {
		const properties: ResolvedCSSProperty[] = [];
		const seenProperties = new Set<string>();

		// 1. Inline styles (highest priority)
		for (const style of inlineStyles) {
			properties.push({
				name: style.name,
				value: style.value,
				sourceType: 'inline',
				location: style.location,
				isOverridden: false
			});
			seenProperties.add(style.name);
		}

		// 2. Matched CSS rules
		for (const rule of matchedRules) {
			for (const prop of rule.properties) {
				const isOverridden = seenProperties.has(prop.name);

				properties.push({
					name: prop.name,
					value: prop.value,
					sourceType: 'css-file',
					location: prop.location || rule.location,
					selector: rule.selector,
					isOverridden
				});

				if (!isOverridden) {
					seenProperties.add(prop.name);
				}
			}
		}

		// 3. Inherited styles (lowest priority, simplified)
		// TODO: Process inherited array for inherited properties

		return properties;
	}

	/**
	 * Get basic element info (tag, classes, etc.)
	 */
	private async getElementInfo(
		browserViewId: number,
		nodeId: number
	): Promise<{
		tagName: string;
		id?: string;
		classes: string[];
		htmlSource?: CSSSourceLocation;
	}> {
		// Execute script to get element info including data-roopik-source
		const info = await this.browserService.executeScript(browserViewId, `
			(function() {
				// Find element by walking DOM with nodeId
				// This is simplified - actual implementation needs CDP DOM.describeNode
				return {
					tagName: 'div',  // TODO: get from CDP
					id: '',
					classes: [],
					htmlSource: null
				};
			})()
		`);

		return info;
	}
}
```

---

## Phase 7: Vite Plugin Enhancement

**File: `electron-main/projectMode/devServer/lib/plugins.mjs`**

Add to existing file:

```javascript
// ============================================
// CSS Source Maps Plugin
// ============================================

/**
 * Roopik CSS Source Maps Plugin
 *
 * Automatically enables CSS source maps in development mode.
 * This is required for SCSS/LESS source resolution.
 */
export function createCssSourceMapsPlugin() {
	return {
		name: 'roopik:css-source-maps',

		// Modify Vite config to enable CSS source maps
		config(config, { mode }) {
			// Only enable in development
			if (mode !== 'development' && mode !== 'serve') {
				return;
			}

			return {
				css: {
					devSourcemap: true
				}
			};
		}
	};
}

// ============================================
// Update getPluginsForFramework
// ============================================

export function getPluginsForFramework(frameworkId, options = {}) {
	const plugins = [];

	// Always add inject plugin (click-to-source script)
	plugins.push(createInjectPlugin());

	// Always add CORS plugin
	plugins.push(createCorsPlugin());

	// NEW: Always enable CSS source maps
	plugins.push(createCssSourceMapsPlugin());

	// Framework-specific source tracking...
	switch (frameworkId) {
		case 'react-vite':
			plugins.push(createReactSourcePlugin(options));
			break;
		// ... rest of cases
	}

	return plugins;
}
```

---

## Phase 8: IPC Integration

**File: `electron-main/projectMode/projectModeChannel.ts`**

Add new method to existing channel:

```typescript
// Add to IProjectModeService interface (in common/projectMode/ipc.ts)
export interface IProjectModeService {
	// ... existing methods ...

	/**
	 * Get complete style information for an element
	 * Uses CDP for deterministic source resolution
	 */
	getElementStyles(
		browserViewId: number,
		target: string | { x: number; y: number },
		projectRoot: string
	): Promise<GetElementStylesResult>;
}

// Add to ProjectModeChannel class
export class ProjectModeChannel implements IServerChannel<IProjectModeService> {

	private styleOrchestrator: StyleSourceOrchestrator;

	constructor(/* ... */) {
		// Initialize orchestrator with all resolvers
		this.styleOrchestrator = new StyleSourceOrchestrator(
			new CDPCssService(this.browserViewService),
			new SourceMapResolver(),
			new CSSInJsDetector(),
			new URLToPathConverter(/* projectRoot */)
		);
	}

	call(ctx: RemoteAgentConnectionContext, command: string, args?: any): Promise<any> {
		switch (command) {
			// ... existing cases ...

			case 'getElementStyles':
				return this.styleOrchestrator.getElementStyles({
					browserViewId: args.browserViewId,
					target: args.target,
					projectRoot: args.projectRoot
				});
		}
	}
}
```

---

## Phase 9: Inspect Panel UI

**File: `browser/projectMode/components/inspectPanel.ts`**

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type {
	ElementStyleInfo,
	ResolvedCSSProperty,
	MatchedCSSRule,
	CSSSourceLocation
} from '../../../common/cssResolvers/types.js';

/**
 * Inspect Panel UI
 *
 * Displays element information and CSS sources.
 * Features:
 * - Element info with "Open Source Code" button
 * - Computed styles with source links
 * - Matched CSS rules with file:line links
 * - Inline edit capability
 * - Overridden indicator for cascade
 */
export class InspectPanel {

	private container: HTMLElement;
	private isVisible: boolean = false;

	constructor(
		private readonly parent: HTMLElement,
		private readonly onOpenFile: (location: CSSSourceLocation) => void,
		private readonly onEditStyle: (property: ResolvedCSSProperty, newValue: string) => void
	) {
		this.container = this.createContainer();
		this.parent.appendChild(this.container);
	}

	/**
	 * Show panel with element style information
	 */
	show(data: ElementStyleInfo): void {
		this.container.innerHTML = '';
		this.container.style.display = 'flex';
		this.isVisible = true;

		// Header
		this.container.appendChild(this.createHeader());

		// Element section
		this.container.appendChild(this.createElementSection(data));

		// Computed styles section
		this.container.appendChild(this.createStylesSection(data.properties));

		// CSS Rules section
		this.container.appendChild(this.createRulesSection(data.matchedRules));
	}

	/**
	 * Hide panel
	 */
	hide(): void {
		this.container.style.display = 'none';
		this.isVisible = false;
	}

	/**
	 * Create main container
	 */
	private createContainer(): HTMLElement {
		const container = document.createElement('div');
		container.className = 'roopik-inspect-panel';
		container.style.cssText = `
			position: absolute;
			right: 0;
			top: 0;
			width: 320px;
			height: 100%;
			background: var(--vscode-sideBar-background);
			border-left: 1px solid var(--vscode-sideBar-border);
			display: none;
			flex-direction: column;
			overflow: hidden;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			z-index: 100;
		`;
		return container;
	}

	/**
	 * Create header with close button
	 */
	private createHeader(): HTMLElement {
		const header = document.createElement('div');
		header.style.cssText = `
			padding: 8px 12px;
			display: flex;
			justify-content: space-between;
			align-items: center;
			border-bottom: 1px solid var(--vscode-sideBar-border);
			font-weight: 600;
		`;
		header.innerHTML = `
			<span>INSPECT</span>
			<button class="close-btn" style="background: none; border: none; cursor: pointer; color: inherit;">✕</button>
		`;
		header.querySelector('.close-btn')?.addEventListener('click', () => this.hide());
		return header;
	}

	/**
	 * Create element info section
	 */
	private createElementSection(data: ElementStyleInfo): HTMLElement {
		const section = document.createElement('div');
		section.style.cssText = `padding: 12px; border-bottom: 1px solid var(--vscode-sideBar-border);`;

		// Element tag and classes
		const elementText = `<${data.tagName}${data.id ? ` id="${data.id}"` : ''}${data.classes.length ? ` class="${data.classes.join(' ')}"` : ''}>`;

		section.innerHTML = `
			<div style="font-family: monospace; font-size: 12px; color: var(--vscode-textLink-foreground); margin-bottom: 8px;">
				${this.escapeHtml(elementText)}
			</div>
		`;

		// Open source button (if htmlSource available)
		if (data.htmlSource) {
			const btn = document.createElement('button');
			btn.style.cssText = `
				background: var(--vscode-button-secondaryBackground);
				color: var(--vscode-button-secondaryForeground);
				border: none;
				padding: 4px 8px;
				cursor: pointer;
				font-size: 12px;
				display: flex;
				align-items: center;
				gap: 4px;
			`;
			btn.innerHTML = `📄 Open Source Code`;
			btn.title = `${data.htmlSource.file}:${data.htmlSource.line}`;
			btn.addEventListener('click', () => this.onOpenFile(data.htmlSource!));
			section.appendChild(btn);
		}

		return section;
	}

	/**
	 * Create computed styles section
	 */
	private createStylesSection(properties: ResolvedCSSProperty[]): HTMLElement {
		const section = document.createElement('div');
		section.style.cssText = `padding: 12px; flex: 1; overflow-y: auto;`;

		const title = document.createElement('div');
		title.style.cssText = `font-weight: 600; margin-bottom: 8px;`;
		title.textContent = 'COMPUTED STYLES';
		section.appendChild(title);

		const list = document.createElement('div');
		list.style.cssText = `font-family: monospace; font-size: 11px;`;

		for (const prop of properties) {
			const row = this.createPropertyRow(prop);
			list.appendChild(row);
		}

		section.appendChild(list);
		return section;
	}

	/**
	 * Create a single property row
	 */
	private createPropertyRow(prop: ResolvedCSSProperty): HTMLElement {
		const row = document.createElement('div');
		row.style.cssText = `
			display: flex;
			align-items: center;
			padding: 2px 0;
			gap: 8px;
			${prop.isOverridden ? 'opacity: 0.5; text-decoration: line-through;' : ''}
		`;

		// Property name
		const name = document.createElement('span');
		name.style.cssText = `color: var(--vscode-symbolIcon-propertyForeground); min-width: 120px;`;
		name.textContent = prop.name;
		row.appendChild(name);

		// Property value
		const value = document.createElement('span');
		value.style.cssText = `color: var(--vscode-symbolIcon-stringForeground); flex: 1;`;
		value.textContent = prop.value;
		row.appendChild(value);

		// Source link (if available)
		if (prop.location && prop.sourceType === 'css-file') {
			const link = document.createElement('a');
			link.style.cssText = `
				color: var(--vscode-textLink-foreground);
				cursor: pointer;
				font-size: 10px;
				white-space: nowrap;
			`;
			const fileName = prop.location.file.split(/[/\\]/).pop();
			link.textContent = `→ ${fileName}:${prop.location.line}`;
			link.title = `${prop.location.file}:${prop.location.line}`;
			link.addEventListener('click', (e) => {
				e.preventDefault();
				this.onOpenFile(prop.location!);
			});
			row.appendChild(link);
		} else if (prop.sourceType === 'inline') {
			const badge = document.createElement('span');
			badge.style.cssText = `font-size: 10px; opacity: 0.7;`;
			badge.textContent = '(inline)';
			row.appendChild(badge);
		} else if (prop.sourceType === 'inherited') {
			const badge = document.createElement('span');
			badge.style.cssText = `font-size: 10px; opacity: 0.7;`;
			badge.textContent = '(inherited)';
			row.appendChild(badge);
		}

		// Edit button (if source is editable)
		if (prop.location && !prop.isOverridden) {
			const editBtn = document.createElement('button');
			editBtn.style.cssText = `
				background: none;
				border: none;
				cursor: pointer;
				padding: 2px;
				opacity: 0.5;
				font-size: 10px;
			`;
			editBtn.textContent = '✎';
			editBtn.title = 'Edit value';
			editBtn.addEventListener('click', () => this.startInlineEdit(prop, value));
			row.appendChild(editBtn);
		}

		return row;
	}

	/**
	 * Create CSS rules section
	 */
	private createRulesSection(rules: MatchedCSSRule[]): HTMLElement {
		const section = document.createElement('div');
		section.style.cssText = `
			padding: 12px;
			border-top: 1px solid var(--vscode-sideBar-border);
			max-height: 200px;
			overflow-y: auto;
		`;

		const title = document.createElement('div');
		title.style.cssText = `font-weight: 600; margin-bottom: 8px;`;
		title.textContent = `CSS RULES (${rules.length} rules match)`;
		section.appendChild(title);

		for (const rule of rules) {
			const ruleEl = this.createRuleElement(rule);
			section.appendChild(ruleEl);
		}

		return section;
	}

	/**
	 * Create a CSS rule element
	 */
	private createRuleElement(rule: MatchedCSSRule): HTMLElement {
		const el = document.createElement('div');
		el.style.cssText = `
			margin-bottom: 8px;
			font-family: monospace;
			font-size: 11px;
		`;

		// Selector and file link
		const header = document.createElement('div');
		header.style.cssText = `display: flex; justify-content: space-between; align-items: center;`;

		const selector = document.createElement('span');
		selector.style.cssText = `color: var(--vscode-symbolIcon-classForeground);`;
		selector.textContent = rule.selector;
		header.appendChild(selector);

		const fileLink = document.createElement('a');
		fileLink.style.cssText = `color: var(--vscode-textLink-foreground); cursor: pointer; font-size: 10px;`;
		const fileName = rule.file.split(/[/\\]/).pop();
		fileLink.textContent = `${fileName}:${rule.location.line} →`;
		fileLink.addEventListener('click', () => this.onOpenFile(rule.location));
		header.appendChild(fileLink);

		el.appendChild(header);

		// Properties (collapsible - simplified here)
		const props = document.createElement('div');
		props.style.cssText = `padding-left: 12px; color: var(--vscode-descriptionForeground);`;
		for (const prop of rule.properties.slice(0, 3)) {  // Show first 3
			const propLine = document.createElement('div');
			propLine.style.cssText = prop.isOverridden ? 'text-decoration: line-through; opacity: 0.5;' : '';
			propLine.textContent = `${prop.name}: ${prop.value}`;
			props.appendChild(propLine);
		}
		if (rule.properties.length > 3) {
			const more = document.createElement('div');
			more.style.cssText = `opacity: 0.5;`;
			more.textContent = `... ${rule.properties.length - 3} more`;
			props.appendChild(more);
		}
		el.appendChild(props);

		return el;
	}

	/**
	 * Start inline edit for a property
	 */
	private startInlineEdit(prop: ResolvedCSSProperty, valueElement: HTMLElement): void {
		const input = document.createElement('input');
		input.type = 'text';
		input.value = prop.value;
		input.style.cssText = `
			font-family: monospace;
			font-size: 11px;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			padding: 2px 4px;
			width: 100%;
		`;

		const originalText = valueElement.textContent;
		valueElement.textContent = '';
		valueElement.appendChild(input);
		input.focus();
		input.select();

		const commit = () => {
			const newValue = input.value.trim();
			if (newValue && newValue !== prop.value) {
				this.onEditStyle(prop, newValue);
			}
			valueElement.textContent = newValue || originalText;
		};

		input.addEventListener('blur', commit);
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') commit();
			if (e.key === 'Escape') {
				valueElement.textContent = originalText;
			}
		});
	}

	/**
	 * Escape HTML for safe display
	 */
	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
}
```

---

## Implementation Order

| Phase | Module | Effort | Dependencies |
|-------|--------|--------|--------------|
| **1** | `common/cssResolvers/types.ts` | Small | None |
| **2** | `cssResolvers/cdpCssService.ts` | Medium | Types, CDP infra |
| **3** | `cssResolvers/urlToPathConverter.ts` | Small | Types |
| **4** | `cssResolvers/sourceMapResolver.ts` | Medium | Types, npm source-map |
| **5** | `cssResolvers/cssInJsDetector.ts` | Small | Types |
| **6** | `cssResolvers/styleSourceOrchestrator.ts` | Medium | All resolvers |
| **7** | `devServer/lib/plugins.mjs` | Small | None |
| **8** | `projectModeChannel.ts` | Small | Orchestrator |
| **9** | `browser/projectMode/components/inspectPanel.ts` | Large | IPC, Types |

---

## What This Enables

1. **Click to CSS Source** - Open exact file:line where property is defined
2. **Click to Component** - For inline/CSS-in-JS, open the component file
3. **Inline Edit** - Modify CSS value directly in panel
4. **AI Context** - Agent knows exactly which file/line to edit
5. **Multi-source View** - See all rules affecting an element
6. **Cascade Visualization** - See which rules are overridden
7. **SCSS/LESS Support** - Source maps resolve to original files
8. **CSS-in-JS Awareness** - Detects and redirects appropriately

---

## What We Skip (Intentionally)

| Case | Reason |
|------|--------|
| **Tailwind JIT** | No source file (generated from class names) |
| **CDN CSS** | External, read-only, not our files |
| **node_modules** | Library code, not meant to edit |
| **Minified CSS** | No source map, unreadable |

---

## Future Enhancements (Not in Scope)

- Tailwind class → source file scanner (build-time)
- Live CSS editing (modify CSS and see changes without reload)
- CSS variable resolution (`--color-primary` → actual value)
- Pseudo-class styles (`:hover`, `:focus`)
- Media query context

---

## Dependencies

```json
{
  "dependencies": {
    "source-map": "^0.7.4"
  }
}
```

Note: `source-map` package is already commonly used in Node.js projects.

---

## Testing Checklist

- [ ] Plain CSS file → opens correct file:line
- [ ] CSS Modules → opens correct file:line
- [ ] SCSS file → resolves to .scss (not compiled .css)
- [ ] LESS file → resolves to .less
- [ ] Inline styles → shows "inline" badge, opens component
- [ ] CSS-in-JS (Emotion) → detects, redirects to component
- [ ] CSS-in-JS (styled-components) → detects, redirects to component
- [ ] Overridden properties → shows strikethrough
- [ ] Multiple rules → shows all with cascade order
- [ ] Inline edit → modifies value, triggers callback
- [ ] External CSS (CDN) → no link shown (graceful skip)

---

**Status**: Ready for Review
**Next Step**: Implement Phase 1 (Types) upon approval
