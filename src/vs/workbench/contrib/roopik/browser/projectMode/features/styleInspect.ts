/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import type { IProjectModeService } from '../../../common/projectMode/ipc.js';
import type { CSSSourceLocation, ElementStyleInfo, GetElementStylesResult } from '../../../common/cssResolvers/types.js';
import { StyleInspectPanel, IStyleInspectPanelCallbacks, DOMTreeNode } from '../components/styleInspectPanel.js';
import { ISourceNavigationService } from '../../../common/navigation/index.js';
import type { InspectMode } from './inspectMode.js';
import type { PendingMove } from './dragDrop/types.js';

/**
 * CDP DOM node structure (from DOM.getDocument response)
 */
interface CDPDOMNode {
	nodeId: number;
	nodeType: number;
	nodeName: string;
	localName: string;
	nodeValue: string;
	childNodeCount?: number;
	children?: CDPDOMNode[];
	attributes?: string[];
}

/**
 * Style Inspect Feature
 *
 * Controller/coordinator that bridges UI Panel, Main Process (CDP/IPC), and Editor.
 *
 * Responsibilities:
 * - Enable/disable inspect mode (delegates to InspectMode)
 * - Fetch element styles via IPC when element is selected
 * - Fetch DOM tree via CDP for Components tab
 * - Highlight elements in browser via CDP (DOM.highlightNode)
 * - Convert CDP data formats to UI-friendly formats
 * - Bidirectional sync: browser selection ↔ tree selection
 *
 * Flow:
 * 1. User enables style inspect mode
 * 2. InspectMode script is injected (unified hover/select behavior)
 * 3. User clicks element in browser
 * 4. Script sends event via CDP bridge (window.__roopikBridge)
 * 5. Editor receives event, calls getElementStyles via IPC
 * 6. Style panel shows element info and CSS sources
 * 7. User can click file links to open in editor
 *
 * Note: The actual script injection is handled by InspectMode class.
 * StyleInspect is focused on panel management, CDP calls, and data coordination.
 */
export class StyleInspect {
	private panel: StyleInspectPanel | null = null;
	private isActive: boolean = false;
	private currentProjectRoot: string | undefined;
	private onVisibilityChangedCallback: ((visible: boolean, panelWidth: number) => void) | undefined;
	private inspectModeRef: InspectMode | null = null;

	// DOM tree state
	private currentBrowserViewId: number | null = null;
	private domTreeCache: DOMTreeNode | null = null;

	// Flag to prevent DOM invalidation during style fetching
	private isFetchingStyles: boolean = false;

	// Flag to control auto-opening of style panel when clicking elements in inspect mode
	// When false, clicking an element will NOT auto-open the panel
	private autoOpenEnabled: boolean = true;

	// Callback for auto-open toggle state changes
	private onAutoOpenToggleCallback: ((enabled: boolean) => void) | undefined;

	// Callback for tree node selection (to highlight in browser)
	private onTreeNodeSelectedCallback: ((nodeId: number) => void) | undefined;

	// Callbacks for pending changes (Changes tab)
	private onUndoMoveCallback: ((moveId: string) => void) | undefined;
	private onUndoAllCallback: (() => void) | undefined;
	private onApplyAllCallback: (() => void) | undefined;

	constructor(
		private readonly browserService: IProjectModeService,
		private readonly notificationService: INotificationService,
		private readonly sourceNavigationService: ISourceNavigationService
	) { }

	/**
	 * Set the InspectMode reference for unified script injection
	 * Must be called before enable()
	 */
	setInspectMode(inspectMode: InspectMode): void {
		this.inspectModeRef = inspectMode;
	}

	/**
	 * Set callback for when panel visibility changes
	 * Used by editor to adjust browser bounds
	 */
	setOnVisibilityChanged(callback: (visible: boolean, panelWidth: number) => void): void {
		this.onVisibilityChangedCallback = callback;
	}

	/**
	 * Set callback for when user clicks a node in the Components tree
	 * Used by editor to highlight the element in browser
	 */
	setOnTreeNodeSelected(callback: (nodeId: number) => void): void {
		this.onTreeNodeSelectedCallback = callback;
	}

	/**
	 * Set callback for when user clicks Undo on a pending move
	 */
	setOnUndoMove(callback: (moveId: string) => void): void {
		this.onUndoMoveCallback = callback;
	}

