/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type {
	CSSSourceLocation,
	CDPMatchedStylesResponse,
	CDPStyleSheetHeader,
	CDPSourceRange
} from '../../../common/cssResolvers/types.js';

/**
 * Interface for browser service CDP operations
 */
export interface ICDPBrowserService {
	sendCDPCommand(browserViewId: number, method: string, params?: unknown): Promise<unknown>;
	attachDebugger(browserViewId: number, protocolVersion?: string): Promise<void>;
	/**
	 * Register a callback for CDP events
	 * Returns a function to unregister the callback
	 */
	onCDPEvent?(browserViewId: number, callback: (method: string, params: unknown) => void): () => void;
}

/**
 * Stylesheet info cache entry
 */
interface StyleSheetCacheEntry {
	header: CDPStyleSheetHeader;
	text?: string;
}

/**
 * CDP CSS Service
 *
 * Provides deterministic CSS source resolution using Chrome DevTools Protocol.
 * This service wraps CDP CSS domain commands and provides utilities for
 * style inspection.
 *
 * Key CDP methods used:
 * - DOM.enable: Enable DOM domain
 * - CSS.enable: Enable CSS domain (required for style queries)
 * - CSS.getMatchedStylesForNode: Get all styles for an element
 * - CSS.getInlineStylesForNode: Get inline styles
 * - CSS.getStyleSheetText: Get stylesheet content
 * - DOM.querySelector: Find element by selector
 * - DOM.getNodeForLocation: Get node at coordinates
 * - DOM.getDocument: Get document root
 *
 * Important: CSS domain events (styleSheetAdded, styleSheetRemoved) are emitted
 * after CSS.enable and can be used to track stylesheet changes.
 */
export class CDPCssService {
	// Cache stylesheet headers to avoid repeated lookups
	private styleSheetCache = new Map<number, Map<string, StyleSheetCacheEntry>>();

	// Track which browser views have CSS domain enabled
	private cssEnabledViews = new Set<number>();

	// Event listener cleanup functions
	private eventListenerCleanup = new Map<number, () => void>();

	constructor(
		private readonly browserService: ICDPBrowserService
	) { }

	// ============================================
	// Domain Management
	// ============================================

	/**
	 * Ensure CSS and DOM domains are enabled for a browser view
	 * Must be called before any CSS operations
	 */
	async ensureCSSEnabled(browserViewId: number): Promise<void> {
		if (this.cssEnabledViews.has(browserViewId)) {
			return;
		}

		try {
			// Initialize cache for this view BEFORE enabling CSS domain
			this.styleSheetCache.set(browserViewId, new Map());

			// Ensure debugger is attached first (needed for event listener)
			await this.browserService.attachDebugger(browserViewId);

			// Setup event listener for CSS.styleSheetAdded events
			if (this.browserService.onCDPEvent) {
				const cleanup = this.browserService.onCDPEvent(browserViewId, (method, params) => {
					if (method === 'CSS.styleSheetAdded') {
						const header = (params as { header: CDPStyleSheetHeader }).header;
						const cache = this.styleSheetCache.get(browserViewId);
						if (cache && header) {
							cache.set(header.styleSheetId, { header });
						}
					} else if (method === 'CSS.styleSheetRemoved') {
						const styleSheetId = (params as { styleSheetId: string }).styleSheetId;
						const cache = this.styleSheetCache.get(browserViewId);
						if (cache) {
							cache.delete(styleSheetId);
						}
					}
				});
				this.eventListenerCleanup.set(browserViewId, cleanup);
			}

			// Enable DOM domain first (required for CSS queries)
			await this.browserService.sendCDPCommand(browserViewId, 'DOM.enable');

			// Enable CSS domain - this triggers styleSheetAdded events
			await this.browserService.sendCDPCommand(browserViewId, 'CSS.enable');

			// CRITICAL: Wait for CSS domain to be fully initialized
			// CDP needs time to scan stylesheets and register listeners
			// Without this, getMatchedStylesForNode might fail with "No node found"
			await new Promise(resolve => setTimeout(resolve, 100));

			this.cssEnabledViews.add(browserViewId);

			// Also try to fetch all stylesheets as a fallback
			await this.fetchAllStyleSheets(browserViewId);
		} catch (error) {
			console.error('[CDPCssService] Failed to enable CSS domain:', error);
			throw error;
		}
	}

