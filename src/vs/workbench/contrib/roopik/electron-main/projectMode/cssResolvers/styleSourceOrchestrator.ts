/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import type {
	ElementStyleInfo,
	ResolvedCSSProperty,
	MatchedCSSRule,
	MatchedCSSProperty,
	CSSSourceLocation,
	GetElementStylesRequest,
	GetElementStylesResult,
	InlineStyleProperty,
	InheritedStyleInfo,
	CDPMatchedStylesResponse,
	CDPCSSRule,
	CDPCSSProperty
} from '../../../common/cssResolvers/types.js';
import type { CDPCssService } from './cdpCssService.js';
import { SourceMapResolver } from './sourceMapResolver.js';
import { CSSInJsDetector } from './cssInJsDetector.js';
import { URLToPathConverter } from './urlToPathConverter.js';

/**
 * Style Source Orchestrator
 *
 * Main entry point for CSS source resolution in Mode 2 (Project Preview).
 * Combines all resolvers to provide complete style information for an element.
 *
 * This is the service that IPC calls from the renderer process to get
 * style information for the inspect panel UI.
 *
 * Flow:
 * 1. Get element's DOM node ID via CDP (by selector or coordinates)
 * 2. Get all matched styles via CDP CSS.getMatchedStylesForNode
 * 3. Get element attributes (tag, classes, data-roopik-source)
 * 4. For each stylesheet, convert URL to local path
 * 5. Check for source maps (SCSS/LESS) and resolve to original
 * 6. Detect CSS-in-JS and redirect to component file
 * 7. Mark overridden properties for cascade visualization
 * 8. Return unified ElementStyleInfo
 *
 * Error handling:
 * - Returns { success: false, error: string } for all failures
 * - Never throws - UI should always get a valid response
 */
export class StyleSourceOrchestrator {

	private readonly sourceMapResolver: SourceMapResolver;
	private readonly cssInJsDetector: CSSInJsDetector;
	private readonly urlToPathConverter: URLToPathConverter;

	constructor(
		private readonly cdpService: CDPCssService,
		private projectRoot: string
	) {
		this.sourceMapResolver = new SourceMapResolver();
		this.cssInJsDetector = new CSSInJsDetector();
		this.urlToPathConverter = new URLToPathConverter(projectRoot);
	}

	/**
	 * Update project root (when project changes)
	 */
	setProjectRoot(projectRoot: string): void {
		this.projectRoot = projectRoot;
		this.urlToPathConverter.setProjectRoot(projectRoot);
		// Clear source map cache since paths have changed
		this.sourceMapResolver.clearCache();
	}

