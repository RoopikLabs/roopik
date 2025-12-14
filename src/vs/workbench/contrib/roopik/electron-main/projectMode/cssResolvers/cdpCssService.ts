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
			// This ensures we catch all styleSheetAdded events
			this.styleSheetCache.set(browserViewId, new Map());

			// Ensure debugger is attached first (needed for event listener)
			await this.browserService.attachDebugger(browserViewId);
			console.log('[CDPCssService] Debugger attached for browserViewId:', browserViewId);

			// Setup event listener for CSS.styleSheetAdded events
			// This is the reliable way to get stylesheet headers
			if (this.browserService.onCDPEvent) {
				console.log('[CDPCssService] Setting up CDP event listener for browserViewId:', browserViewId);
				const cleanup = this.browserService.onCDPEvent(browserViewId, (method, params) => {
					// Log ALL CDP events to debug
					if (method.startsWith('CSS.')) {
						console.log('[CDPCssService] CDP CSS event:', method, JSON.stringify(params).slice(0, 200));
					}

					if (method === 'CSS.styleSheetAdded') {
						const header = (params as { header: CDPStyleSheetHeader }).header;
						const cache = this.styleSheetCache.get(browserViewId);
						if (cache && header) {
							console.log('[CDPCssService] styleSheetAdded event:', header.styleSheetId, 'sourceURL:', header.sourceURL, 'isInline:', header.isInline);
							cache.set(header.styleSheetId, { header });
						}
					} else if (method === 'CSS.styleSheetRemoved') {
						const styleSheetId = (params as { styleSheetId: string }).styleSheetId;
						const cache = this.styleSheetCache.get(browserViewId);
						if (cache) {
							console.log('[CDPCssService] styleSheetRemoved event:', styleSheetId);
							cache.delete(styleSheetId);
						}
					}
				});
				this.eventListenerCleanup.set(browserViewId, cleanup);
			} else {
				console.warn('[CDPCssService] browserService.onCDPEvent not available!');
			}

			// Enable DOM domain first (required for CSS queries)
			console.log('[CDPCssService] Enabling DOM domain...');
			await this.browserService.sendCDPCommand(browserViewId, 'DOM.enable');
			console.log('[CDPCssService] DOM domain enabled');

			// Enable CSS domain - this will trigger styleSheetAdded events
			console.log('[CDPCssService] Enabling CSS domain (styleSheetAdded events should fire now)...');
			await this.browserService.sendCDPCommand(browserViewId, 'CSS.enable');
			console.log('[CDPCssService] CSS domain enabled');

			// Check cache after CSS.enable - events should have populated it
			const cacheAfterEnable = this.styleSheetCache.get(browserViewId);
			console.log('[CDPCssService] Cache after CSS.enable:', cacheAfterEnable?.size ?? 0, 'stylesheets');

			this.cssEnabledViews.add(browserViewId);

			// Also try to fetch all stylesheets as a fallback
			await this.fetchAllStyleSheets(browserViewId);

			// Final cache check
			const finalCache = this.styleSheetCache.get(browserViewId);
			console.log('[CDPCssService] Final cache size:', finalCache?.size ?? 0, 'stylesheets');
			if (finalCache && finalCache.size > 0) {
				for (const [id, entry] of finalCache) {
					console.log('[CDPCssService] Cached stylesheet:', id, 'sourceURL:', entry.header.sourceURL);
				}
			}
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

			console.log('[CDPCssService] fetchAllStyleSheets got', result.headers?.length ?? 0, 'stylesheets');

			const cache = this.styleSheetCache.get(browserViewId);
			if (cache && result.headers) {
				for (const header of result.headers) {
					console.log('[CDPCssService] Caching stylesheet:', header.styleSheetId, 'sourceURL:', header.sourceURL, 'isInline:', header.isInline);
					cache.set(header.styleSheetId, { header });
				}
			}
		} catch (error) {
			console.log('[CDPCssService] getAllStyleSheets not supported, will fetch on demand:', error);
			// Some older CDP versions don't support getAllStyleSheets
			// Stylesheets will be fetched on demand
		}
	}

	/**
	 * Reset CSS state for page load/reload
	 * Call this when page starts loading to capture fresh stylesheet events
	 */
	resetForPageLoad(browserViewId: number): void {
		console.log('[CDPCssService] Resetting CSS state for page load, browserViewId:', browserViewId);

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
	 */
	async getDocumentRoot(browserViewId: number): Promise<number> {
		await this.ensureCSSEnabled(browserViewId);

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
			console.error('[CDPCssService] Failed to get matched styles:', error);
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
	 * 2. Try CSS.getAllStyleSheets (not always available)
	 * 3. Try CSS.getStyleSheetText to at least get the content
	 * 4. Build a minimal header from available info
	 */
	async getStyleSheetHeader(
		browserViewId: number,
		styleSheetId: string
	): Promise<CDPStyleSheetHeader | null> {
		const cache = this.styleSheetCache.get(browserViewId);
		const cached = cache?.get(styleSheetId);

		if (cached) {
			return cached.header;
		}

		// Not in cache, try to fetch all stylesheets again
		await this.fetchAllStyleSheets(browserViewId);

		const refreshedCache = this.styleSheetCache.get(browserViewId);
		const refreshedCached = refreshedCache?.get(styleSheetId);
		if (refreshedCached) {
			return refreshedCached.header;
		}

		// CSS.getAllStyleSheets not available - try to get info via CSS.getStyleSheetText
		// The response includes styleSheetId but not the URL, so this is limited
		// However, we can build a partial header
		console.log('[CDPCssService] Stylesheet not in cache, trying direct fetch for:', styleSheetId);

		// As a last resort, try to get stylesheet metadata via inspector protocol
		// Some versions support CSS.getStyleSheetInfo or we can parse from styleSheetId format
		try {
			// Attempt to get the stylesheet text - if it succeeds, the stylesheet exists
			const textResult = await this.browserService.sendCDPCommand(
				browserViewId,
				'CSS.getStyleSheetText',
				{ styleSheetId }
			) as { text: string };

			if (textResult?.text !== undefined) {
				// We have the text but not the URL
				// Try to extract URL from CSS content (some stylesheets have source comments)
				const sourceUrlMatch = textResult.text.match(/\/\*#\s*sourceURL=(.+?)\s*\*\//);
				const sourceMappingMatch = textResult.text.match(/\/\*#\s*sourceMappingURL=(.+?)\s*\*\//);

				// Build a minimal header - mark as inline since we don't know the source
				const minimalHeader: CDPStyleSheetHeader = {
					styleSheetId,
					frameId: '',
					sourceURL: sourceUrlMatch ? sourceUrlMatch[1] : '',
					origin: 'regular',
					title: '',
					disabled: false,
					isInline: !sourceUrlMatch, // If no sourceURL found, treat as inline
					isMutable: true,
					isConstructed: false,
					startLine: 0,
					startColumn: 0,
					length: textResult.text.length,
					endLine: 0,
					endColumn: 0,
					sourceMapURL: sourceMappingMatch ? sourceMappingMatch[1] : undefined
				};

				// Cache it
				if (refreshedCache) {
					refreshedCache.set(styleSheetId, { header: minimalHeader, text: textResult.text });
				}

				console.log('[CDPCssService] Built minimal header for', styleSheetId, 'sourceURL:', minimalHeader.sourceURL);
				return minimalHeader;
			}
		} catch (error) {
			console.log('[CDPCssService] Failed to get stylesheet text for', styleSheetId, ':', error);
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
		console.log('[CDPCssService] getStyleSheetSourceURL for', styleSheetId, '-> header:', header ? JSON.stringify({
			sourceURL: header.sourceURL,
			sourceMapURL: header.sourceMapURL,
			isInline: header.isInline,
			origin: header.origin,
			title: header.title
		}) : 'null');
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
