/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * CSS Source Tracking Types
 *
 * Shared interfaces for CSS source resolution across browser and main processes.
 * Used by the CSS resolvers to provide deterministic source locations for styling.
 */

// ============================================
// Source Location Types
// ============================================

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
	| 'scss-file'     // SCSS file (resolved via source map)
	| 'less-file'     // LESS file (resolved via source map)
	| 'inline'        // style="" attribute on element
	| 'css-in-js'     // Emotion, styled-components, etc.
	| 'inherited'     // Inherited from parent element
	| 'user-agent';   // Browser default styles

/**
 * CSS-in-JS library identification
 */
export type CSSInJSLibrary =
	| 'emotion'
	| 'styled-components'
	| 'linaria'
	| 'stitches'
	| 'vanilla-extract'
	| 'other';

// ============================================
// Property & Rule Types
// ============================================

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

	/** Original selector specificity (for sorting) */
	specificity?: string;
}

/**
 * A CSS rule that matches the inspected element
 */
export interface MatchedCSSRule {
	/** Selector text (e.g., ".btn-primary", "button[type='submit']") */
	selector: string;

	/** Source file path (absolute) */
	file: string;

	/** Location of the rule in source */
	location: CSSSourceLocation;

	/** All properties defined in this rule */
	properties: MatchedCSSProperty[];

	/** Specificity for cascade ordering (e.g., "0,1,0" for .class) */
	specificity?: string;

	/** Origin of the rule */
	origin: 'regular' | 'user-agent' | 'injected';

	/** Is this from a source-mapped file (SCSS/LESS)? */
	isSourceMapped?: boolean;

	/** Original file before source map resolution */
	originalFile?: string;
}

/**
 * A property within a matched CSS rule
 */
export interface MatchedCSSProperty {
	/** Property name */
	name: string;
	/** Property value */
	value: string;
	/**
	 * Is this specific property overridden by a closer rule?
	 * UI should show this as STRUCK THROUGH
	 */
	isOverridden: boolean;
	/**
	 * Is this property non-inheritable? (only used in inherited styles section)
	 * Properties like background-color, margin, padding don't inherit.
	 * UI should show this as GREYED OUT (not struck through)
	 */
	isNotInheritable?: boolean;
	/** Property location within rule (if available) */
	location?: CSSSourceLocation;
	/** Has !important flag */
	isImportant?: boolean;
}

// ============================================
// Element Style Info (Complete Result)
// ============================================

/**
 * Computed styles from browser - actual pixel values after CSS calculations
 */
export interface ComputedStyleValues {
	// Layout
	display?: string;
	position?: string;
	flexDirection?: string;
	justifyContent?: string;
	alignItems?: string;
	gap?: string;

	// Box Model (all in pixels)
	width?: string;
	height?: string;
	minWidth?: string;
	maxWidth?: string;
	minHeight?: string;
	maxHeight?: string;

	// Spacing (individual values)
	marginTop?: string;
	marginRight?: string;
	marginBottom?: string;
	marginLeft?: string;
	paddingTop?: string;
	paddingRight?: string;
	paddingBottom?: string;
	paddingLeft?: string;

	// Border
	borderWidth?: string;
	borderStyle?: string;
	borderColor?: string;
	borderRadius?: string;

	// Typography
	fontFamily?: string;
	fontSize?: string;
	fontWeight?: string;
	lineHeight?: string;
	letterSpacing?: string;
	textAlign?: string;

	// Colors
	color?: string;
	backgroundColor?: string;

	// Effects
	opacity?: string;
	boxShadow?: string;
	overflow?: string;
	transform?: string;
	zIndex?: string;

	// Position values
	top?: string;
	right?: string;
	bottom?: string;
	left?: string;

	// Bounding box (from getBoundingClientRect)
	boundingBox?: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
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

	/** Component name (from data-roopik-component attribute) */
	componentName?: string;

	/**
	 * All resolved CSS properties with sources
	 * These are the final computed values with their source information
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
	inlineStyles: InlineStyleProperty[];

	/**
	 * CSS-in-JS detection result
	 */
	cssInJs?: CSSInJSDetectionResult;

	/**
	 * Inherited styles from parent elements
	 */
	inheritedStyles?: InheritedStyleInfo[];

	/**
	 * Actual computed pixel values from the browser
	 * Used by the Design tab to show resolved values (e.g., 16px instead of clamp(...))
	 */
	computedStyles?: ComputedStyleValues;
}

/**
 * An inline style property
 */
export interface InlineStyleProperty {
	/** Property name */
	name: string;
	/** Property value */
	value: string;
	/** Location points to the element in component file */
	location?: CSSSourceLocation;
}