	/**
	 * Get complete style information for an element
	 *
	 * This is the MAIN method called by the UI/IPC.
	 */
	async getElementStyles(request: GetElementStylesRequest): Promise<GetElementStylesResult> {
		const startTime = Date.now();
		let styleSheetsScanned = 0;
		let rulesMatched = 0;
		const sourceMapsUsed: string[] = [];

		try {
			const { browserViewId, target, projectRoot, includeUserAgent = false } = request;

			// Update project root if provided
			if (projectRoot && projectRoot !== this.projectRoot) {
				this.setProjectRoot(projectRoot);
			}

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

			// 2. Get element info (tag, classes, data-roopik-source)
			const nodeAttrs = await this.cdpService.getNodeAttributes(browserViewId, nodeId);
			if (!nodeAttrs) {
				return { success: false, error: 'Failed to get element attributes' };
			}

			// Parse data-roopik-source attribute for HTML source location
			const htmlSource = this.parseRoopikSourceAttribute(
				nodeAttrs.attributes['data-roopik-source']
			);

			// Parse component name
			const componentName = nodeAttrs.attributes['data-roopik-component'];

			// Get class list
			const classes = nodeAttrs.className ? nodeAttrs.className.split(/\s+/).filter(Boolean) : [];

			// 3. Get matched styles via CDP
			const matchedStyles = await this.cdpService.getMatchedStyles(browserViewId, nodeId);
			if (!matchedStyles) {
				return { success: false, error: 'Failed to get matched styles' };
			}

			// 4. Process matched rules
			const { rules: matchedRules, scanned, mapsUsed } = await this.processMatchedRules(
				browserViewId,
				matchedStyles.matchedCSSRules || [],
				includeUserAgent,
				htmlSource?.file // Pass HTML file for inline style attribution
			);
			styleSheetsScanned = scanned;
			rulesMatched = matchedRules.length;
			sourceMapsUsed.push(...mapsUsed);

			// 5. Process inline styles
			const inlineStyles = this.processInlineStyles(
				matchedStyles.inlineStyle,
				htmlSource
			);

			// 6. Process inherited styles
			// Pass element's own styles so we can correctly mark overridden inherited properties
			const inheritedStyles = await this.processInheritedStyles(
				browserViewId,
				matchedStyles.inherited || [],
				includeUserAgent,
				htmlSource?.file, // Pass HTML file for inline style attribution
				matchedRules,     // Element's own matched rules
				inlineStyles      // Element's inline styles
			);

			// 7. Build resolved properties list (final computed values with sources)
			const properties = this.buildResolvedProperties(
				matchedRules,
				inlineStyles,
				inheritedStyles
			);

			// 8. Detect CSS-in-JS
			const cssInJsResult = this.cssInJsDetector.detectFromClassName(
				classes.join(' '),
				htmlSource?.file
			);

			// 9. Build final result
			const result: ElementStyleInfo = {
				tagName: nodeAttrs.tagName,
				id: nodeAttrs.id,
				classes,
				htmlSource,
				componentName,
				properties,
				matchedRules,
				inlineStyles,
				cssInJs: cssInJsResult.detected ? cssInJsResult : undefined,
				inheritedStyles: inheritedStyles.length > 0 ? inheritedStyles : undefined
			};

			const duration = Date.now() - startTime;

			return {
				success: true,
				data: result,
				diagnostics: {
					duration,
					styleSheetsScanned,
					rulesMatched,
					sourceMapsUsed
				}
			};

		} catch (error) {
			console.error('[StyleSourceOrchestrator] Error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				diagnostics: {
					duration: Date.now() - startTime,
					styleSheetsScanned,
					rulesMatched,
					sourceMapsUsed
				}
			};
		}
	}

	// ============================================
	// Processing Methods
	// ============================================

	/**
	 * Process CDP matched rules into our format
	 *
	 * @param browserViewId - Browser view ID
	 * @param cdpRules - CDP matched rules
	 * @param includeUserAgent - Whether to include user-agent styles
	 * @param htmlFile - HTML file path for inline style attribution
	 */
	private async processMatchedRules(
		browserViewId: number,
		cdpRules: CDPMatchedStylesResponse['matchedCSSRules'],
		includeUserAgent: boolean,
		htmlFile?: string
	): Promise<{ rules: MatchedCSSRule[]; scanned: number; mapsUsed: string[] }> {
		const rules: MatchedCSSRule[] = [];
		const mapsUsed: string[] = [];
		let scanned = 0;

		if (!cdpRules) {
			return { rules, scanned, mapsUsed };
		}

		for (const { rule, matchingSelectors } of cdpRules) {
			scanned++;

			// Skip user-agent styles unless requested
			if (rule.origin === 'user-agent' && !includeUserAgent) {
				continue;
			}

			// Skip inspector-injected styles (DevTools temporary styles)
			if (rule.origin === 'inspector') {
				continue;
			}

			// Get full stylesheet header (includes startLine offset for embedded styles)
			const sheetHeader = await this.cdpService.getStyleSheetHeader(
				browserViewId,
				rule.styleSheetId
			);

			// Also get basic source info for URL conversion
			const sheetInfo = sheetHeader ? {
				sourceURL: sheetHeader.sourceURL,
				sourceMapURL: sheetHeader.sourceMapURL,
				isInline: sheetHeader.isInline
			} : null;

			// Determine file path and origin
			let filePath: string | null = null;
			let isSourceMapped = false;
			let originalFile: string | undefined;
			let origin: 'regular' | 'user-agent' | 'injected' = 'regular';

			if (rule.origin === 'user-agent') {
				origin = 'user-agent';
				filePath = 'user-agent';
			} else if (rule.origin === 'injected') {
				origin = 'injected';
				filePath = 'injected';
			} else if (sheetInfo) {
				// Check for CSS-in-JS (blob: or data: URLs)
				if (this.cssInJsDetector.isGeneratedStyleSheet(sheetInfo.sourceURL, sheetInfo.isInline)) {
					// CSS-in-JS: skip for now, will be handled at element level
					continue;
				}

				// Handle inline <style> tags (empty sourceURL, isInline=true)
				if (sheetInfo.isInline && !sheetInfo.sourceURL) {
					// Inline style tag - point to the HTML file if we know it
					filePath = htmlFile || '<inline-style>';
				} else if (sheetInfo.sourceURL) {
					// Check if sourceURL is already an absolute file path
					// (from Vite's inline source map extraction)
					if (this.isAbsoluteFilePath(sheetInfo.sourceURL)) {
						filePath = sheetInfo.sourceURL;
					} else {
						// Convert URL to local path
						filePath = this.urlToPathConverter.convert(sheetInfo.sourceURL);
					}

					if (!filePath) {
						// External or unmappable URL, skip
						continue;
					}

					// Check for source map (SCSS/LESS)
					if (await this.sourceMapResolver.hasSourceMap(filePath)) {
						mapsUsed.push(filePath);
						isSourceMapped = true;
						originalFile = filePath;
					}
				}
			} else {
				// sheetInfo is null - likely an inline style in plain HTML
				// Use the HTML file if available, otherwise use a marker
				filePath = htmlFile || '<inline-style>';
			}

			if (!filePath) {
				continue;
			}

			// Get location from rule style range
			let location = this.cdpService.convertRange(rule.style.range, filePath);

			// For Vite-injected styles (Vue SFC, Svelte, etc.), resolve using inline source map
			// The sourceMapURL contains base64-encoded mappings to original file positions
			if (location && sheetHeader?.sourceMapURL?.startsWith('data:application/json;base64,')) {
				const originalPos = this.cdpService.resolvePositionFromInlineSourceMap(
					sheetHeader.sourceMapURL,
					location.line,
					location.column
				);
				if (originalPos) {
					// Use the source-mapped position
					location = {
						...location,
						file: this.resolveSourceMapPath(originalPos.file, filePath),
						line: originalPos.line,
						column: originalPos.column
					};
					// Update filePath to the resolved source file
					filePath = location.file;
					console.log('[StyleSourceOrchestrator] Resolved via inline source map:', {
						selector: rule.selectorList.text,
						file: filePath?.slice(-30),
						line: location.line
					});
				}
			} else if (location && sheetHeader && sheetHeader.startLine > 0) {
				// Fallback: Apply stylesheet offset for embedded styles
				// CDP's rule.style.range is relative to the stylesheet's start position
				location = {
					...location,
					line: location.line + sheetHeader.startLine,
					endLine: location.endLine ? location.endLine + sheetHeader.startLine : undefined
				};
			}

			// Try to resolve through source map
			if (isSourceMapped && location && originalFile) {
				const originalLocation = await this.sourceMapResolver.resolveToOriginal(
					originalFile,
					location.line,
					location.column
				);
				if (originalLocation) {
					location = originalLocation;
					filePath = originalLocation.file;
				}
			}

			// If no location, create a basic one
			if (!location) {
				location = { file: filePath, line: 1, column: 0 };
			}

			// Get matching selector text
			const selectorText = this.getMatchingSelectorText(rule, matchingSelectors);

			// Process properties (pass source map info for embedded styles)
			const properties = await this.processRuleProperties(
				rule.style.cssProperties,
				filePath,
				isSourceMapped ? originalFile : undefined,
				sheetHeader?.startLine || 0,
				sheetHeader?.sourceMapURL
			);

			// Calculate specificity
			const specificity = this.cdpService.calculateSpecificity(selectorText);

			rules.push({
				selector: selectorText,
				file: filePath,
				location,
				properties,
				specificity,
				origin,
				isSourceMapped,
				originalFile
			});
		}

		// Mark overridden properties (later rules in array = higher specificity)
		this.markOverriddenProperties(rules);

		return { rules, scanned, mapsUsed };
	}

	/**
	 * Get the matching selector text from a rule
	 */
	private getMatchingSelectorText(rule: CDPCSSRule, matchingSelectors: number[]): string {
		// If we have matching selector indices, use them
		if (matchingSelectors && matchingSelectors.length > 0 && rule.selectorList.selectors) {
			const matchingTexts = matchingSelectors
				.map(idx => rule.selectorList.selectors[idx]?.text)
				.filter(Boolean);
			if (matchingTexts.length > 0) {
				return matchingTexts.join(', ');
			}
		}
		// Fallback to full selector text
		return rule.selectorList.text;
	}

	/**
	 * Process CSS properties from a rule
	 *
	 * Important: We only include properties that have a source range.
	 * Properties without a range are expanded/computed values (e.g., padding-top
	 * expanded from padding shorthand) and should not be shown in "Element Styles".
	 *
	 * @param cssProperties - CDP CSS properties
	 * @param filePath - File path for the stylesheet
	 * @param originalFile - Original file before source map resolution
	 * @param stylesheetStartLine - Line offset for embedded styles (Vue SFC, Svelte)
	 * @param sourceMapURL - Inline source map URL for Vite-injected styles
	 */
	private async processRuleProperties(
		cssProperties: CDPCSSProperty[],
		filePath: string,
		originalFile?: string,
		stylesheetStartLine: number = 0,
		sourceMapURL?: string
	): Promise<MatchedCSSProperty[]> {
		const properties: MatchedCSSProperty[] = [];
		const hasInlineSourceMap = sourceMapURL?.startsWith('data:application/json;base64,');

		for (const prop of cssProperties) {
			// Skip if no name (shouldn't happen but be safe)
			if (!prop.name) {
				continue;
			}

			// Skip internal/disabled properties
			if (prop.disabled || prop.implicit) {
				continue;
			}

			// Skip properties without a source range - these are expanded/computed
			// values (e.g., padding-top from "padding: 10px") that weren't explicitly
			// written in the CSS file. We only want to show what the user wrote.
			if (!prop.range) {
				continue;
			}

			// Skip vendor prefixes (optional, keep for now)
			// if (prop.name.startsWith('-webkit-') || prop.name.startsWith('-moz-')) {
			//   continue;
			// }

			let location = this.cdpService.convertRange(prop.range, filePath);

			// For Vite-injected styles, resolve using inline source map
			if (location && hasInlineSourceMap) {
				const originalPos = this.cdpService.resolvePositionFromInlineSourceMap(
					sourceMapURL,
					location.line,
					location.column
				);
				if (originalPos) {
					location = {
						...location,
						file: this.resolveSourceMapPath(originalPos.file, filePath),
						line: originalPos.line,
						column: originalPos.column
					};
				}
			} else if (location && stylesheetStartLine > 0) {
				// Fallback: Apply stylesheet offset for embedded styles
				location = {
					...location,
					line: location.line + stylesheetStartLine,
					endLine: location.endLine ? location.endLine + stylesheetStartLine : undefined
				};
			}

			// Try source map resolution for property location (SCSS/LESS)
			if (originalFile && location) {
				const originalLocation = await this.sourceMapResolver.resolveToOriginal(
					originalFile,
					location.line,
					location.column
				);
				if (originalLocation) {
					location = originalLocation;
				}
			}

			properties.push({
				name: prop.name,
				value: prop.value,
				isOverridden: false, // Will be set by markOverriddenProperties
				location,
				isImportant: prop.important
			});
		}

		return properties;
	}

	/**
	 * Process inline styles
	 */
	private processInlineStyles(
		inlineStyle: CDPMatchedStylesResponse['inlineStyle'],
		htmlSource?: CSSSourceLocation
	): InlineStyleProperty[] {
		if (!inlineStyle || !inlineStyle.cssProperties) {
			return [];
		}

		return inlineStyle.cssProperties
			.filter(p => p.name && p.value && !p.disabled && !p.implicit)
			.map(p => ({
				name: p.name,
				value: p.value,
				// Inline styles point to the element in component file
				location: htmlSource
			}));
	}

	/**
	 * Process inherited styles from parent elements
	 *
	 * Groups styles by parent element like Chrome DevTools shows:
	 * "Inherited from section.hero"
	 * "Inherited from body"
	 *
	 * Shows ALL properties from rules that have inheritable properties,
	 * including overridden ones (they'll be shown struck-out in UI).
	 *
	 * Override logic:
	 * - A property is "overridden" (struck through) if a CLOSER rule defines the same property
	 * - A property is "not inheritable" (greyed out) if it doesn't inherit (like background-color)
	 * - "Closer" means: element's own rules > parent's rules > grandparent's rules
	 */
	private async processInheritedStyles(
		browserViewId: number,
		inherited: NonNullable<CDPMatchedStylesResponse['inherited']>,
		includeUserAgent: boolean,
		htmlFile?: string,
		elementMatchedRules?: MatchedCSSRule[],
		elementInlineStyles?: InlineStyleProperty[]
	): Promise<InheritedStyleInfo[]> {
		const inheritedStyles: InheritedStyleInfo[] = [];

		// Track which inheritable properties have been defined by closer rules
		// Start with properties from the element itself (highest priority)
		const overriddenProps = new Set<string>();

		// Add properties from element's inline styles (highest priority)
		if (elementInlineStyles) {
			for (const style of elementInlineStyles) {
				if (this.isInheritableProperty(style.name)) {
					overriddenProps.add(style.name);
				}
			}
		}

		// Add properties from element's matched rules (that are not already overridden)
		if (elementMatchedRules) {
			// Iterate in reverse (highest specificity first)
			for (let i = elementMatchedRules.length - 1; i >= 0; i--) {
				const rule = elementMatchedRules[i];
				for (const prop of rule.properties) {
					if (this.isInheritableProperty(prop.name) && !prop.isOverridden) {
						overriddenProps.add(prop.name);
					}
				}
			}
		}

		// Each entry in 'inherited' represents one parent element up the DOM tree
		// Index 0 = direct parent, 1 = grandparent, etc.
		for (let i = 0; i < inherited.length; i++) {
			const inheritedEntry = inherited[i];

			// Process inherited CSS rules from this parent
			const inheritedRulesWithSelectors = (inheritedEntry.matchedCSSRules || []).map(r => ({
				rule: r.rule,
				matchingSelectors: [] as number[]
			}));

			const { rules } = await this.processMatchedRules(
				browserViewId,
				inheritedRulesWithSelectors,
				includeUserAgent,
				htmlFile
			);

			// Filter to rules that have AT LEAST ONE inheritable property
			// But keep ALL properties in those rules (show non-inheritable as greyed)
			const rulesWithInheritableProps = rules
				.filter(rule => rule.properties.some(p => this.isInheritableProperty(p.name)))
				.map(rule => ({
					...rule,
					// Keep all properties, but correctly mark their status
					properties: rule.properties.map(p => {
						const isInheritable = this.isInheritableProperty(p.name);
						const isOverriddenByCloser = overriddenProps.has(p.name);

						// Track this property for marking farther ancestors as overridden
						// Only track if it's inheritable and not already overridden
						if (isInheritable && !isOverriddenByCloser) {
							overriddenProps.add(p.name);
						}

						return {
							...p,
							// isOverridden = struck through (a closer rule defines this property)
							isOverridden: isInheritable && isOverriddenByCloser,
							// isNotInheritable = greyed out (property doesn't inherit, like background-color)
							isNotInheritable: !isInheritable
						};
					})
				}));

			// Process inline styles from parent (if any)
			let inlineStyle: InlineStyleProperty[] | undefined;
			if (inheritedEntry.inlineStyle?.cssProperties) {
				inlineStyle = inheritedEntry.inlineStyle.cssProperties
					.filter(p => p.name && p.value && !p.disabled && !p.implicit && p.range)
					.map(p => ({ name: p.name, value: p.value }));
				if (inlineStyle.length === 0) {
					inlineStyle = undefined;
				}
			}

			// Only add if there are rules with inheritable properties
			if (rulesWithInheritableProps.length > 0 || inlineStyle) {
				// Get element description from selector
				// Try to find most specific selector (tag.class format)
				let fromElement = `parent ${i + 1}`;
				for (const rule of rulesWithInheritableProps) {
					// Look for selectors that look like element names (body, section.hero, etc.)
					const selector = rule.selector;
					if (selector.match(/^[a-z]+(\.[a-zA-Z][\w-]*)?$/)) {
						// Simple element or element.class selector
						fromElement = selector;
						break;
					} else if (selector.startsWith('.')) {
						// Class selector - use as fallback
						if (fromElement.startsWith('parent')) {
							fromElement = selector;
						}
					}
				}

				inheritedStyles.push({
					fromElement,
					matchedRules: rulesWithInheritableProps,
					inlineStyle
				});
			}
		}

		return inheritedStyles;
	}

	/**
	 * Build the final resolved properties list
	 * Properties are in priority order: inline > matched rules (high to low specificity) > inherited
	 *
	 * This is used for the "All Computed" section.
	 */
	private buildResolvedProperties(
		matchedRules: MatchedCSSRule[],
		inlineStyles: InlineStyleProperty[],
		inheritedStyles: InheritedStyleInfo[]
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

		// 2. Matched CSS rules - iterate in REVERSE (highest specificity = end of array)
		for (let i = matchedRules.length - 1; i >= 0; i--) {
			const rule = matchedRules[i];
			for (const prop of rule.properties) {
				const isOverridden = seenProperties.has(prop.name);

				// Determine source type
				let sourceType: ResolvedCSSProperty['sourceType'] = 'css-file';
				if (rule.origin === 'user-agent') {
					sourceType = 'user-agent';
				} else if (rule.isSourceMapped) {
					const ext = rule.file.toLowerCase();
					if (ext.endsWith('.scss') || ext.endsWith('.sass')) {
						sourceType = 'scss-file';
					} else if (ext.endsWith('.less')) {
						sourceType = 'less-file';
					}
				}

				properties.push({
					name: prop.name,
					value: prop.value,
					sourceType,
					location: prop.location || rule.location,
					selector: rule.selector,
					isOverridden,
					isImportant: prop.isImportant,
					specificity: rule.specificity
				});

				if (!isOverridden) {
					seenProperties.add(prop.name);
				}
			}
		}

		// 3. Inherited styles (lowest priority) - now using matchedRules structure
		// IMPORTANT: Only include INHERITABLE properties here!
		// Non-inheritable properties (like background-color, margin, padding) from
		// parent elements do NOT apply to the child - they should not appear in
		// "All Computed" as active styles.
		for (const inherited of inheritedStyles) {
			for (const rule of inherited.matchedRules) {
				for (const prop of rule.properties) {
					// Skip non-inheritable properties - they don't actually apply to this element
					if (!this.isInheritableProperty(prop.name)) {
						continue;
					}

					const isOverridden = seenProperties.has(prop.name);

					properties.push({
						name: prop.name,
						value: prop.value,
						sourceType: 'inherited',
						location: prop.location || rule.location,
						selector: rule.selector,
						isOverridden,
						isImportant: prop.isImportant
					});

					if (!isOverridden) {
						seenProperties.add(prop.name);
					}
				}
			}

			// Also include inherited inline styles (only inheritable ones)
			if (inherited.inlineStyle) {
				for (const style of inherited.inlineStyle) {
					// Skip non-inheritable properties
					if (!this.isInheritableProperty(style.name)) {
						continue;
					}

					const isOverridden = seenProperties.has(style.name);
					properties.push({
						name: style.name,
						value: style.value,
						sourceType: 'inherited',
						location: style.location,
						isOverridden
					});
					if (!isOverridden) {
						seenProperties.add(style.name);
					}
				}
			}
		}

		return properties;
	}

	/**
	 * Mark properties that are overridden by higher-specificity rules
	 *
	 * CDP returns rules in cascade order where LATER rules have HIGHER specificity.
	 * So we iterate from END to START (highest specificity first).
	 * The first rule we see for a property "wins", later ones are overridden.
	 *
	 * Example order from CDP:
	 * [0] * { padding: 0 }           <- lowest specificity
	 * [1] .btn { padding: 10px }     <- higher specificity (WINS)
	 *
	 * We iterate [1] then [0], so .btn's padding is seen first and wins.
	 */
	private markOverriddenProperties(rules: MatchedCSSRule[]): void {
		const seenProperties = new Set<string>();

		// Iterate in REVERSE order (highest specificity first = end of array)
		for (let i = rules.length - 1; i >= 0; i--) {
			const rule = rules[i];
			for (const prop of rule.properties) {
				if (seenProperties.has(prop.name)) {
					prop.isOverridden = true;
				} else {
					seenProperties.add(prop.name);
				}
			}
		}
	}

	// ============================================
	// Utility Methods
	// ============================================

	/**
	 * Parse data-roopik-source attribute to CSSSourceLocation
	 *
	 * Format: "file:startLine:startCol:endLine:endCol"
	 * Windows paths have colons (C:\), so we parse from the end
	 */
	private parseRoopikSourceAttribute(value: string | undefined): CSSSourceLocation | undefined {
		if (!value) {
			return undefined;
		}

		// Format: file:startLine:startCol:endLine:endCol
		// Windows paths contain colons (C:\), so find last 4 numeric parts
		const parts = value.split(':');
		if (parts.length < 5) {
			return undefined;
		}

		// Last 4 parts are numbers
		const endCol = parseInt(parts[parts.length - 1], 10);
		const endLine = parseInt(parts[parts.length - 2], 10);
		const startCol = parseInt(parts[parts.length - 3], 10);
		const startLine = parseInt(parts[parts.length - 4], 10);

		// Everything before is the file path
		const file = parts.slice(0, -4).join(':');

		if (isNaN(startLine) || isNaN(startCol) || isNaN(endLine) || isNaN(endCol) || !file) {
			return undefined;
		}

		return {
			file,
			line: startLine,
			column: startCol,
			endLine,
			endColumn: endCol
		};
	}

	/**
	 * Check if a CSS property is inheritable
	 * (Simplified list of common inherited properties)
	 */
	private isInheritableProperty(propertyName: string): boolean {
		const inheritableProperties = new Set([
			'color',
			'font',
			'font-family',
			'font-size',
			'font-style',
			'font-weight',
			'font-variant',
			'line-height',
			'letter-spacing',
			'word-spacing',
			'text-align',
			'text-indent',
			'text-transform',
			'white-space',
			'direction',
			'cursor',
			'visibility',
			'quotes',
			'list-style',
			'list-style-type',
			'list-style-position',
			'list-style-image'
		]);

		return inheritableProperties.has(propertyName);
	}

	/**
	 * Resolve a source map path to an absolute file path
	 * Source map paths can be relative or absolute
	 */
	private resolveSourceMapPath(sourceMapPath: string, currentFilePath: string): string {
		// If already absolute, return as-is
		if (this.isAbsoluteFilePath(sourceMapPath)) {
			return sourceMapPath.replace(/\\/g, '/');
		}

		// If it's a simple filename (like "Footer.svelte"), resolve relative to project src
		if (!sourceMapPath.includes('/') && !sourceMapPath.includes('\\')) {
			return path.join(this.projectRoot, 'src', sourceMapPath).replace(/\\/g, '/');
		}

		// Resolve relative path from current file's directory
		const currentDir = path.dirname(currentFilePath);
		return path.resolve(currentDir, sourceMapPath).replace(/\\/g, '/');
	}

	/**
	 * Clear all caches
	 */
	clearCaches(): void {
		this.sourceMapResolver.clearCache();
	}

	/**
	 * Check if a path is an absolute file path (not a URL)
	 * Handles both Windows (C:/...) and Unix (/...) paths
	 */
	private isAbsoluteFilePath(pathOrUrl: string): boolean {
		if (!pathOrUrl) {
			return false;
		}

		// Windows absolute path: C:/ or D:\ etc.
		if (/^[a-zA-Z]:[/\\]/.test(pathOrUrl)) {
			return true;
		}

		// Unix absolute path starting with / (but not // which could be protocol-relative URL)
		if (pathOrUrl.startsWith('/') && !pathOrUrl.startsWith('//')) {
			// Make sure it's not a URL path like /src/file.css (check for common URL patterns)
			if (!pathOrUrl.includes('://') && !pathOrUrl.startsWith('/@')) {
				// Additional check: if it looks like a relative web path, don't treat as absolute
				// Absolute Unix paths typically start with /home, /usr, /var, /tmp, etc.
				const unixAbsoluteIndicators = ['/home/', '/usr/', '/var/', '/tmp/', '/opt/', '/etc/', '/root/', '/Users/'];
				return unixAbsoluteIndicators.some(indicator => pathOrUrl.startsWith(indicator));
			}
		}

		return false;
	}
}