	/**
	 * Fetch and cache all stylesheet headers
	 */
	private async fetchAllStyleSheets(browserViewId: number): Promise<void> {
		try {
			const result = await this.browserService.sendCDPCommand(
				browserViewId,
				'CSS.getAllStyleSheets'
			) as { headers: CDPStyleSheetHeader[] };

			const cache = this.styleSheetCache.get(browserViewId);
			if (cache && result.headers) {
				for (const header of result.headers) {
					cache.set(header.styleSheetId, { header });
				}
			}
		} catch {
			// getAllStyleSheets not supported - stylesheets fetched via events instead
		}
	}

	/**
	 * Reset CSS state for page load/reload
	 * Call this when page starts loading to capture fresh stylesheet events
	 */
	resetForPageLoad(browserViewId: number): void {
		// Clear cache - stylesheets will be re-added via styleSheetAdded events
		this.styleSheetCache.set(browserViewId, new Map());

		// IMPORTANT: Mark as not enabled so ensureCSSEnabled will re-enable CSS domain
		// This ensures we get fresh styleSheetAdded events for the new page
		this.cssEnabledViews.delete(browserViewId);

		// Clean up old event listener - we'll create a new one when CSS is re-enabled
		const cleanupFn = this.eventListenerCleanup.get(browserViewId);
		if (cleanupFn) {
			cleanupFn();
			this.eventListenerCleanup.delete(browserViewId);
		}
	}

	/**
	 * Clean up when browser view is destroyed
	 */
	cleanup(browserViewId: number): void {
		this.cssEnabledViews.delete(browserViewId);
		this.styleSheetCache.delete(browserViewId);

		// Clean up event listener
		const cleanupFn = this.eventListenerCleanup.get(browserViewId);
		if (cleanupFn) {
			cleanupFn();
			this.eventListenerCleanup.delete(browserViewId);
		}
	}

	// ============================================
	// Node Resolution
	// ============================================

	/**
	 * Get document root node ID
	 *
	 * NOTE: We deliberately DO NOT cache the document root!
	 *
	 * Reason: The renderer process (styleInspect.ts) also calls DOM.getDocument
	 * via raw CDP for tree fetching and element highlighting. Each DOM.getDocument
	 * call invalidates ALL previous nodeIds. If we cached here, the renderer's
	 * calls would invalidate our cache, causing "Could not find node with given id" errors.
	 *
	 * By getting a fresh root for each operation, we ensure each operation
	 * has its own valid document context. Performance impact is negligible
	 * since DOM.getDocument({depth:0}) is fast.
	 */
	async getDocumentRoot(browserViewId: number): Promise<number> {
		await this.ensureCSSEnabled(browserViewId);

		// Always get fresh document root (no caching - see note above)
		const result = await this.browserService.sendCDPCommand(
			browserViewId,
			'DOM.getDocument',
			{ depth: 0 }
		) as { root: { nodeId: number } };

		return result.root.nodeId;
	}

	/**
	 * Get node ID for an element by CSS selector
	 */
	async getNodeIdBySelector(
		browserViewId: number,
		selector: string
	): Promise<number | null> {
		try {
			await this.ensureCSSEnabled(browserViewId);

			const rootNodeId = await this.getDocumentRoot(browserViewId);

			const result = await this.browserService.sendCDPCommand(
				browserViewId,
				'DOM.querySelector',
				{
					nodeId: rootNodeId,
					selector
				}
			) as { nodeId: number };

			return result.nodeId || null;
		} catch (error) {
			console.error('[CDPCssService] Failed to get node by selector:', error);
			return null;
		}
	}