	/**
	 * Set callback for when user clicks Undo All
	 */
	setOnUndoAll(callback: () => void): void {
		this.onUndoAllCallback = callback;
	}

	/**
	 * Set callback for when user clicks Apply All
	 */
	setOnApplyAll(callback: () => void): void {
		this.onApplyAllCallback = callback;
	}

	/**
	 * Set callback for when auto-open toggle state changes
	 */
	setOnAutoOpenToggle(callback: (enabled: boolean) => void): void {
		this.onAutoOpenToggleCallback = callback;
	}

	/**
	 * Check if auto-open is enabled
	 * When false, clicking elements in inspect mode won't auto-open the panel
	 */
	isAutoOpenEnabled(): boolean {
		return this.autoOpenEnabled;
	}

	/**
	 * Toggle auto-open state
	 * Called when user clicks the toggle button in the panel header
	 */
	toggleAutoOpen(): void {
		this.autoOpenEnabled = !this.autoOpenEnabled;
		// Update panel UI
		this.panel?.setAutoOpenEnabled(this.autoOpenEnabled);
		// Notify callback (for persistence or other uses)
		this.onAutoOpenToggleCallback?.(this.autoOpenEnabled);
	}

	/**
	 * Initialize the style panel in a container
	 */
	initialize(container: HTMLElement): void {
		if (this.panel) {
			return;
		}

		const callbacks: IStyleInspectPanelCallbacks = {
			onOpenFile: (location) => this.openFile(location),
			onEditStyle: (prop, newValue) => this.editStyle(prop, newValue),
			onClose: () => this.onPanelClosed(),
			onVisibilityChanged: (visible, panelWidth) => {
				this.onVisibilityChangedCallback?.(visible, panelWidth);
			},
			onTreeNodeSelected: (nodeId) => {
				this.onTreeNodeSelectedCallback?.(nodeId);
			},
			onTreeNodeHover: (nodeId) => {
				// Highlight on hover, hide on leave (null)
				if (nodeId !== null) {
					this.highlightElementInBrowser(nodeId);
				} else {
					this.hideElementHighlight();
				}
			},
			// Pending changes callbacks
			onUndoMove: (moveId) => {
				this.onUndoMoveCallback?.(moveId);
			},
			onUndoAll: () => {
				this.onUndoAllCallback?.();
			},
			onApplyAll: () => {
				this.onApplyAllCallback?.();
			},
			// Auto-open toggle callback
			onAutoOpenToggle: () => {
				this.toggleAutoOpen();
			}
		};

		this.panel = new StyleInspectPanel(container, callbacks);
		// Initialize panel with current auto-open state
		this.panel.setAutoOpenEnabled(this.autoOpenEnabled);
	}

	/**
	 * Set the current project root (for path resolution)
	 */
	setProjectRoot(projectRoot: string): void {
		this.currentProjectRoot = projectRoot;
	}

	/**
	 * Enable Style Inspect Mode
	 * Uses the unified InspectMode script for element selection
	 */
	async enable(browserViewId: number): Promise<void> {
		if (!browserViewId) {
			return;
		}

		if (!this.inspectModeRef) {
			console.error('[StyleInspect] InspectMode reference not set');
			return;
		}

		this.isActive = true;

		try {
			// Use unified InspectMode script for element selection
			await this.inspectModeRef.enable(browserViewId);

			// Override notification with style-specific message
			this.notificationService.notify({
				severity: Severity.Info,
				message: 'Style Inspect: Click element to view CSS sources. ESC to exit.',
				sticky: false
			});
		} catch (error) {
			console.error('[StyleInspect] Failed to enable:', error);
			this.isActive = false;
		}
	}

	/**
	 * Disable Style Inspect Mode
	 * Cleans up the unified InspectMode script
	 */
	async disable(browserViewId: number): Promise<void> {
		if (!browserViewId) {
			return;
		}

		this.isActive = false;

		try {
			// Use unified InspectMode cleanup
			if (this.inspectModeRef) {
				await this.inspectModeRef.disable(browserViewId);
			}
		} catch {
			// Silent fail
		}
	}

	/**
	 * Check if style inspect is active
	 */
	getIsActive(): boolean {
		return this.isActive;
	}

