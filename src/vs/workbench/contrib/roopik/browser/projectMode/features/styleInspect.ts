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

	// Callback for tree node selection (to highlight in browser)
	private onTreeNodeSelectedCallback: ((nodeId: number) => void) | undefined;

	constructor(
		private readonly browserService: IProjectModeService,
		private readonly notificationService: INotificationService,
		private readonly sourceNavigationService: ISourceNavigationService
	) {}

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
			}
		};

		this.panel = new StyleInspectPanel(container, callbacks);
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
			// Get element styles via IPC
			// projectRoot is optional - without it, source file paths won't be resolved
			const result: GetElementStylesResult = await this.browserService.getElementStyles({
				browserViewId,
				target: selector,
				projectRoot: this.currentProjectRoot || ''
			});

			if (result.success && result.data) {
				this.showStylePanel(result.data);

				// Sync with Components tree - highlight the selected element
				this.syncTreeWithSelectedElement(selector);
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
		}
	}

	/**
	 * Sync tree selection with browser element selection
	 * When user selects element in browser, highlight it in Components tree
	 */
	private async syncTreeWithSelectedElement(selector: string): Promise<void> {
		try {
			const nodeId = await this.getNodeIdForSelector(selector);
			if (nodeId) {
				this.highlightTreeNode(nodeId);
			}
		} catch (error) {
			// Silent fail - tree sync is optional
			console.debug('[StyleInspect] Failed to sync tree:', error);
		}
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
		console.log('[StyleInspect] Edit style:', prop.name, '=', newValue);
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
		console.log('[StyleInspect] fetchDOMTree called, browserViewId:', browserViewId);

		try {
			// Enable DOM domain if not already enabled
			await this.browserService.enableCDPDomains(browserViewId, { dom: true });

			// Get the full document tree
			const result = await this.browserService.sendCDPCommand(browserViewId, 'DOM.getDocument', {
				depth: -1, // Get entire tree
				pierce: true // Pierce shadow DOM
			});

			console.log('[StyleInspect] DOM.getDocument result:', result ? 'got result' : 'no result', 'root:', result?.root ? 'yes' : 'no');

			if (result && result.root) {
				// Convert CDP DOM structure to our DOMTreeNode format
				const tree = this.convertCDPNodeToTree(result.root);
				console.log('[StyleInspect] Converted tree:', tree ? `tagName=${tree.tagName}, children=${tree.children?.length}` : 'NULL');

				// Always cache the tree (even if panel not open)
				this.domTreeCache = tree;

				// Update panel if it exists
				if (this.panel && tree) {
					console.log('[StyleInspect] Setting tree on panel');
					this.panel.setDOMTree(tree);
				} else {
					console.log('[StyleInspect] Panel:', !!this.panel, 'tree:', !!tree);
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
				console.log('[StyleInspect] Processing document node, children:', cdpNode.children.length);
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
			console.log('[StyleInspect] Found html element, looking for body in', cdpNode.children.length, 'children');
			for (const child of cdpNode.children) {
				const childTagName = child.localName || child.nodeName.toLowerCase();
				console.log('[StyleInspect] html child:', childTagName);
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
	 */
	async highlightElementInBrowser(nodeId: number): Promise<void> {
		if (!this.currentBrowserViewId) {
			return;
		}

		try {
			// Enable Overlay domain if not already enabled (required for highlighting)
			if (!this.overlayEnabled) {
				await this.browserService.sendCDPCommand(this.currentBrowserViewId, 'Overlay.enable', {});
				this.overlayEnabled = true;
			}

			// Use CDP Overlay.highlightNode to highlight the element
			await this.browserService.sendCDPCommand(this.currentBrowserViewId, 'Overlay.highlightNode', {
				nodeId,
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