	/**
	 * Get node ID for element at viewport coordinates
	 *
	 * Note: DOM.getNodeForLocation returns backendNodeId (always) and nodeId (only if
	 * the node was previously pushed to frontend). We need to resolve backendNodeId
	 * to nodeId using DOM.pushNodeByBackendIdToFrontend.
	 */
	async getNodeIdAtPoint(
		browserViewId: number,
		x: number,
		y: number
	): Promise<number | null> {
		try {
			await this.ensureCSSEnabled(browserViewId);

			const result = await this.browserService.sendCDPCommand(
				browserViewId,
				'DOM.getNodeForLocation',
				{
					x: Math.round(x),
					y: Math.round(y),
					includeUserAgentShadowDOM: false
				}
			) as { nodeId?: number; backendNodeId?: number };

			// If nodeId is already available, use it
			if (result.nodeId) {
				return result.nodeId;
			}

			// Otherwise, resolve backendNodeId to nodeId
			if (result.backendNodeId) {
				const pushResult = await this.browserService.sendCDPCommand(
					browserViewId,
					'DOM.pushNodeByBackendIdToFrontend',
					{ backendNodeId: result.backendNodeId }
				) as { nodeId: number };

				return pushResult.nodeId || null;
			}

			return null;
		} catch (error) {
			console.error('[CDPCssService] Failed to get node at point:', error);
			return null;
		}
	}

	/**
	 * Get outer HTML for a node
	 */
	async getOuterHTML(browserViewId: number, nodeId: number): Promise<string | null> {
		try {
			const result = await this.browserService.sendCDPCommand(
				browserViewId,
				'DOM.getOuterHTML',
				{ nodeId }
			) as { outerHTML: string };

			return result.outerHTML;
		} catch (error) {
			console.error('[CDPCssService] Failed to get outer HTML:', error);
			return null;
		}
	}

	/**
	 * Get attributes for a node
	 */
	async getNodeAttributes(
		browserViewId: number,
		nodeId: number
	): Promise<{ tagName: string; id?: string; className?: string; attributes: Record<string, string> } | null> {
		try {
			const result = await this.browserService.sendCDPCommand(
				browserViewId,
				'DOM.describeNode',
				{ nodeId, depth: 0 }
			) as {
				node: {
					nodeName: string;
					nodeType: number;
					attributes?: string[];
				}
			};

			const node = result.node;
			const attributes: Record<string, string> = {};

			// Attributes come as [name, value, name, value, ...]
			if (node.attributes) {
				for (let i = 0; i < node.attributes.length; i += 2) {
					const name = node.attributes[i];
					const value = node.attributes[i + 1];
					attributes[name] = value;
				}
			}

			return {
				tagName: node.nodeName.toLowerCase(),
				id: attributes['id'],
				className: attributes['class'],
				attributes
			};
		} catch (error) {
			console.error('[CDPCssService] Failed to get node attributes:', error);
			return null;
		}
	}

	// ============================================
	// Style Resolution (Main API)
	// ============================================

	/**
	 * Get all matched styles for a node
	 *
	 * This is the primary method for style inspection.
	 * Returns all CSS rules matching the element, inline styles,
	 * and inherited styles.
	 */
	async getMatchedStyles(
		browserViewId: number,
		nodeId: number
	): Promise<CDPMatchedStylesResponse | null> {
		try {
			await this.ensureCSSEnabled(browserViewId);

			const result = await this.browserService.sendCDPCommand(
				browserViewId,
				'CSS.getMatchedStylesForNode',
				{ nodeId }
			) as CDPMatchedStylesResponse;

			return result;
		} catch (error) {
			console.error('[CDPCssService] Failed to get matched styles:', error, { browserViewId, nodeId });
			return null;
		}
	}

	/**
	 * Get inline styles for a node
	 */
	async getInlineStyles(
		browserViewId: number,
		nodeId: number
	): Promise<{ cssProperties: Array<{ name: string; value: string }> } | null> {
		try {
			await this.ensureCSSEnabled(browserViewId);

			const result = await this.browserService.sendCDPCommand(
				browserViewId,
				'CSS.getInlineStylesForNode',
				{ nodeId }
			) as { inlineStyle?: { cssProperties: Array<{ name: string; value: string }> } };

			return result.inlineStyle || null;
		} catch (error) {
			console.error('[CDPCssService] Failed to get inline styles:', error);
			return null;
		}
	}