	/**
	 * Handle element selection from browser
	 * Called when user clicks element in style inspect mode
	 */
	async handleElementSelected(
		browserViewId: number,
		selector: string
	): Promise<void> {
		if (!this.panel) {
			console.warn('[StyleInspect] Panel not initialized');
			return;
		}

		try {
			// Set flag to prevent highlightElementInBrowser from interfering
			this.isFetchingStyles = true;

			// Get element styles via IPC
			// projectRoot is optional - without it, source file paths won't be resolved
			const result: GetElementStylesResult = await this.browserService.getElementStyles({
				browserViewId,
				target: selector,
				projectRoot: this.currentProjectRoot || ''
			});

			if (result.success && result.data) {
				this.showStylePanel(result.data);

				// Sync with Components tree - highlight in UI only (no CDP calls)
				if (this.domTreeCache) {
					const nodeId = this.findNodeIdBySelector(this.domTreeCache, selector);
					if (nodeId) {
						// Just update UI tree highlight - don't query CDP (avoids DOM invalidation)
						this.highlightTreeNode(nodeId);
					}
				}
			} else {
				this.notificationService.notify({
					severity: Severity.Warning,
					message: `Could not get styles: ${result.error || 'Unknown error'}`,
					sticky: false
				});
			}
		} catch (error) {
			console.error('[StyleInspect] Failed to get element styles:', error);
			this.notificationService.notify({
				severity: Severity.Error,
				message: 'Failed to inspect element styles',
				sticky: false
			});
		} finally {
			// Clear flag after style fetch completes
			this.isFetchingStyles = false;
		}
	}


	/**
	 * Find nodeId in cached tree by matching selector
	 * Parses full selector path and walks down the tree to find exact match
	 * Handles :nth-of-type() for disambiguating siblings with same tag
	 */
	private findNodeIdBySelector(tree: DOMTreeNode, selector: string): number | null {
		// Parse selector: "body > div.container > header.header > nav" or "#myId" etc.
		const parts = selector.split(' > ').map(s => s.trim()).filter(s => s.length > 0);

		if (parts.length === 0) {
			return null;
		}

		// Parse all selector parts
		const parsedParts = parts.map(p => this.parseSelectorPart(p));

		// Walk down the tree following the path
		// Start from tree root (should be body)
		let currentNodes: DOMTreeNode[] = [tree];
		let startIndex = 0;

		// If first part matches tree root, skip it
		if (parsedParts.length > 0 && this.nodeMatchesSelector(tree, parsedParts[0], null, 0)) {
			startIndex = 1;
		}

		// Walk through remaining path
		for (let i = startIndex; i < parsedParts.length; i++) {
			const target = parsedParts[i];
			const nextNodes: DOMTreeNode[] = [];

			for (const node of currentNodes) {
				if (node.children) {
					// Group children by tag for nth-of-type matching
					const tagCounts = new Map<string, number>();

					for (const child of node.children) {
						const childTag = child.tagName.toLowerCase();
						const currentCount = tagCounts.get(childTag) || 0;
						tagCounts.set(childTag, currentCount + 1);

						// Pass the nth-of-type index (1-based)
						if (this.nodeMatchesSelector(child, target, node, currentCount + 1)) {
							nextNodes.push(child);
						}
					}
				}
			}

			if (nextNodes.length === 0) {
				// Path broken, try fallback DFS search for last part
				const lastPart = parsedParts[parsedParts.length - 1];
				return this.findMatchingNodeWithNth(tree, lastPart);
			}

			currentNodes = nextNodes;
		}

		// Return first match (most specific)
		return currentNodes.length > 0 ? currentNodes[0].nodeId : null;
	}