/**
 * Inherited style information (grouped by parent element like Chrome DevTools)
 */
export interface InheritedStyleInfo {
	/** Parent element description (e.g., "section.hero", "body") */
	fromElement: string;
	/** CSS rules from this parent that apply inherited properties */
	matchedRules: MatchedCSSRule[];
	/** Inline styles from this parent (if any) */
	inlineStyle?: InlineStyleProperty[];
}

// ============================================
// CSS-in-JS Detection
// ============================================

/**
 * Result of CSS-in-JS detection
 */
export interface CSSInJSDetectionResult {
	/** Was CSS-in-JS detected? */
	detected: boolean;
	/** Which library? */
	library?: CSSInJSLibrary;
	/** Generated class name that was detected */
	generatedClassName?: string;
	/** Component file to redirect to (from data-roopik-source) */
	componentFile?: string;
	/** Confidence level */
	confidence: 'high' | 'medium' | 'low';
}

// ============================================
// Request/Response Types (for IPC)
// ============================================

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

	/** Include inherited styles? (default: true) */
	includeInherited?: boolean;

	/** Include user-agent styles? (default: false) */
	includeUserAgent?: boolean;
}

/**
 * Result from style source resolution
 */
export interface GetElementStylesResult {
	/** Was the operation successful? */
	success: boolean;

	/** Element style information (if successful) */
	data?: ElementStyleInfo;

	/** Error message (if failed) */
	error?: string;

	/** Additional diagnostics */
	diagnostics?: {
		/** Time taken in ms */
		duration: number;
		/** Number of stylesheets scanned */
		styleSheetsScanned: number;
		/** Number of rules matched */
		rulesMatched: number;
		/** Source maps used */
		sourceMapsUsed: string[];
	};
}

// ============================================
// CDP Response Types (Internal)
// ============================================

/**
 * CDP CSS property (from CSS.getMatchedStylesForNode)
 */
export interface CDPCSSProperty {
	name: string;
	value: string;
	important?: boolean;
	implicit?: boolean;
	text?: string;
	parsedOk?: boolean;
	disabled?: boolean;
	range?: CDPSourceRange;
}

/**
 * CDP source range
 */
export interface CDPSourceRange {
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
}

/**
 * CDP CSS rule
 */
export interface CDPCSSRule {
	styleSheetId: string;
	selectorList: {
		selectors: Array<{ text: string; range?: CDPSourceRange }>;
		text: string;
	};
	origin: 'injected' | 'user-agent' | 'inspector' | 'regular';
	style: {
		styleSheetId?: string;
		cssProperties: CDPCSSProperty[];
		cssText?: string;
		range?: CDPSourceRange;
	};
	media?: Array<{ text: string }>;
}

/**
 * CDP matched styles response
 */
export interface CDPMatchedStylesResponse {
	inlineStyle?: {
		styleSheetId?: string;
		cssProperties: CDPCSSProperty[];
		cssText?: string;
	};
	attributesStyle?: {
		cssProperties: CDPCSSProperty[];
	};
	matchedCSSRules: Array<{
		rule: CDPCSSRule;
		matchingSelectors: number[];
	}>;
	pseudoElements?: Array<{
		pseudoType: string;
		matches: Array<{ rule: CDPCSSRule }>;
	}>;
	inherited?: Array<{
		inlineStyle?: { cssProperties: CDPCSSProperty[] };
		matchedCSSRules: Array<{ rule: CDPCSSRule }>;
	}>;
	cssKeyframesRules?: Array<unknown>;
}

/**
 * CDP stylesheet header
 */
export interface CDPStyleSheetHeader {
	styleSheetId: string;
	frameId: string;
	sourceURL: string;
	origin: string;
	title: string;
	disabled: boolean;
	isInline: boolean;
	isMutable: boolean;
	isConstructed: boolean;
	startLine: number;
	startColumn: number;
	length: number;
	endLine: number;
	endColumn: number;
	sourceMapURL?: string;
}

// ============================================
// Utility Types
// ============================================

/**
 * Style edit operation (for inline editing)
 */
export interface StyleEditOperation {
	/** Type of edit */
	type: 'modify' | 'add' | 'delete';
	/** Target property name */
	property: string;
	/** New value (for modify/add) */
	value?: string;
	/** Source location to edit */
	location: CSSSourceLocation;
	/** Selector context (for CSS files) */
	selector?: string;
}

/**
 * Result of a style edit operation
 */
export interface StyleEditResult {
	success: boolean;
	error?: string;
	/** Updated location after edit */
	newLocation?: CSSSourceLocation;
}