	/**
	 * Get computed style for a node
	 */
	async getComputedStyle(
		browserViewId: number,
		nodeId: number
	): Promise<Array<{ name: string; value: string }> | null> {
		try {
			await this.ensureCSSEnabled(browserViewId);

			const result = await this.browserService.sendCDPCommand(
				browserViewId,
				'CSS.getComputedStyleForNode',
				{ nodeId }
			) as { computedStyle: Array<{ name: string; value: string }> };

			return result.computedStyle;
		} catch (error) {
			console.error('[CDPCssService] Failed to get computed style:', error);
			return null;
		}
	}

	// ============================================
	// Stylesheet Resolution
	// ============================================

	/**
	 * Get stylesheet header by ID
	 *
	 * We try multiple approaches:
	 * 1. Check cache (populated by styleSheetAdded events)
	 * 2. For inline styles without sourceURL, fetch text and extract from comments
	 * 3. Try CSS.getAllStyleSheets (not always available)
	 * 4. Build a minimal header from available info
	 *
	 * Important: Vite and similar tools inject CSS as inline <style> tags with
	 * sourceURL comments. CDP reports isInline=true and empty sourceURL, but
	 * the actual source URL is in the CSS text as a comment.
	 */
	async getStyleSheetHeader(
		browserViewId: number,
		styleSheetId: string
	): Promise<CDPStyleSheetHeader | null> {
		const cache = this.styleSheetCache.get(browserViewId);
		const cached = cache?.get(styleSheetId);

		if (cached) {
			// Check if this stylesheet needs sourceURL enhancement
			// Vite injects CSS with sourceMapURL containing original file path
			// Enhancement needed when:
			// 1. isInline=true with no sourceURL (common case)
			// 2. isInline=false but no sourceURL AND has sourceMapURL (Vite HMR case)
			const needsEnhancement = !cached.header.sourceURL && (
				cached.header.isInline || cached.header.sourceMapURL
			);

			if (needsEnhancement) {
				const enhanced = await this.enhanceInlineStyleHeader(browserViewId, cached);
				if (enhanced) {
					return enhanced;
				}
			}
			return cached.header;
		}

		// Not in cache, try to fetch all stylesheets again
		await this.fetchAllStyleSheets(browserViewId);

		const refreshedCache = this.styleSheetCache.get(browserViewId);
		const refreshedCached = refreshedCache?.get(styleSheetId);
		if (refreshedCached) {
			// Also check for enhancement after refresh (same logic as above)
			const needsEnhancement = !refreshedCached.header.sourceURL && (
				refreshedCached.header.isInline || refreshedCached.header.sourceMapURL
			);

			if (needsEnhancement) {
				const enhanced = await this.enhanceInlineStyleHeader(browserViewId, refreshedCached);
				if (enhanced) {
					return enhanced;
				}
			}
			return refreshedCached.header;
		}

		// CSS.getAllStyleSheets not available - try to get info via CSS.getStyleSheetText
		// As a last resort, try to build a minimal header from the text content
		try {
			const textResult = await this.browserService.sendCDPCommand(
				browserViewId,
				'CSS.getStyleSheetText',
				{ styleSheetId }
			) as { text: string };

			if (textResult?.text !== undefined) {
				const extracted = this.extractSourceInfoFromText(textResult.text);

				// Build a header from extracted info
				const minimalHeader: CDPStyleSheetHeader = {
					styleSheetId,
					frameId: '',
					sourceURL: extracted.sourceURL,
					origin: 'regular',
					title: '',
					disabled: false,
					isInline: !extracted.sourceURL, // Has sourceURL = treat as external
					isMutable: true,
					isConstructed: false,
					startLine: 0,
					startColumn: 0,
					length: textResult.text.length,
					endLine: 0,
					endColumn: 0,
					sourceMapURL: extracted.sourceMapURL
				};

				// Cache it
				if (refreshedCache) {
					refreshedCache.set(styleSheetId, { header: minimalHeader, text: textResult.text });
				}

				return minimalHeader;
			}
		} catch {
			// Stylesheet not available
		}

		return null;
	}