	/**
	 * Parse a selector part like "div.container.active" or "#myId" or "div:nth-of-type(2)"
	 */
	private parseSelectorPart(part: string): { tag?: string; id?: string; classes: string[]; nthOfType?: number } {
		const result: { tag?: string; id?: string; classes: string[]; nthOfType?: number } = { classes: [] };

		// Extract :nth-of-type(n) before cleaning
		const nthMatch = part.match(/:nth-of-type\((\d+)\)/);
		if (nthMatch) {
			result.nthOfType = parseInt(nthMatch[1], 10);
		}

		// Remove :nth-of-type(...) and other pseudo-selectors for tag/class parsing
		const cleanPart = part.replace(/:[^.#]+(\([^)]*\))?/g, '');

		// Check for ID selector
		if (cleanPart.startsWith('#')) {
			const idMatch = cleanPart.match(/^#([^.]+)/);
			if (idMatch) {
				result.id = idMatch[1];
			}
			return result;
		}

		// Parse tag and classes
		const tagMatch = cleanPart.match(/^([a-z][a-z0-9]*)/i);
		if (tagMatch) {
			result.tag = tagMatch[1].toLowerCase();
		}

		// Extract classes
		const classMatches = cleanPart.match(/\.([^.#:]+)/g);
		if (classMatches) {
			result.classes = classMatches.map(c => c.slice(1)); // Remove leading dot
		}

		return result;
	}

	/**
	 * Find a matching node in the tree (DFS) with nth-of-type support
	 */
	private findMatchingNodeWithNth(
		node: DOMTreeNode,
		target: { tag?: string; id?: string; classes: string[]; nthOfType?: number }
	): number | null {
		// Search children with proper nth-of-type tracking
		if (node.children) {
			const tagCounts = new Map<string, number>();

			for (const child of node.children) {
				const childTag = child.tagName.toLowerCase();
				const currentCount = tagCounts.get(childTag) || 0;
				tagCounts.set(childTag, currentCount + 1);

				// Check if this child matches
				if (this.nodeMatchesSelector(child, target, node, currentCount + 1)) {
					return child.nodeId;
				}

				// Recurse into children
				const found = this.findMatchingNodeWithNth(child, target);
				if (found) {
					return found;
				}
			}
		}

		return null;
	}

	/**
	 * Check if a node matches the parsed selector
	 * @param node The DOM tree node to check
	 * @param target The parsed selector target
	 * @param parent The parent node (for nth-of-type context)
	 * @param nthIndex The 1-based index of this node among same-tag siblings
	 */
	private nodeMatchesSelector(
		node: DOMTreeNode,
		target: { tag?: string; id?: string; classes: string[]; nthOfType?: number },
		parent: DOMTreeNode | null,
		nthIndex: number
	): boolean {
		// Match by ID (highest priority)
		if (target.id) {
			return node.id === target.id;
		}

		// Match by tag
		if (target.tag && node.tagName.toLowerCase() !== target.tag) {
			return false;
		}

		// Match by classes (all must match)
		if (target.classes.length > 0) {
			const nodeClasses = node.className?.split(/\s+/) || [];
			for (const cls of target.classes) {
				if (!nodeClasses.includes(cls)) {
					return false;
				}
			}
		}

		// Match by nth-of-type if specified
		if (target.nthOfType !== undefined && nthIndex !== target.nthOfType) {
			return false;
		}

		return true;
	}

	/**
	 * Handle element selection by coordinates
	 */
	async handleElementSelectedByPoint(
		browserViewId: number,
		x: number,
		y: number
	): Promise<void> {
		if (!this.panel) {
			console.warn('[StyleInspect] Panel not initialized');
			return;
		}

		try {
			// Get element styles via IPC using coordinates
			// projectRoot is optional - without it, source file paths won't be resolved
			const result: GetElementStylesResult = await this.browserService.getElementStyles({
				browserViewId,
				target: { x, y },
				projectRoot: this.currentProjectRoot || ''
			});

			if (result.success && result.data) {
				this.showStylePanel(result.data);
			} else {
				this.notificationService.notify({
					severity: Severity.Warning,
					message: `Could not get styles: ${result.error || 'Unknown error'}`,
					sticky: false
				});
			}
		} catch (error) {
			console.error('[StyleInspect] Failed to get element styles:', error);
		}
	}

	/**
	 * Show the style panel with element info
	 */
	private showStylePanel(data: ElementStyleInfo): void {
		if (this.panel) {
			// Pass isProjectMode flag - file links only work in project mode
			const isProjectMode = !!this.currentProjectRoot;
			this.panel.show(data, isProjectMode);

			// Also set DOM tree if cached (for Components tab)
			// This ensures tree is available when opening panel via inspect mode
			if (this.domTreeCache) {
				this.panel.setDOMTree(this.domTreeCache);
			}
		}
	}

	/**
	 * Hide the style panel
	 */
	hidePanel(): void {
		if (this.panel) {
			this.panel.hide();
		}
	}

	/**
	 * Show empty panel (for manual toggle)
	 * Displays panel with hint to select an element
	 * Also sets cached DOM tree if available
	 */
	showEmptyPanel(): void {
		if (this.panel) {
			// Show panel with placeholder data
			const isProjectMode = !!this.currentProjectRoot;
			this.panel.show({
				tagName: '',
				id: undefined,
				classes: [],
				properties: [],
				matchedRules: [],
				inlineStyles: [],
				componentName: undefined,
				htmlSource: undefined,
				cssInJs: undefined,
				inheritedStyles: undefined
			}, isProjectMode);

			// If we have a cached DOM tree, set it on the panel
			// This ensures Components tab has data even if opened before page load
			if (this.domTreeCache) {
				this.panel.setDOMTree(this.domTreeCache);
			}
		}
	}

	/**
	 * Check if panel is visible
	 */
	isPanelVisible(): boolean {
		return this.panel?.getIsVisible() ?? false;
	}

	/**
	 * Set pending moves for the Changes tab
	 * Called by editor when DragDrop pending moves change
	 */
	setPendingMoves(moves: PendingMove[]): void {
		if (this.panel) {
			this.panel.setPendingMoves(moves);
		}
	}

	/**
	 * Switch to the Changes tab and show the panel
	 * Called when user clicks the pending changes badge
	 */
	switchToChangesTab(): void {
		if (this.panel) {
			this.panel.switchToChangesTab();
		}
	}

	/**
	 * Open a file at the specified location
	 * Uses the centralized SourceNavigationService for consistent behavior
	 *
	 * For HTML source (data-roopik-source), we pass the full range to highlight
	 * the entire element. This matches the context menu "Open Source" behavior.
	 *
	 * For CSS rules, the location typically comes from CDP which provides accurate
	 * start/end positions for the rule, so we pass those too for consistency.
	 */
	private async openFile(location: CSSSourceLocation): Promise<void> {
		await this.sourceNavigationService.openSourceLocation({
			file: location.file,
			line: location.line,
			column: location.column,
			endLine: location.endLine,
			endColumn: location.endColumn
		});
	}

	/**
	 * Edit a style value (placeholder - would need live CSS editing support)
	 */
	private editStyle(prop: any, newValue: string): void {
		// TODO: Implement live CSS editing
		// This would require:
		// 1. CDP CSS.setStyleTexts to update live
		// 2. File editing to persist changes
		this.notificationService.notify({
			severity: Severity.Info,
			message: 'Live CSS editing coming soon!',
			sticky: false
		});
	}

	/**
	 * Handle panel closed
	 */
	private onPanelClosed(): void {
		// Panel was closed, could disable inspect mode here if needed
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.panel) {
			this.panel.dispose();
			this.panel = null;
		}
		this.inspectModeRef = null;
		this.currentBrowserViewId = null;
		this.domTreeCache = null;
	}

	// ============================================
	// DOM Tree (Components Tab)
	// ============================================

	/**
	 * Fetch DOM tree from browser via CDP
	 * Called when page loads or when Components tab is opened
	 */
	async fetchDOMTree(browserViewId: number): Promise<void> {
		this.currentBrowserViewId = browserViewId;

		try {
			// Enable DOM domain if not already enabled
			await this.browserService.enableCDPDomains(browserViewId, { dom: true });

			// Get the full document tree
			const result = await this.browserService.sendCDPCommand(browserViewId, 'DOM.getDocument', {
				depth: -1, // Get entire tree
				pierce: true // Pierce shadow DOM
			});


			if (result && result.root) {
				// Convert CDP DOM structure to our DOMTreeNode format
				const tree = this.convertCDPNodeToTree(result.root);

				// Always cache the tree (even if panel not open)
				this.domTreeCache = tree;

				// Update panel if it exists
				if (this.panel && tree) {
					this.panel.setDOMTree(tree);
				} else {
				}
			}
		} catch (error) {
			console.error('[StyleInspect] Failed to fetch DOM tree:', error);
		}
	}

	/**
	 * Get cached DOM tree (for panel to use when opened)
	 */
	getDOMTreeCache(): DOMTreeNode | null {
		return this.domTreeCache;
	}

	/**
	 * Refresh the DOM tree (call after page navigation)
	 */
	async refreshDOMTree(): Promise<void> {
		if (this.currentBrowserViewId) {
			await this.fetchDOMTree(this.currentBrowserViewId);
		}
	}

	/**
	 * Highlight a node in the tree (called when user selects element in browser)
	 */
	highlightTreeNode(nodeId: number): void {
		if (this.panel) {
			this.panel.highlightTreeNode(nodeId);
		}
	}

	// Non-visual tags to filter out from Components tree
	private static readonly NON_VISUAL_TAGS = new Set([
		'head', 'script', 'style', 'meta', 'link', 'title', 'base', 'noscript'
	]);

	/**
	 * Convert CDP DOM node to our DOMTreeNode format
	 * Filters out non-element nodes (text, comments) and non-visual tags (script, style, etc.)
	 */
	private convertCDPNodeToTree(cdpNode: CDPDOMNode): DOMTreeNode | null {
		// Only include ELEMENT_NODE (nodeType 1)
		// Skip document, text, comment nodes, etc.
		if (cdpNode.nodeType !== 1) {
			// For document node (nodeType 9), process children to find html/body
			if (cdpNode.nodeType === 9 && cdpNode.children) {
				for (const child of cdpNode.children) {
					const result = this.convertCDPNodeToTree(child);
					if (result) {
						return result;
					}
				}
			}
			return null;
		}

		const tagName = cdpNode.localName || cdpNode.nodeName.toLowerCase();

		// Skip non-visual tags entirely
		if (StyleInspect.NON_VISUAL_TAGS.has(tagName)) {
			return null;
		}

		// For html element, skip directly to body
		if (tagName === 'html' && cdpNode.children) {
			for (const child of cdpNode.children) {
				const childTagName = child.localName || child.nodeName.toLowerCase();
				if (childTagName === 'body') {
					return this.convertCDPNodeToTree(child);
				}
			}
			// If no body found, return null (shouldn't happen in valid HTML)
			console.warn('[StyleInspect] No body found in html element!');
			return null;
		}

		// Extract className and id from attributes array
		// CDP returns attributes as flat array: ['class', 'foo bar', 'id', 'myId', ...]
		let className: string | undefined;
		let id: string | undefined;

		if (cdpNode.attributes) {
			for (let i = 0; i < cdpNode.attributes.length; i += 2) {
				const attrName = cdpNode.attributes[i];
				const attrValue = cdpNode.attributes[i + 1];
				if (attrName === 'class') {
					className = attrValue;
				} else if (attrName === 'id') {
					id = attrValue;
				}
			}
		}

		// Skip our injected inspect mode elements
		if (id && id.startsWith('__roopik_inspect')) {
			return null;
		}

		// Convert children recursively
		const children: DOMTreeNode[] = [];
		if (cdpNode.children) {
			for (const child of cdpNode.children) {
				const childNode = this.convertCDPNodeToTree(child);
				if (childNode) {
					children.push(childNode);
				}
			}
		}

		return {
			nodeId: cdpNode.nodeId,
			tagName,
			className,
			id,
			children
		};
	}

	// Track if Overlay domain is enabled
	private overlayEnabled: boolean = false;

	/**
	 * Highlight element in browser by nodeId via CDP
	 * Called when user clicks a node in the Components tree
	 *
	 * IMPORTANT: The nodeId from our cached tree may not match CDP's current nodeIds
	 * (CDP invalidates nodeIds on each DOM.getDocument call). So we:
	 * 1. Find the node in our cached tree by nodeId
	 * 2. Build a CSS selector from the node
	 * 3. Use CDP DOM.querySelector to get a fresh nodeId
	 * 4. Use that fresh nodeId with Overlay.highlightNode
	 */
	async highlightElementInBrowser(nodeId: number): Promise<void> {
		if (!this.currentBrowserViewId || !this.domTreeCache) {
			return;
		}

		// CRITICAL: Skip highlighting if style fetch is in progress to avoid DOM invalidation
		// The DOM.getDocument call here would invalidate nodeIds used by getElementStyles()
		if (this.isFetchingStyles) {
			return;
		}

		try {
			// Enable Overlay domain if not already enabled (required for highlighting)
			if (!this.overlayEnabled) {
				await this.browserService.sendCDPCommand(this.currentBrowserViewId, 'Overlay.enable', {});
				this.overlayEnabled = true;
			}

			// Find the node in our cached tree and build a selector
			const selector = this.buildSelectorFromNodeId(this.domTreeCache, nodeId);
			if (!selector) {
				console.warn('[StyleInspect] Could not build selector for nodeId:', nodeId);
				return;
			}


			// Get fresh document root
			const docResult = await this.browserService.sendCDPCommand(
				this.currentBrowserViewId,
				'DOM.getDocument',
				{ depth: 0 }
			);

			if (!docResult?.root?.nodeId) {
				console.warn('[StyleInspect] Could not get document root');
				return;
			}

			// Query for the selector to get fresh nodeId
			const queryResult = await this.browserService.sendCDPCommand(
				this.currentBrowserViewId,
				'DOM.querySelector',
				{
					nodeId: docResult.root.nodeId,
					selector
				}
			);

			if (!queryResult?.nodeId) {
				console.warn('[StyleInspect] Could not find element with selector:', selector);
				return;
			}

			// Use the fresh nodeId to highlight
			await this.browserService.sendCDPCommand(this.currentBrowserViewId, 'Overlay.highlightNode', {
				nodeId: queryResult.nodeId,
				highlightConfig: {
					contentColor: { r: 111, g: 168, b: 220, a: 0.66 }, // Blue overlay
					paddingColor: { r: 147, g: 196, b: 125, a: 0.55 }, // Green for padding
					borderColor: { r: 255, g: 229, b: 153, a: 0.66 }, // Yellow for border
					marginColor: { r: 246, g: 178, b: 107, a: 0.66 }  // Orange for margin
				}
			});
		} catch (error) {
			console.error('[StyleInspect] Failed to highlight element:', error);
		}
	}

	/**
	 * Build a CSS selector from a node in our cached tree
	 * Returns a unique selector path like "body > div.container > header#main"
	 * Uses :nth-child() for disambiguation when siblings have same tag
	 */
	private buildSelectorFromNodeId(tree: DOMTreeNode, targetNodeId: number): string | null {
		const path: string[] = [];

		const findAndBuildPath = (node: DOMTreeNode, parent: DOMTreeNode | null): boolean => {
			// Build selector part for this node
			let part = node.tagName.toLowerCase();
			if (node.id) {
				part = `#${node.id}`; // ID is most specific, use alone
			} else if (node.className) {
				// Add first class for specificity
				const firstClass = node.className.split(/\s+/)[0];
				if (firstClass && !firstClass.startsWith('__roopik')) {
					part += `.${firstClass}`;
				}
			}

			// Add :nth-of-type() if there are siblings with same tag (and no unique id/class)
			// NOTE: We use nth-of-type instead of nth-child because:
			// 1. Our cached tree only has ELEMENT nodes (no text/comment nodes)
			// 2. nth-child counts ALL nodes including text/comments
			// 3. nth-of-type only counts elements of same tag type - matches our filtered tree
			if (parent && !node.id) {
				const siblings = parent.children || [];
				const sameTagSiblings = siblings.filter(s => s.tagName.toLowerCase() === node.tagName.toLowerCase());
				if (sameTagSiblings.length > 1) {
					// Find this node's index among same-tag siblings only
					const indexAmongSameTag = sameTagSiblings.findIndex(s => s.nodeId === node.nodeId);
					if (indexAmongSameTag >= 0) {
						part += `:nth-of-type(${indexAmongSameTag + 1})`; // CSS is 1-indexed
					}
				}
			}

			if (node.nodeId === targetNodeId) {
				path.push(part);
				return true;
			}

			if (node.children) {
				for (const child of node.children) {
					if (findAndBuildPath(child, node)) {
						path.push(part);
						return true;
					}
				}
			}

			return false;
		};

		if (findAndBuildPath(tree, null)) {
			// Reverse to get root-to-target order
			return path.reverse().join(' > ');
		}

		return null;
	}

	/**
	 * Hide element highlight in browser
	 */
	async hideElementHighlight(): Promise<void> {
		if (!this.currentBrowserViewId) {
			return;
		}

		try {
			await this.browserService.sendCDPCommand(this.currentBrowserViewId, 'Overlay.hideHighlight', {});
		} catch (error) {
			// Silent fail
		}
	}

	/**
	 * Get nodeId for a CSS selector
	 * Used to sync browser selection with tree
	 */
	async getNodeIdForSelector(selector: string): Promise<number | null> {
		if (!this.currentBrowserViewId) {
			return null;
		}

		try {
			// First get the document root
			const docResult = await this.browserService.sendCDPCommand(
				this.currentBrowserViewId,
				'DOM.getDocument',
				{ depth: 0 }
			);

			if (!docResult?.root?.nodeId) {
				return null;
			}

			// Query for the selector
			const queryResult = await this.browserService.sendCDPCommand(
				this.currentBrowserViewId,
				'DOM.querySelector',
				{
					nodeId: docResult.root.nodeId,
					selector
				}
			);

			return queryResult?.nodeId || null;
		} catch (error) {
			console.error('[StyleInspect] Failed to get nodeId for selector:', error);
			return null;
		}
	}
}
