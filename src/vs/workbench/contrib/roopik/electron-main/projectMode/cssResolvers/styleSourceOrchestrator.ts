/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

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
				includeUserAgent
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
			const inheritedStyles = await this.processInheritedStyles(
				browserViewId,
				matchedStyles.inherited || [],
				includeUserAgent
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
	 */
	private async processMatchedRules(
		browserViewId: number,
		cdpRules: CDPMatchedStylesResponse['matchedCSSRules'],
		includeUserAgent: boolean
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

			// Get stylesheet info (URL, source map URL)
			const sheetInfo = await this.cdpService.getStyleSheetSourceURL(
				browserViewId,
				rule.styleSheetId
			);

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
				// Check for CSS-in-JS (no URL or blob URL)
				if (this.cssInJsDetector.isGeneratedStyleSheet(sheetInfo.sourceURL, sheetInfo.isInline)) {
					// CSS-in-JS: skip for now, will be handled at element level
					continue;
				}

				// Convert URL to local path
				filePath = this.urlToPathConverter.convert(sheetInfo.sourceURL);

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

			if (!filePath) {
				continue;
			}

			// Get location from rule style range
			let location = this.cdpService.convertRange(rule.style.range, filePath);

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

			// Process properties
			const properties = await this.processRuleProperties(
				rule.style.cssProperties,
				filePath,
				isSourceMapped ? originalFile : undefined
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
	 */
	private async processRuleProperties(
		cssProperties: CDPCSSProperty[],
		filePath: string,
		originalFile?: string
	): Promise<MatchedCSSProperty[]> {
		const properties: MatchedCSSProperty[] = [];

		for (const prop of cssProperties) {
			// Skip if no name (shouldn't happen but be safe)
			if (!prop.name) {
				continue;
			}

			// Skip internal/disabled properties
			if (prop.disabled || prop.implicit) {
				continue;
			}

			// Skip vendor prefixes (optional, keep for now)
			// if (prop.name.startsWith('-webkit-') || prop.name.startsWith('-moz-')) {
			//   continue;
			// }

			let location = this.cdpService.convertRange(prop.range, filePath);

			// Try source map resolution for property location
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
	 */
	private async processInheritedStyles(
		browserViewId: number,
		inherited: NonNullable<CDPMatchedStylesResponse['inherited']>,
		includeUserAgent: boolean
	): Promise<InheritedStyleInfo[]> {
		const inheritedStyles: InheritedStyleInfo[] = [];

		for (const inheritedEntry of inherited) {
			// Process inherited rules
			// Note: inherited rules don't have matchingSelectors, so we provide empty array
			// (all selectors match since they're inherited from parent)
			const inheritedRulesWithSelectors = (inheritedEntry.matchedCSSRules || []).map(r => ({
				rule: r.rule,
				matchingSelectors: [] as number[]
			}));
			const { rules } = await this.processMatchedRules(
				browserViewId,
				inheritedRulesWithSelectors,
				includeUserAgent
			);

			// Only include if there are matching rules
			if (rules.length > 0) {
				// Extract properties from all rules
				const properties: ResolvedCSSProperty[] = [];
				for (const rule of rules) {
					for (const prop of rule.properties) {
						// Only include inheritable properties
						if (this.isInheritableProperty(prop.name)) {
							properties.push({
								name: prop.name,
								value: prop.value,
								sourceType: 'inherited',
								location: prop.location,
								selector: rule.selector,
								isOverridden: false
							});
						}
					}
				}

				if (properties.length > 0) {
					inheritedStyles.push({
						fromElement: 'parent', // Simplified - could enhance with parent tag
						fromSelector: rules[0]?.selector,
						properties
					});
				}
			}
		}

		return inheritedStyles;
	}

	/**
	 * Build the final resolved properties list
	 * Properties are in priority order: inline > matched rules > inherited
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

		// 2. Matched CSS rules (in specificity order - rules array is already ordered)
		for (const rule of matchedRules) {
			for (const prop of rule.properties) {
				const isOverridden = seenProperties.has(prop.name);

				// Determine source type
				let sourceType: ResolvedCSSProperty['sourceType'] = 'css-file';
				if (rule.origin === 'user-agent') {
					sourceType = 'user-agent';
				} else if (rule.isSourceMapped) {
					// Could be scss-file or less-file based on extension
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

		// 3. Inherited styles (lowest priority)
		for (const inherited of inheritedStyles) {
			for (const prop of inherited.properties) {
				const isOverridden = seenProperties.has(prop.name);

				properties.push({
					...prop,
					isOverridden
				});

				if (!isOverridden) {
					seenProperties.add(prop.name);
				}
			}
		}

		return properties;
	}

	/**
	 * Mark properties that are overridden by higher-specificity rules
	 * Note: Rules in the array are in cascade order (higher specificity first)
	 */
	private markOverriddenProperties(rules: MatchedCSSRule[]): void {
		const seenProperties = new Set<string>();

		// Iterate in order (highest specificity first)
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
	 * Clear all caches
	 */
	clearCaches(): void {
		this.sourceMapResolver.clearCache();
	}
}