	/**
	 * Enhance an inline style header by extracting sourceURL from CSS text or source map
	 * Used for Vite and similar tools that inject CSS with source comments/maps
	 */
	private async enhanceInlineStyleHeader(
		browserViewId: number,
		cached: StyleSheetCacheEntry
	): Promise<CDPStyleSheetHeader | null> {
		try {
			// First, try to extract source from inline source map in header
			// Vite provides sourceMapURL as data:application/json;base64,... with original file
			const sourceFromMap = this.extractSourceFromInlineSourceMap(cached.header.sourceMapURL);

			if (sourceFromMap) {
				// Update the cached header with the extracted source
				cached.header = {
					...cached.header,
					sourceURL: sourceFromMap,
					// Keep isInline false since we now know the source
					isInline: false
				};
				return cached.header;
			}

			// Fallback: Fetch text and look for sourceURL comment
			let text = cached.text;
			if (text === undefined) {
				const textResult = await this.browserService.sendCDPCommand(
					browserViewId,
					'CSS.getStyleSheetText',
					{ styleSheetId: cached.header.styleSheetId }
				) as { text: string };
				text = textResult?.text;
				if (text) {
					cached.text = text;
				}
			}

			if (!text) {
				return null;
			}

			const extracted = this.extractSourceInfoFromText(text);

			// Try sourceURL from comment first
			if (extracted.sourceURL) {
				cached.header = {
					...cached.header,
					sourceURL: extracted.sourceURL,
					sourceMapURL: extracted.sourceMapURL || cached.header.sourceMapURL,
					isInline: false
				};
				return cached.header;
			}

			// Try extracting from sourceMappingURL comment
			if (extracted.sourceMapURL) {
				const sourceFromTextMap = this.extractSourceFromInlineSourceMap(extracted.sourceMapURL);
				if (sourceFromTextMap) {
					cached.header = {
						...cached.header,
						sourceURL: sourceFromTextMap,
						sourceMapURL: extracted.sourceMapURL,
						isInline: false
					};
					return cached.header;
				}
			}
		} catch {
			// Failed to enhance, will return original header
		}

		return null;
	}

	/**
	 * Extract sourceURL and sourceMappingURL from CSS text comments
	 */
	private extractSourceInfoFromText(text: string): { sourceURL: string; sourceMapURL?: string } {
		// Match /*# sourceURL=... */ comment (Vite, Webpack, etc.)
		const sourceUrlMatch = text.match(/\/\*#\s*sourceURL=(.+?)\s*\*\//);
		// Match /*# sourceMappingURL=... */ comment
		const sourceMappingMatch = text.match(/\/\*#\s*sourceMappingURL=(.+?)\s*\*\//);

		return {
			sourceURL: sourceUrlMatch ? sourceUrlMatch[1] : '',
			sourceMapURL: sourceMappingMatch ? sourceMappingMatch[1] : undefined
		};
	}

	/**
	 * Extract original source file path from a base64-encoded inline source map
	 * Vite embeds source maps as data:application/json;base64,... URLs
	 */
	private extractSourceFromInlineSourceMap(sourceMapURL: string | undefined): string | null {
		if (!sourceMapURL) {
			return null;
		}

		// Check if it's a base64-encoded inline source map
		const base64Match = sourceMapURL.match(/^data:application\/json;base64,(.+)$/);
		if (!base64Match) {
			return null;
		}

		try {
			// Decode the base64 source map
			const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
			const sourceMap = JSON.parse(decoded) as { sources?: string[]; file?: string };

			// Get the first source file (usually the original CSS file)
			if (sourceMap.sources && sourceMap.sources.length > 0) {
				const source = sourceMap.sources[0];
				// Source might be absolute path or relative
				// Return as-is, URL converter will handle it
				return source;
			}

			// Fallback to file property
			if (sourceMap.file) {
				return sourceMap.file;
			}
		} catch {
			// Failed to parse source map
		}

		return null;
	}

	/**
	 * Resolve a position using an inline source map
	 * For Vite-injected styles from Vue/Svelte SFCs, the sourceMapURL contains
	 * the full source map with line mappings
	 *
	 * @param sourceMapURL - data:application/json;base64,... URL
	 * @param line - Line in compiled CSS (1-indexed)
	 * @param column - Column in compiled CSS (0-indexed)
	 * @returns Original position or null
	 */
	resolvePositionFromInlineSourceMap(
		sourceMapURL: string | undefined,
		line: number,
		column: number
	): { file: string; line: number; column: number } | null {
		if (!sourceMapURL) {
			return null;
		}

		const base64Match = sourceMapURL.match(/^data:application\/json;base64,(.+)$/);
		if (!base64Match) {
			return null;
		}

		try {
			const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
			const sourceMap = JSON.parse(decoded) as {
				sources?: string[];
				mappings?: string;
				names?: string[];
			};

			if (!sourceMap.sources || sourceMap.sources.length === 0 || !sourceMap.mappings) {
				return null;
			}

			// Decode VLQ mappings to find original position
			// The mappings string is semicolon-separated (lines) and comma-separated (segments)
			const originalPosition = this.decodeSourceMapPosition(
				sourceMap.mappings,
				sourceMap.sources,
				line,
				column
			);

			return originalPosition;
		} catch (error) {
			console.error('[CDPCssService] Failed to resolve from inline source map:', error);
			return null;
		}
	}

	/**
	 * Decode source map VLQ mappings to find original position
	 * Source maps use Base64 VLQ encoding for compact representation
	 *
	 * Each segment has: [genCol, sourceIdx, origLine, origCol, nameIdx?]
	 */
	private decodeSourceMapPosition(
		mappings: string,
		sources: string[],
		targetLine: number,
		targetColumn: number
	): { file: string; line: number; column: number } | null {
		// VLQ decoding characters
		const VLQ_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

		const decodeVLQ = (encoded: string): number[] => {
			const values: number[] = [];
			let value = 0;
			let shift = 0;

			for (const char of encoded) {
				const digit = VLQ_BASE64.indexOf(char);
				if (digit === -1) continue;

				const hasContinuation = digit & 32;
				value += (digit & 31) << shift;

				if (hasContinuation) {
					shift += 5;
				} else {
					// Convert from unsigned to signed
					const negate = value & 1;
					value = value >> 1;
					values.push(negate ? -value : value);
					value = 0;
					shift = 0;
				}
			}

			return values;
		};

		// Split by lines (semicolons)
		const lines = mappings.split(';');

		// State for decoding (values are relative to previous)
		let sourceIndex = 0;
		let originalLine = 0;
		let originalColumn = 0;

		// Iterate through lines to find our target
		for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
			const lineNumber = lineIndex + 1; // 1-indexed
			const lineMappings = lines[lineIndex];

			if (!lineMappings) continue;

			// Split by segments (commas)
			const segments = lineMappings.split(',');
			let generatedColumn = 0;

			for (const segment of segments) {
				if (!segment) continue;

				const values = decodeVLQ(segment);
				if (values.length === 0) continue;

				// Update generated column (always present)
				generatedColumn += values[0];

				// If we have source info (at least 4 values)
				if (values.length >= 4) {
					sourceIndex += values[1];
					originalLine += values[2];
					originalColumn += values[3];
				}

				// Check if this is the line we're looking for
				// Use >= for column to find the closest mapping
				if (lineNumber === targetLine && generatedColumn <= targetColumn) {
					// Found a mapping for our target position
					if (sourceIndex >= 0 && sourceIndex < sources.length) {
						return {
							file: sources[sourceIndex],
							line: originalLine + 1, // Convert to 1-indexed
							column: originalColumn
						};
					}
				}
			}

			// If we've passed the target line, return the last mapping we found on that line
			if (lineNumber === targetLine && sourceIndex >= 0 && sourceIndex < sources.length) {
				return {
					file: sources[sourceIndex],
					line: originalLine + 1,
					column: originalColumn
				};
			}
		}

		// If no exact match found but we have some mapping, return the last one
		if (sourceIndex >= 0 && sourceIndex < sources.length && originalLine >= 0) {
			return {
				file: sources[sourceIndex],
				line: originalLine + 1,
				column: originalColumn
			};
		}

		return null;
	}

	/**
	 * Get stylesheet text content
	 */
	async getStyleSheetText(
		browserViewId: number,
		styleSheetId: string
	): Promise<string | null> {
		const cache = this.styleSheetCache.get(browserViewId);
		const cached = cache?.get(styleSheetId);

		if (cached?.text !== undefined) {
			return cached.text;
		}

		try {
			const result = await this.browserService.sendCDPCommand(
				browserViewId,
				'CSS.getStyleSheetText',
				{ styleSheetId }
			) as { text: string };

			// Cache the text
			if (cache && cached) {
				cached.text = result.text;
			}

			return result.text;
		} catch (error) {
			console.error('[CDPCssService] Failed to get stylesheet text:', error);
			return null;
		}
	}

	/**
	 * Get source URL for a stylesheet
	 * Handles inline styles (no URL) and source-mapped files
	 */
	async getStyleSheetSourceURL(
		browserViewId: number,
		styleSheetId: string
	): Promise<{ sourceURL: string; sourceMapURL?: string; isInline: boolean } | null> {
		const header = await this.getStyleSheetHeader(browserViewId, styleSheetId);
		if (!header) {
			return null;
		}

		return {
			sourceURL: header.sourceURL || '',
			sourceMapURL: header.sourceMapURL,
			isInline: header.isInline
		};
	}

	// ============================================
	// Utility Methods
	// ============================================

	/**
	 * Convert CDP source range to our CSSSourceLocation format
	 *
	 * CDP uses 0-indexed lines, we use 1-indexed.
	 */
	convertRange(range: CDPSourceRange | undefined, file: string): CSSSourceLocation | undefined {
		if (!range) {
			return undefined;
		}

		return {
			file,
			line: range.startLine + 1,  // Convert to 1-indexed
			column: range.startColumn,
			endLine: range.endLine + 1,
			endColumn: range.endColumn
		};
	}

	/**
	 * Parse specificity from a selector
	 * Returns in format "a,b,c" where:
	 * - a = ID selectors
	 * - b = class, attribute, pseudo-class selectors
	 * - c = element, pseudo-element selectors
	 */
	calculateSpecificity(selector: string): string {
		// Simple specificity calculation
		// For accurate calculation, use a proper CSS parser
		const ids = (selector.match(/#[^\s+>~.[:]+/g) || []).length;
		const classes = (selector.match(/\.[^\s+>~.[:]+/g) || []).length;
		const attrs = (selector.match(/\[[^\]]+\]/g) || []).length;
		const pseudoClasses = (selector.match(/:[^\s+>~.[:]+(?!\()/g) || []).length;
		const elements = (selector.match(/^[a-z]+|[\s+>~][a-z]+/gi) || []).length;
		const pseudoElements = (selector.match(/::[^\s+>~.[:]+/g) || []).length;

		return `${ids},${classes + attrs + pseudoClasses},${elements + pseudoElements}`;
	}

	/**
	 * Compare specificities
	 * Returns negative if a < b, positive if a > b, 0 if equal
	 */
	compareSpecificity(a: string, b: string): number {
		const partsA = a.split(',').map(Number);
		const partsB = b.split(',').map(Number);

		for (let i = 0; i < 3; i++) {
			if (partsA[i] !== partsB[i]) {
				return partsA[i] - partsB[i];
			}
		}

		return 0;
	}
}
