/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import type {
	ElementStyleInfo,
	ResolvedCSSProperty,
	MatchedCSSRule,
	CSSSourceLocation,
	CSSSourceType
} from '../../../common/cssResolvers/types.js';
import type { PendingMove } from '../features/dragDrop/types.js';

/**
 * DOM tree node for Components tab
 */
export interface DOMTreeNode {
	nodeId: number;
	tagName: string;
	className?: string;
	id?: string;
	children: DOMTreeNode[];
	isExpanded?: boolean;
}

/**
 * Callbacks for style inspect panel actions
 */
export interface IStyleInspectPanelCallbacks {
	/** Called when user clicks a source location link */
	onOpenFile: (location: CSSSourceLocation) => void;
	/** Called when user edits a style value inline */
	onEditStyle?: (property: ResolvedCSSProperty, newValue: string) => void;
	/** Called when panel is closed */
	onClose?: () => void;
	/** Called when panel visibility changes - used to adjust browser bounds */
	onVisibilityChanged?: (visible: boolean, panelWidth: number) => void;
	/** Called when user clicks a node in the Components tree */
	onTreeNodeSelected?: (nodeId: number) => void;
	/** Called when user hovers a node in the Components tree */
	onTreeNodeHover?: (nodeId: number | null) => void;
	/** Called when user clicks Undo on a pending move */
	onUndoMove?: (moveId: string) => void;
	/** Called when user clicks Undo All */
	onUndoAll?: () => void;
	/** Called when user clicks Apply All */
	onApplyAll?: () => void;
	/**
	 * Called when user changes a style value in the Design tab for live preview.
	 * This triggers immediate visual update in the browser (temporary, not saved).
	 */
	onLiveStyleChange?: (cssProperty: string, value: string) => void;
}

/**
 * Tab identifiers (Components is now always visible at top, not a tab)
 */
type TabId = 'css' | 'design' | 'changes';

/**
 * Style Inspect Panel (Split View)
 *
 * Layout: Components (collapsible, top) + Draggable Separator + Tabs (bottom)
 * - Components: DOM tree from CDP, always visible at top, collapsible
 * - CSS: Current styles panel (Element, Inline, Rules, Inherited)
 * - Design: Figma-like Position/Layout/Dimensions editors (stub for now)
 * - Changes: Pending DOM changes from drag-drop with Undo/Apply actions
 *
 * Uses VSCode theming variables for consistent appearance.
 */
export class StyleInspectPanel {
	private container: HTMLElement;
	private headerContainer: HTMLElement;

	// Split view sections
	private componentsSection: HTMLElement; // Always visible at top (collapsible)
	private componentsContent!: HTMLElement; // DOM tree content container (created in createComponentsSection())
	private verticalSeparator: HTMLElement; // Draggable divider
	private tabsSection: HTMLElement; // CSS/Design/Changes tabs below

	private tabBar!: HTMLElement; // Created in createTabsSection()
	private contentContainer!: HTMLElement; // Created in createTabsSection()
	private resizeHandle: HTMLElement; // Horizontal resize (panel width)
	private isVisible: boolean = false;
	private currentData: ElementStyleInfo | null = null;

	// Panel size constants
	private static readonly DEFAULT_WIDTH = 320;
	private static readonly MIN_WIDTH = 200;
	private static readonly MAX_WIDTH = 600;

	// Components section size
	private static readonly DEFAULT_COMPONENTS_HEIGHT = 200;
	private static readonly MIN_COMPONENTS_HEIGHT = 100;
	private static readonly MAX_COMPONENTS_HEIGHT = 600;

	// Current sizes (persisted during session)
	private currentWidth: number = StyleInspectPanel.DEFAULT_WIDTH;
	private componentsHeight: number = StyleInspectPanel.DEFAULT_COMPONENTS_HEIGHT;
	private isComponentsExpanded: boolean = true;

	// Project mode flag - when false, file links are disabled
	private isProjectMode: boolean = false;

	// Horizontal resize state (panel width)
	private isResizing: boolean = false;
	private resizeStartX: number = 0;
	private resizeStartWidth: number = 0;

	// Vertical resize state (components height)
	private isResizingVertical: boolean = false;
	private resizeStartY: number = 0;
	private resizeStartHeight: number = 0;

	// Tab state
	private activeTab: TabId = 'css';
	private tabButtons: Map<TabId, HTMLElement> = new Map();
	private tabContents: Map<TabId, HTMLElement> = new Map();

	// Collapsible section states for CSS tab
	private expandedSections = new Set<string>(['element', 'inline', 'rules']);

	// DOM tree data for Components section
	private domTree: DOMTreeNode | null = null;
	private selectedNodeId: number | null = null;
	private expandedNodes = new Set<number>();
	private nodeIdToElement = new Map<number, HTMLElement>(); // Map nodeId -> HTMLElement (avoid querySelector)

	// Pending changes data for Changes tab
	private pendingMoves: PendingMove[] = [];

	constructor(
		private readonly parent: HTMLElement,
		private readonly callbacks: IStyleInspectPanelCallbacks
	) {
		this.container = this.createContainer();

		// Create horizontal resize handle (on left edge of panel for width)
		this.resizeHandle = this.createResizeHandle();
		this.container.appendChild(this.resizeHandle);

		// Header with title and close button
		this.headerContainer = this.createHeaderContainer();
		this.container.appendChild(this.headerContainer);

		// Components section (always visible at top, collapsible)
		this.componentsSection = this.createComponentsSection();
		this.container.appendChild(this.componentsSection);

		// Vertical separator (draggable divider between components and tabs)
		this.verticalSeparator = this.createVerticalSeparator();
		this.container.appendChild(this.verticalSeparator);

		// Tabs section (CSS, Design, Changes)
		this.tabsSection = this.createTabsSection();
		this.container.appendChild(this.tabsSection);

		this.parent.appendChild(this.container);

		// Setup resize event listeners (both horizontal and vertical)
		this.setupResizeListeners();
	}

	// ============================================
	// Public API
	// ============================================

	/**
	 * Show panel with element style information
	 */
	show(data: ElementStyleInfo, isProjectMode: boolean = false): void {
		this.currentData = data;
		this.isProjectMode = isProjectMode;
		this.renderActiveTab();
		this.container.style.display = 'flex';
		this.container.style.width = `${this.currentWidth}px`;
		this.isVisible = true;
		this.callbacks.onVisibilityChanged?.(true, this.currentWidth);
	}

	/**
	 * Hide panel
	 */
	hide(): void {
		this.container.style.display = 'none';
		this.isVisible = false;
		this.currentData = null;
		this.callbacks.onVisibilityChanged?.(false, 0);
		this.callbacks.onClose?.();
	}

	/**
	 * Check if panel is visible
	 */
	getIsVisible(): boolean {
		return this.isVisible;
	}

	/**
	 * Update with new data (if panel is visible)
	 */
	update(data: ElementStyleInfo): void {
		if (this.isVisible) {
			this.currentData = data;
			this.renderActiveTab();
		}
	}

	/**
	 * Set DOM tree for Components section (always visible at top)
	 */
	setDOMTree(tree: DOMTreeNode): void {
		this.domTree = tree;

		// Auto-expand body (root) so user sees content immediately
		if (tree && tree.tagName === 'body') {
			this.expandedNodes.add(tree.nodeId);
		}

		// Render Components section (it's always visible, not a tab)
		this.renderComponentsSection();
	}

	/**
	 * Highlight a node in the Components tree (called when user selects element in browser)
	 * Components is always visible at top, so we just update the tree (don't switch tabs)
	 */
	highlightTreeNode(nodeId: number): void {
		this.selectedNodeId = nodeId;
		// Expand parent nodes to make selected node visible
		this.expandParentsOfNode(nodeId);
		// Update Components section (always visible at top, not a tab anymore)
		this.renderComponentsSection();
		// Scroll to selected node
		this.scrollToSelectedNode(nodeId);
	}

	/**
	 * Set pending moves for the Changes tab
	 */
	setPendingMoves(moves: PendingMove[]): void {
		this.pendingMoves = moves;
		if (this.activeTab === 'changes') {
			this.renderChangesTab();
		}
	}

	/**
	 * Switch to the Changes tab and show the panel if hidden
	 * Called when user clicks the pending changes badge
	 */
	switchToChangesTab(): void {
		// Show panel if not visible
		if (!this.isVisible) {
			this.container.style.display = 'flex';
			this.container.style.width = `${this.currentWidth}px`;
			this.isVisible = true;
			this.callbacks.onVisibilityChanged?.(true, this.currentWidth);
		}

		// Switch to changes tab
		this.switchTab('changes');
	}

	/**
	 * Dispose of the panel
	 */
	dispose(): void {
		this.container.remove();
	}

	// ============================================
	// Container & Header
	// ============================================

	private createContainer(): HTMLElement {
		const container = document.createElement('div');
		container.className = 'roopik-style-inspect-panel';
		container.style.cssText = `
			width: ${this.currentWidth}px;
			min-width: ${StyleInspectPanel.MIN_WIDTH}px;
			max-width: ${StyleInspectPanel.MAX_WIDTH}px;
			height: 100%;
			background: var(--vscode-sideBar-background);
			display: none;
			flex-direction: column;
			overflow: hidden;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			flex-shrink: 0;
			position: relative;
		`;
		return container;
	}

	private createHeaderContainer(): HTMLElement {
		const header = document.createElement('div');
		header.style.cssText = `
			padding: 10px 12px;
			display: flex;
			justify-content: space-between;
			align-items: center;
			border-bottom: 1px solid var(--vscode-sideBar-border);
			background: var(--vscode-sideBarSectionHeader-background);
			flex-shrink: 0;
		`;

		const title = document.createElement('span');
		title.style.cssText = `
			font-weight: 600;
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--vscode-sideBarSectionHeader-foreground);
		`;
		title.textContent = 'Inspect';
		header.appendChild(title);

		const closeBtn = document.createElement('button');
		closeBtn.style.cssText = `
			background: none;
			border: none;
			cursor: pointer;
			color: var(--vscode-icon-foreground);
			padding: 4px;
			display: flex;
			align-items: center;
			justify-content: center;
			opacity: 0.7;
			transition: opacity 0.15s;
		`;
		closeBtn.className = 'codicon codicon-close';
		closeBtn.title = 'Close panel (ESC)';
		closeBtn.addEventListener('mouseenter', () => { closeBtn.style.opacity = '1'; });
		closeBtn.addEventListener('mouseleave', () => { closeBtn.style.opacity = '0.7'; });
		closeBtn.addEventListener('click', () => this.hide());
		header.appendChild(closeBtn);

		return header;
	}

	// ============================================
	// Tab Bar
	// ============================================

	private createTabBar(): HTMLElement {
		const tabBar = document.createElement('div');
		tabBar.style.cssText = `
			display: flex;
			gap: 1px;
			border-bottom: 2px solid var(--vscode-sideBar-border);
			background: var(--vscode-sideBarSectionHeader-background);
			padding: 4px 8px 0 8px;
			flex-shrink: 0;
		`;

		const tabs: { id: TabId; label: string }[] = [
			{ id: 'css', label: 'CSS' },
			{ id: 'design', label: 'Design' },
			{ id: 'changes', label: 'Changes' }
		];

		for (const tab of tabs) {
			const tabBtn = this.createTabButton(tab.id, tab.label);
			this.tabButtons.set(tab.id, tabBtn);
			tabBar.appendChild(tabBtn);
		}

		return tabBar;
	}

	private createTabButton(id: TabId, label: string): HTMLElement {
		const btn = document.createElement('button');
		btn.style.cssText = `
			padding: 8px 16px;
			background: var(--vscode-tab-inactiveBackground);
			border: 1px solid var(--vscode-sideBar-border);
			border-bottom: none;
			border-radius: 4px 4px 0 0;
			cursor: pointer;
			font-size: 12px;
			font-weight: 500;
			color: var(--vscode-foreground);
			opacity: 0.7;
			transition: all 0.15s;
			outline: none;
			position: relative;
		`;
		btn.textContent = label;

		if (id === this.activeTab) {
			btn.style.opacity = '1';
			btn.style.background = 'var(--vscode-sideBar-background)';
			btn.style.borderBottom = '2px solid var(--vscode-sideBar-background)';
			btn.style.borderTop = '2px solid var(--vscode-focusBorder)';
			btn.style.marginBottom = '-2px';
			btn.style.fontWeight = '600';
		}

		btn.addEventListener('mouseenter', () => {
			if (id !== this.activeTab) {
				btn.style.opacity = '0.9';
				btn.style.background = 'var(--vscode-list-hoverBackground)';
			}
		});
		btn.addEventListener('mouseleave', () => {
			if (id !== this.activeTab) {
				btn.style.opacity = '0.7';
				btn.style.background = 'var(--vscode-tab-inactiveBackground)';
			}
		});
		btn.addEventListener('click', () => this.switchTab(id));

		return btn;
	}

	private switchTab(tabId: TabId): void {
		if (tabId === this.activeTab) {
			return;
		}

		// Update button styles
		const prevBtn = this.tabButtons.get(this.activeTab);
		if (prevBtn) {
			prevBtn.style.opacity = '0.7';
			prevBtn.style.background = 'var(--vscode-tab-inactiveBackground)';
			prevBtn.style.borderBottom = 'none';
			prevBtn.style.borderTop = '1px solid var(--vscode-sideBar-border)';
			prevBtn.style.marginBottom = '0';
			prevBtn.style.fontWeight = '500';
		}

		const newBtn = this.tabButtons.get(tabId);
		if (newBtn) {
			newBtn.style.opacity = '1';
			newBtn.style.background = 'var(--vscode-sideBar-background)';
			newBtn.style.borderBottom = '2px solid var(--vscode-sideBar-background)';
			newBtn.style.borderTop = '2px solid var(--vscode-focusBorder)';
			newBtn.style.marginBottom = '-2px';
			newBtn.style.fontWeight = '600';
		}

		// Hide previous content, show new content
		const prevContent = this.tabContents.get(this.activeTab);
		if (prevContent) {
			prevContent.style.display = 'none';
		}

		const newContent = this.tabContents.get(tabId);
		if (newContent) {
			newContent.style.display = 'block';
		}

		this.activeTab = tabId;
		this.renderActiveTab();
	}

	// ============================================
	// Components Section (Always Visible, Collapsible)
	// ============================================

	private createComponentsSection(): HTMLElement {
		const section = document.createElement('div');
		section.className = 'components-section';
		section.style.cssText = `
			display: flex;
			flex-direction: column;
			height: ${this.componentsHeight}px;
			flex-shrink: 0;
			border-bottom: 1px solid var(--vscode-sideBar-border);
			background: var(--vscode-sideBar-background);
		`;

		// Collapsible header
		const header = document.createElement('div');
		header.style.cssText = `
			padding: 8px 12px;
			display: flex;
			align-items: center;
			cursor: pointer;
			user-select: none;
			background: var(--vscode-sideBarSectionHeader-background);
			border-bottom: 1px solid var(--vscode-sideBar-border);
		`;

		const toggleIcon = document.createElement('span');
		toggleIcon.textContent = '▼';
		toggleIcon.style.cssText = `
			font-size: 10px;
			margin-right: 6px;
			transition: transform 0.2s;
		`;

		const title = document.createElement('span');
		title.textContent = 'Components';
		title.style.cssText = `
			font-weight: 600;
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--vscode-sideBarSectionHeader-foreground);
		`;

		header.appendChild(toggleIcon);
		header.appendChild(title);

		// Toggle collapse on click
		header.addEventListener('click', () => {
			this.isComponentsExpanded = !this.isComponentsExpanded;
			if (this.isComponentsExpanded) {
				toggleIcon.style.transform = 'rotate(0deg)';
				content.style.display = 'block';
			} else {
				toggleIcon.style.transform = 'rotate(-90deg)';
				content.style.display = 'none';
			}
		});

		// Content container (DOM tree)
		const content = document.createElement('div');
		content.className = 'components-content';
		content.style.cssText = `
			flex: 1;
			overflow-y: auto;
			overflow-x: hidden;
			padding: 8px;
		`;

		// Apply VS Code-style scrollbar
		this.applyScrollbarStyles(content);

		section.appendChild(header);
		section.appendChild(content);

		// Store direct reference to avoid querySelector
		this.componentsContent = content;

		return section;
	}

	private createVerticalSeparator(): HTMLElement {
		const separator = document.createElement('div');
		separator.className = 'vertical-separator';
		separator.style.cssText = `
			height: 6px;
			background: var(--vscode-sideBarSectionHeader-background);
			border-top: 1px solid var(--vscode-sideBar-border);
			border-bottom: 1px solid var(--vscode-sideBar-border);
			cursor: ns-resize;
			flex-shrink: 0;
			transition: all 0.15s;
			position: relative;
		`;

		// Add a visual grip indicator (three dots)
		const grip = document.createElement('div');
		grip.style.cssText = `
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			display: flex;
			gap: 3px;
			pointer-events: none;
		`;

		for (let i = 0; i < 3; i++) {
			const dot = document.createElement('div');
			dot.style.cssText = `
				width: 3px;
				height: 3px;
				border-radius: 50%;
				background: var(--vscode-icon-foreground);
				opacity: 0.4;
			`;
			grip.appendChild(dot);
		}
		separator.appendChild(grip);

		separator.addEventListener('mouseenter', () => {
			separator.style.background = 'var(--vscode-list-hoverBackground)';
			grip.style.opacity = '1';
		});

		separator.addEventListener('mouseleave', () => {
			if (!this.isResizingVertical) {
				separator.style.background = 'var(--vscode-sideBarSectionHeader-background)';
				grip.style.opacity = '1';
			}
		});

		// Vertical resize (components height)
		separator.addEventListener('mousedown', (e) => {
			this.isResizingVertical = true;
			this.resizeStartY = e.clientY;
			this.resizeStartHeight = this.componentsHeight;
			separator.style.background = 'var(--vscode-focusBorder)';
			e.preventDefault();
		});

		return separator;
	}

	private createTabsSection(): HTMLElement {
		const section = document.createElement('div');
		section.className = 'tabs-section';
		section.style.cssText = `
			display: flex;
			flex-direction: column;
			flex: 1;
			overflow: hidden;
		`;

		// Tab bar
		this.tabBar = this.createTabBar();
		section.appendChild(this.tabBar);

		// Content container (holds tab contents)
		this.contentContainer = document.createElement('div');
		this.contentContainer.className = 'style-inspect-content';
		this.contentContainer.style.cssText = `
			flex: 1;
			overflow-y: auto;
			overflow-x: hidden;
		`;

		// Apply VS Code-style scrollbar
		this.applyScrollbarStyles(this.contentContainer);

		section.appendChild(this.contentContainer);

		// Create tab content containers
		this.createTabContents();

		return section;
	}

	private renderComponentsSection(): void {
		if (!this.componentsContent) {
			return;
		}

		// Clear content and nodeId map
		while (this.componentsContent.firstChild) {
			this.componentsContent.removeChild(this.componentsContent.firstChild);
		}
		this.nodeIdToElement.clear();

		if (!this.domTree) {
			const placeholder = document.createElement('div');
			placeholder.style.cssText = `
				padding: 12px;
				color: var(--vscode-descriptionForeground);
				font-size: 12px;
			`;
			placeholder.textContent = 'No DOM tree available';
			this.componentsContent.appendChild(placeholder);
			return;
		}

		// Render tree (reuse existing renderTreeNode method)
		this.renderTreeNode(this.componentsContent, this.domTree, 0);
	}

	private scrollToSelectedNode(nodeId: number): void {
		// Use direct reference from map (no querySelector needed)
		const selectedElement = this.nodeIdToElement.get(nodeId);
		if (selectedElement) {
			// Use setTimeout to ensure DOM is fully rendered
			setTimeout(() => {
				selectedElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
			}, 100);
		}
	}

	// ============================================
	// Tab Contents
	// ============================================

	private createTabContents(): void {
		// CSS tab content
		const cssContent = document.createElement('div');
		cssContent.className = 'tab-content-css';
		cssContent.style.display = 'block';
		this.tabContents.set('css', cssContent);
		this.contentContainer.appendChild(cssContent);

		// Design tab content
		const designContent = document.createElement('div');
		designContent.className = 'tab-content-design';
		designContent.style.display = 'none';
		this.tabContents.set('design', designContent);
		this.contentContainer.appendChild(designContent);

		// Changes tab content
		const changesContent = document.createElement('div');
		changesContent.className = 'tab-content-changes';
		changesContent.style.display = 'none';
		this.tabContents.set('changes', changesContent);
		this.contentContainer.appendChild(changesContent);
	}

	private renderActiveTab(): void {
		switch (this.activeTab) {
			case 'css':
				this.renderCssTab();
				break;
			case 'design':
				this.renderDesignTab();
				break;
			case 'changes':
				this.renderChangesTab();
				break;
		}
	}

	// ============================================
	// CSS Tab (existing functionality)
	// ============================================

	private renderCssTab(): void {
		const content = this.tabContents.get('css');
		if (!content) {
			return;
		}

		// Clear content
		while (content.firstChild) {
			content.removeChild(content.firstChild);
		}

		if (!this.currentData) {
			content.appendChild(this.createEmptyState());
			return;
		}

		// Check if this is empty state (no element selected)
		if (!this.currentData.tagName) {
			content.appendChild(this.createEmptyState());
			return;
		}

		// Element section (always first)
		content.appendChild(this.createElementSection(this.currentData));

		// CSS-in-JS notice (if detected)
		if (this.currentData.cssInJs?.detected) {
			content.appendChild(this.createCssInJsNotice(this.currentData.cssInJs));
		}

		// Filter rules: separate element-specific from universal/resets
		const elementSpecificRules = this.currentData.matchedRules.filter(r =>
			r.selector !== '*' && !r.selector.startsWith('*,')
		);
		const resetRules = this.currentData.matchedRules.filter(r =>
			r.selector === '*' || r.selector.startsWith('*,')
		);

		// 1. INLINE STYLES
		if (this.currentData.inlineStyles.length > 0) {
			content.appendChild(this.createInlineStylesSection(this.currentData.inlineStyles));
		}

		// 2. ELEMENT-SPECIFIC CSS RULES
		if (elementSpecificRules.length > 0) {
			content.appendChild(this.createRulesSection(elementSpecificRules, 'Element Styles'));
		}

		// 3. INHERITED
		if (this.currentData.inheritedStyles && this.currentData.inheritedStyles.length > 0) {
			content.appendChild(this.createInheritedSection(this.currentData.inheritedStyles));
		}

		// 4. RESET/UNIVERSAL RULES
		if (resetRules.length > 0) {
			content.appendChild(this.createRulesSection(resetRules, 'Reset Styles', 'resets'));
		}

		// 5. ALL COMPUTED
		if (this.currentData.properties.length > 0) {
			content.appendChild(this.createStylesSection(this.currentData.properties));
		}
	}

	// ============================================
	// Design Tab (Figma-like Visual Editor)
	// ============================================

	/**
	 * Get computed style value for a property from current data.
	 * For Design tab, we want the RESOLVED computed value (actual pixels),
	 * not the declared CSS value (like clamp(), calc(), rem, etc.)
	 *
	 * Priority order for Design tab (Figma-like):
	 * 1. Browser computed styles (actual pixel values from CDP getComputedStyleForNode)
	 * 2. All computed properties (fallback)
	 * 3. Inline styles
	 * 4. Matched CSS rules
	 */
	private getComputedValue(propertyName: string): string {
		if (!this.currentData) {
			return '';
		}

		// Map CSS property names to ComputedStyleValues field names
		const computedStylesMap: Record<string, string> = {
			'display': 'display',
			'position': 'position',
			'flex-direction': 'flexDirection',
			'justify-content': 'justifyContent',
			'align-items': 'alignItems',
			'gap': 'gap',
			'width': 'width',
			'height': 'height',
			'min-width': 'minWidth',
			'max-width': 'maxWidth',
			'min-height': 'minHeight',
			'max-height': 'maxHeight',
			'margin-top': 'marginTop',
			'margin-right': 'marginRight',
			'margin-bottom': 'marginBottom',
			'margin-left': 'marginLeft',
			'padding-top': 'paddingTop',
			'padding-right': 'paddingRight',
			'padding-bottom': 'paddingBottom',
			'padding-left': 'paddingLeft',
			'border-width': 'borderWidth',
			'border-style': 'borderStyle',
			'border-color': 'borderColor',
			'border-radius': 'borderRadius',
			'font-family': 'fontFamily',
			'font-size': 'fontSize',
			'font-weight': 'fontWeight',
			'line-height': 'lineHeight',
			'letter-spacing': 'letterSpacing',
			'text-align': 'textAlign',
			'color': 'color',
			'background-color': 'backgroundColor',
			'opacity': 'opacity',
			'box-shadow': 'boxShadow',
			'overflow': 'overflow',
			'transform': 'transform',
			'z-index': 'zIndex',
			'top': 'top',
			'right': 'right',
			'bottom': 'bottom',
			'left': 'left',
		};

		// 1. Check browser computed styles FIRST - these are the actual rendered values
		// (e.g., "64px" instead of "clamp(2.5rem, 8vw, 4.5rem)")
		if (this.currentData.computedStyles) {
			const fieldName = computedStylesMap[propertyName];
			if (fieldName) {
				const value = (this.currentData.computedStyles as Record<string, string | undefined>)[fieldName];
				if (value) {
					return value;
				}
			}
		}

		// 2. Fallback to properties array (also computed values but from a different source)
		if (this.currentData.properties && this.currentData.properties.length > 0) {
			const prop = this.currentData.properties.find(p => p.name === propertyName);
			if (prop && prop.value) {
				return prop.value;
			}
		}

		// 3. Fallback to inline styles (declared values)
		if (this.currentData.inlineStyles && this.currentData.inlineStyles.length > 0) {
			const inlineProp = this.currentData.inlineStyles.find(p => p.name === propertyName);
			if (inlineProp) {
				return inlineProp.value;
			}
		}

		// 4. Fallback to matched CSS rules
		if (this.currentData.matchedRules && this.currentData.matchedRules.length > 0) {
			for (const rule of this.currentData.matchedRules) {
				if (rule.properties) {
					const ruleProp = rule.properties.find(p => p.name === propertyName);
					if (ruleProp && !ruleProp.isOverridden) {
						return ruleProp.value;
					}
				}
			}
		}

		return '';
	}

	/**
	 * Parse a CSS value into number and unit
	 */
	private parseValueAndUnit(value: string): { num: string; unit: string } {
		if (!value || value === 'auto' || value === 'none' || value === 'inherit' || value === 'initial') {
			return { num: value, unit: '' };
		}
		const match = value.match(/^(-?[\d.]+)(.*)$/);
		if (match) {
			return { num: match[1], unit: match[2] || 'px' };
		}
		return { num: value, unit: '' };
	}

	private renderDesignTab(): void {
		const content = this.tabContents.get('design');
		if (!content) {
			return;
		}

		// Clear content
		while (content.firstChild) {
			content.removeChild(content.firstChild);
		}

		// Show empty state if no element selected
		if (!this.currentData || !this.currentData.tagName) {
			content.appendChild(this.createDesignEmptyState());
			return;
		}

		// Main scrollable container
		const scrollContainer = document.createElement('div');
		scrollContainer.style.cssText = `
			overflow-y: auto;
			height: 100%;
			padding: 12px;
		`;

		// 1. SPACING Section (Margin & Padding)
		scrollContainer.appendChild(this.createSpacingSection());

		// 2. LAYOUT Section (Display, Position, Flex)
		scrollContainer.appendChild(this.createLayoutSection());

		// 3. TYPOGRAPHY Section
		scrollContainer.appendChild(this.createTypographySection());

		// 4. SIZE Section (Width, Height)
		scrollContainer.appendChild(this.createSizeSection());

		// 5. COLORS Section
		scrollContainer.appendChild(this.createColorsSection());

		// 6. BORDERS Section
		scrollContainer.appendChild(this.createBordersSection());

		// 7. EFFECTS Section
		scrollContainer.appendChild(this.createEffectsSection());

		content.appendChild(scrollContainer);
	}

	private createDesignEmptyState(): HTMLElement {
		const empty = document.createElement('div');
		empty.style.cssText = `
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			padding: 40px 20px;
			text-align: center;
			color: var(--vscode-descriptionForeground);
			height: 100%;
		`;

		const icon = document.createElement('div');
		icon.className = 'codicon codicon-inspect';
		icon.style.cssText = `font-size: 32px; margin-bottom: 12px; opacity: 0.5;`;
		empty.appendChild(icon);

		const text = document.createElement('div');
		text.style.cssText = `font-size: 12px; opacity: 0.7;`;
		text.textContent = 'Select an element to view its design properties';
		empty.appendChild(text);

		return empty;
	}

	/**
	 * Create a collapsible section for Design tab
	 */
	private createDesignSection(title: string, icon: string): { section: HTMLElement; content: HTMLElement } {
		const section = document.createElement('div');
		section.style.cssText = `margin-bottom: 16px;`;

		const header = document.createElement('div');
		header.style.cssText = `
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 6px 0;
			cursor: pointer;
			user-select: none;
		`;

		const chevron = document.createElement('span');
		chevron.className = 'codicon codicon-chevron-down';
		chevron.style.cssText = `font-size: 12px; opacity: 0.7; transition: transform 0.15s;`;
		header.appendChild(chevron);

		const iconEl = document.createElement('span');
		iconEl.className = `codicon codicon-${icon}`;
		iconEl.style.cssText = `font-size: 14px; opacity: 0.8;`;
		header.appendChild(iconEl);

		const titleEl = document.createElement('span');
		titleEl.style.cssText = `font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;`;
		titleEl.textContent = title;
		header.appendChild(titleEl);

		section.appendChild(header);

		const content = document.createElement('div');
		content.style.cssText = `padding-left: 4px;`;
		section.appendChild(content);

		// Toggle collapse
		header.addEventListener('click', () => {
			const isCollapsed = content.style.display === 'none';
			content.style.display = isCollapsed ? 'block' : 'none';
			chevron.style.transform = isCollapsed ? '' : 'rotate(-90deg)';
		});

		return { section, content };
	}

	/**
	 * Create a property row with label and input (for Design tab)
	 */
	private createDesignPropertyRow(label: string, cssProperty: string, options?: {
		type?: 'text' | 'number' | 'select' | 'color';
		selectOptions?: string[];
		unit?: boolean;
		placeholder?: string;
	}): HTMLElement {
		const row = document.createElement('div');
		row.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 4px 0;
			gap: 8px;
		`;

		const labelEl = document.createElement('label');
		labelEl.style.cssText = `
			font-size: 11px;
			color: var(--vscode-foreground);
			opacity: 0.8;
			flex-shrink: 0;
			min-width: 70px;
		`;
		labelEl.textContent = label;
		row.appendChild(labelEl);

		const inputContainer = document.createElement('div');
		inputContainer.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
			flex: 1;
			justify-content: flex-end;
		`;

		const value = this.getComputedValue(cssProperty);
		const { num, unit } = this.parseValueAndUnit(value);

		// Helper to trigger live style change
		const triggerLiveChange = (newValue: string) => {
			this.callbacks.onLiveStyleChange?.(cssProperty, newValue);
		};

		if (options?.type === 'select' && options.selectOptions) {
			// Select dropdown
			const select = document.createElement('select');
			select.style.cssText = `
				padding: 4px 6px;
				border: 1px solid var(--vscode-input-border);
				background: var(--vscode-input-background);
				color: var(--vscode-input-foreground);
				font-size: 11px;
				border-radius: 3px;
				min-width: 80px;
				cursor: pointer;
			`;
			options.selectOptions.forEach(opt => {
				const option = document.createElement('option');
				option.value = opt;
				option.textContent = opt;
				option.selected = value === opt;
				select.appendChild(option);
			});
			// Live preview on change
			select.addEventListener('change', () => {
				triggerLiveChange(select.value);
			});
			inputContainer.appendChild(select);
		} else if (options?.type === 'color') {
			// Color input
			const colorPreview = document.createElement('div');
			colorPreview.style.cssText = `
				width: 20px;
				height: 20px;
				border-radius: 3px;
				border: 1px solid var(--vscode-input-border);
				background: ${value || 'transparent'};
				cursor: pointer;
			`;
			inputContainer.appendChild(colorPreview);

			const colorValue = document.createElement('input');
			colorValue.type = 'text';
			colorValue.value = value;
			colorValue.style.cssText = `
				width: 70px;
				padding: 4px 6px;
				border: 1px solid var(--vscode-input-border);
				background: var(--vscode-input-background);
				color: var(--vscode-input-foreground);
				font-size: 11px;
				border-radius: 3px;
				font-family: var(--vscode-editor-font-family);
			`;
			// Live preview on input (debounced via blur or Enter key)
			colorValue.addEventListener('blur', () => {
				colorPreview.style.background = colorValue.value || 'transparent';
				triggerLiveChange(colorValue.value);
			});
			colorValue.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					colorPreview.style.background = colorValue.value || 'transparent';
					triggerLiveChange(colorValue.value);
				}
			});
			inputContainer.appendChild(colorValue);
		} else {
			// Number/Text input
			const input = document.createElement('input');
			input.type = options?.type === 'number' ? 'number' : 'text';
			input.value = num;
			input.placeholder = options?.placeholder || '';
			input.style.cssText = `
				width: ${options?.unit ? '50px' : '70px'};
				padding: 4px 6px;
				border: 1px solid var(--vscode-input-border);
				background: var(--vscode-input-background);
				color: var(--vscode-input-foreground);
				font-size: 11px;
				border-radius: 3px;
				text-align: right;
			`;

			// Track current unit for combining value + unit
			let currentUnit = unit || 'px';

			// Live preview helper for number inputs
			const triggerNumberChange = () => {
				const val = input.value;
				if (val === 'auto' || val === '') {
					triggerLiveChange(val || 'auto');
				} else {
					triggerLiveChange(`${val}${currentUnit}`);
				}
			};

			// Live preview on blur or Enter
			input.addEventListener('blur', triggerNumberChange);
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					triggerNumberChange();
				}
			});

			inputContainer.appendChild(input);

			// Unit selector if enabled
			if (options?.unit && unit) {
				const unitSelect = document.createElement('select');
				unitSelect.style.cssText = `
					padding: 4px 2px;
					border: 1px solid var(--vscode-input-border);
					background: var(--vscode-input-background);
					color: var(--vscode-input-foreground);
					font-size: 10px;
					border-radius: 3px;
					cursor: pointer;
				`;
				['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'].forEach(u => {
					const option = document.createElement('option');
					option.value = u;
					option.textContent = u;
					option.selected = unit === u || (u === 'auto' && num === 'auto');
					unitSelect.appendChild(option);
				});
				// Live preview when unit changes
				unitSelect.addEventListener('change', () => {
					currentUnit = unitSelect.value;
					if (unitSelect.value === 'auto') {
						input.value = 'auto';
						triggerLiveChange('auto');
					} else {
						triggerNumberChange();
					}
				});
				inputContainer.appendChild(unitSelect);
			}
		}

		row.appendChild(inputContainer);
		return row;
	}

	/**
	 * SPACING Section - Margin & Padding visual editor
	 */
	private createSpacingSection(): HTMLElement {
		const { section, content } = this.createDesignSection('Spacing', 'layout');

		// Box model visualization
		const boxModel = this.createBoxModelVisualization();
		content.appendChild(boxModel);

		return section;
	}

	/**
	 * Create visual box model (margin -> border -> padding -> content)
	 */
	private createBoxModelVisualization(): HTMLElement {
		const container = document.createElement('div');
		container.style.cssText = `
			display: flex;
			flex-direction: column;
			align-items: center;
			padding: 12px;
		`;

		// Get computed values
		const mt = this.parseValueAndUnit(this.getComputedValue('margin-top')).num;
		const mr = this.parseValueAndUnit(this.getComputedValue('margin-right')).num;
		const mb = this.parseValueAndUnit(this.getComputedValue('margin-bottom')).num;
		const ml = this.parseValueAndUnit(this.getComputedValue('margin-left')).num;

		const pt = this.parseValueAndUnit(this.getComputedValue('padding-top')).num;
		const pr = this.parseValueAndUnit(this.getComputedValue('padding-right')).num;
		const pb = this.parseValueAndUnit(this.getComputedValue('padding-bottom')).num;
		const pl = this.parseValueAndUnit(this.getComputedValue('padding-left')).num;

		const width = this.getComputedValue('width') || 'auto';
		const height = this.getComputedValue('height') || 'auto';

		// Margin box (outer)
		const marginBox = document.createElement('div');
		marginBox.style.cssText = `
			background: rgba(255, 190, 125, 0.15);
			border: 1px dashed rgba(255, 190, 125, 0.5);
			padding: 16px;
			position: relative;
		`;

		// Margin label
		const marginLabel = document.createElement('div');
		marginLabel.style.cssText = `
			position: absolute;
			top: 2px;
			left: 4px;
			font-size: 9px;
			color: var(--vscode-descriptionForeground);
			text-transform: uppercase;
		`;
		marginLabel.textContent = 'margin';
		marginBox.appendChild(marginLabel);

		// Margin values (positioned around the box)
		marginBox.appendChild(this.createBoxValue(mt, 'top', 'margin'));
		marginBox.appendChild(this.createBoxValue(mr, 'right', 'margin'));
		marginBox.appendChild(this.createBoxValue(mb, 'bottom', 'margin'));
		marginBox.appendChild(this.createBoxValue(ml, 'left', 'margin'));

		// Padding box (inner)
		const paddingBox = document.createElement('div');
		paddingBox.style.cssText = `
			background: rgba(125, 200, 125, 0.15);
			border: 1px dashed rgba(125, 200, 125, 0.5);
			padding: 16px;
			position: relative;
			min-width: 100px;
		`;

		// Padding label
		const paddingLabel = document.createElement('div');
		paddingLabel.style.cssText = `
			position: absolute;
			top: 2px;
			left: 4px;
			font-size: 9px;
			color: var(--vscode-descriptionForeground);
			text-transform: uppercase;
		`;
		paddingLabel.textContent = 'padding';
		paddingBox.appendChild(paddingLabel);

		// Padding values
		paddingBox.appendChild(this.createBoxValue(pt, 'top', 'padding'));
		paddingBox.appendChild(this.createBoxValue(pr, 'right', 'padding'));
		paddingBox.appendChild(this.createBoxValue(pb, 'bottom', 'padding'));
		paddingBox.appendChild(this.createBoxValue(pl, 'left', 'padding'));

		// Content box (innermost)
		const contentBox = document.createElement('div');
		contentBox.style.cssText = `
			background: rgba(125, 175, 255, 0.2);
			border: 1px solid rgba(125, 175, 255, 0.5);
			padding: 8px 12px;
			text-align: center;
			min-width: 60px;
		`;
		const contentText = document.createElement('div');
		contentText.style.cssText = `font-size: 10px; color: var(--vscode-foreground); opacity: 0.8;`;
		contentText.textContent = `${this.parseValueAndUnit(width).num} × ${this.parseValueAndUnit(height).num}`;
		contentBox.appendChild(contentText);

		paddingBox.appendChild(contentBox);
		marginBox.appendChild(paddingBox);
		container.appendChild(marginBox);

		return container;
	}

	/**
	 * Create an editable value input positioned on a box edge
	 */
	private createBoxValue(value: string, position: 'top' | 'right' | 'bottom' | 'left', type: 'margin' | 'padding'): HTMLElement {
		const input = document.createElement('input');
		input.type = 'text';
		input.value = value === '0px' ? '0' : value;
		input.style.cssText = `
			position: absolute;
			width: 32px;
			padding: 2px;
			border: 1px solid transparent;
			background: transparent;
			color: var(--vscode-foreground);
			font-size: 10px;
			text-align: center;
			border-radius: 2px;
			${position === 'top' ? 'top: 2px; left: 50%; transform: translateX(-50%);' : ''}
			${position === 'bottom' ? 'bottom: 2px; left: 50%; transform: translateX(-50%);' : ''}
			${position === 'left' ? 'left: 2px; top: 50%; transform: translateY(-50%);' : ''}
			${position === 'right' ? 'right: 2px; top: 50%; transform: translateY(-50%);' : ''}
		`;

		// Construct CSS property name: margin-top, padding-left, etc.
		const cssProperty = `${type}-${position}`;

		// Live preview handler
		const triggerLiveChange = () => {
			let val = input.value.trim();
			// Add px if it's just a number
			if (val && !isNaN(Number(val))) {
				val = `${val}px`;
			}
			this.callbacks.onLiveStyleChange?.(cssProperty, val || '0');
		};

		input.addEventListener('focus', () => {
			input.style.border = '1px solid var(--vscode-focusBorder)';
			input.style.background = 'var(--vscode-input-background)';
		});
		input.addEventListener('blur', () => {
			input.style.border = '1px solid transparent';
			input.style.background = 'transparent';
			triggerLiveChange();
		});
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				input.blur();
			}
		});

		return input;
	}

	/**
	 * LAYOUT Section - Display, Position, Flex properties
	 */
	private createLayoutSection(): HTMLElement {
		const { section, content } = this.createDesignSection('Layout', 'layout');

		// Display property
		content.appendChild(this.createDesignPropertyRow('Display', 'display', {
			type: 'select',
			selectOptions: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'none']
		}));

		// Position property
		content.appendChild(this.createDesignPropertyRow('Position', 'position', {
			type: 'select',
			selectOptions: ['static', 'relative', 'absolute', 'fixed', 'sticky']
		}));

		// Flex container properties (if display is flex)
		const display = this.getComputedValue('display');
		if (display === 'flex' || display === 'inline-flex') {
			const flexHeader = document.createElement('div');
			flexHeader.style.cssText = `
				font-size: 10px;
				color: var(--vscode-descriptionForeground);
				margin: 8px 0 4px;
				text-transform: uppercase;
			`;
			flexHeader.textContent = 'Flexbox';
			content.appendChild(flexHeader);

			content.appendChild(this.createDesignPropertyRow('Direction', 'flex-direction', {
				type: 'select',
				selectOptions: ['row', 'row-reverse', 'column', 'column-reverse']
			}));

			content.appendChild(this.createDesignPropertyRow('Justify', 'justify-content', {
				type: 'select',
				selectOptions: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly']
			}));

			content.appendChild(this.createDesignPropertyRow('Align', 'align-items', {
				type: 'select',
				selectOptions: ['flex-start', 'center', 'flex-end', 'stretch', 'baseline']
			}));

			content.appendChild(this.createDesignPropertyRow('Gap', 'gap', { type: 'number', unit: true }));
		}

		return section;
	}

	/**
	 * TYPOGRAPHY Section
	 */
	private createTypographySection(): HTMLElement {
		const { section, content } = this.createDesignSection('Typography', 'text-size');

		content.appendChild(this.createDesignPropertyRow('Font Size', 'font-size', { type: 'number', unit: true }));
		content.appendChild(this.createDesignPropertyRow('Font Weight', 'font-weight', {
			type: 'select',
			selectOptions: ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'normal', 'bold']
		}));
		content.appendChild(this.createDesignPropertyRow('Line Height', 'line-height', { type: 'number', unit: true }));
		content.appendChild(this.createDesignPropertyRow('Letter Spacing', 'letter-spacing', { type: 'number', unit: true }));
		content.appendChild(this.createDesignPropertyRow('Text Align', 'text-align', {
			type: 'select',
			selectOptions: ['left', 'center', 'right', 'justify']
		}));

		return section;
	}

	/**
	 * SIZE Section - Width & Height
	 */
	private createSizeSection(): HTMLElement {
		const { section, content } = this.createDesignSection('Size', 'symbol-ruler');

		content.appendChild(this.createDesignPropertyRow('Width', 'width', { type: 'number', unit: true }));
		content.appendChild(this.createDesignPropertyRow('Height', 'height', { type: 'number', unit: true }));
		content.appendChild(this.createDesignPropertyRow('Min Width', 'min-width', { type: 'number', unit: true }));
		content.appendChild(this.createDesignPropertyRow('Max Width', 'max-width', { type: 'number', unit: true }));
		content.appendChild(this.createDesignPropertyRow('Min Height', 'min-height', { type: 'number', unit: true }));
		content.appendChild(this.createDesignPropertyRow('Max Height', 'max-height', { type: 'number', unit: true }));

		return section;
	}

	/**
	 * COLORS Section
	 */
	private createColorsSection(): HTMLElement {
		const { section, content } = this.createDesignSection('Colors', 'symbol-color');

		content.appendChild(this.createDesignPropertyRow('Text Color', 'color', { type: 'color' }));
		content.appendChild(this.createDesignPropertyRow('Background', 'background-color', { type: 'color' }));

		return section;
	}

	/**
	 * BORDERS Section
	 */
	private createBordersSection(): HTMLElement {
		const { section, content } = this.createDesignSection('Borders', 'chrome-minimize');

		content.appendChild(this.createDesignPropertyRow('Width', 'border-width', { type: 'number', unit: true }));
		content.appendChild(this.createDesignPropertyRow('Style', 'border-style', {
			type: 'select',
			selectOptions: ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge']
		}));
		content.appendChild(this.createDesignPropertyRow('Color', 'border-color', { type: 'color' }));
		content.appendChild(this.createDesignPropertyRow('Radius', 'border-radius', { type: 'number', unit: true }));

		return section;
	}

	/**
	 * EFFECTS Section - Opacity, Shadow
	 */
	private createEffectsSection(): HTMLElement {
		const { section, content } = this.createDesignSection('Effects', 'sparkle');

		content.appendChild(this.createDesignPropertyRow('Opacity', 'opacity', { type: 'number', placeholder: '1' }));
		content.appendChild(this.createDesignPropertyRow('Box Shadow', 'box-shadow', { type: 'text' }));
		content.appendChild(this.createDesignPropertyRow('Overflow', 'overflow', {
			type: 'select',
			selectOptions: ['visible', 'hidden', 'scroll', 'auto']
		}));

		return section;
	}

	// ============================================
	// Components Tab (DOM Tree)
	// ============================================


	private renderTreeNode(container: HTMLElement, node: DOMTreeNode, depth: number): void {
		const row = document.createElement('div');
		const isSelected = node.nodeId === this.selectedNodeId;
		const isExpanded = this.expandedNodes.has(node.nodeId);
		const hasChildren = node.children && node.children.length > 0;

		// Store direct reference to avoid querySelector (VS Code best practice)
		this.nodeIdToElement.set(node.nodeId, row);

		row.style.cssText = `
			display: flex;
			align-items: center;
			padding: 2px 8px 2px ${8 + depth * 16}px;
			cursor: pointer;
			${isSelected ? 'background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground);' : ''}
		`;

		// Hover effect + highlight in browser
		row.addEventListener('mouseenter', () => {
			if (!isSelected) {
				row.style.background = 'var(--vscode-list-hoverBackground)';
			}
			// Highlight element in browser on hover
			this.callbacks.onTreeNodeHover?.(node.nodeId);
		});
		row.addEventListener('mouseleave', () => {
			if (!isSelected) {
				row.style.background = '';
			}
		});

		// Expand/collapse chevron (using VSCode codicon)
		const chevron = document.createElement('span');
		chevron.className = 'codicon codicon-chevron-right';
		chevron.style.cssText = `
			width: 16px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			font-size: 12px;
			opacity: ${hasChildren ? '0.7' : '0'};
			transition: transform 0.15s;
			${isExpanded ? 'transform: rotate(90deg);' : ''}
		`;

		if (hasChildren) {
			chevron.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleNodeExpansion(node.nodeId);
			});
		}
		row.appendChild(chevron);

		// Node label (tagName.className or tagName#id)
		const label = document.createElement('span');
		let labelText = node.tagName.toLowerCase();
		if (node.id) {
			labelText += `#${node.id}`;
		} else if (node.className) {
			// Take first class only to keep it short
			const firstClass = node.className.split(' ')[0];
			if (firstClass) {
				labelText += `.${firstClass}`;
			}
		}
		label.textContent = labelText;
		row.appendChild(label);

		// Click to select
		row.addEventListener('click', () => {
			this.selectedNodeId = node.nodeId;
			this.callbacks.onTreeNodeSelected?.(node.nodeId);
			this.renderComponentsSection();
		});

		container.appendChild(row);

		// Render children if expanded
		if (hasChildren && isExpanded) {
			for (const child of node.children) {
				this.renderTreeNode(container, child, depth + 1);
			}
		}
	}

	private toggleNodeExpansion(nodeId: number): void {
		if (this.expandedNodes.has(nodeId)) {
			this.expandedNodes.delete(nodeId);
		} else {
			this.expandedNodes.add(nodeId);
		}
		this.renderComponentsSection();
	}

	private expandParentsOfNode(targetNodeId: number): void {
		// Find and expand all parent nodes to make target visible
		const findAndExpand = (node: DOMTreeNode, path: number[]): boolean => {
			if (node.nodeId === targetNodeId) {
				// Found! Expand all nodes in path
				for (const id of path) {
					this.expandedNodes.add(id);
				}
				return true;
			}

			if (node.children) {
				for (const child of node.children) {
					if (findAndExpand(child, [...path, node.nodeId])) {
						return true;
					}
				}
			}
			return false;
		};

		if (this.domTree) {
			findAndExpand(this.domTree, []);
		}
	}

	// ============================================
	// Changes Tab (Pending DOM Moves)
	// ============================================

	private renderChangesTab(): void {
		const content = this.tabContents.get('changes');
		if (!content) {
			return;
		}

		// Clear content (CSP-safe)
		while (content.firstChild) {
			content.removeChild(content.firstChild);
		}

		if (this.pendingMoves.length === 0) {
			// Empty state
			const empty = document.createElement('div');
			empty.style.cssText = `
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				padding: 40px 20px;
				text-align: center;
				color: var(--vscode-descriptionForeground);
			`;

			const icon = document.createElement('div');
			icon.style.cssText = `font-size: 32px; margin-bottom: 12px; opacity: 0.5;`;
			icon.textContent = '✓';
			empty.appendChild(icon);

			const hint = document.createElement('div');
			hint.style.cssText = `font-size: 13px; line-height: 1.5;`;
			hint.textContent = 'No pending changes';
			empty.appendChild(hint);

			const subHint = document.createElement('div');
			subHint.style.cssText = `font-size: 11px; margin-top: 8px; opacity: 0.7;`;
			subHint.textContent = 'Drag elements to reorder them';
			empty.appendChild(subHint);

			content.appendChild(empty);
			return;
		}

		// Container for the list and footer
		const container = document.createElement('div');
		container.style.cssText = `
			display: flex;
			flex-direction: column;
			height: 100%;
		`;

		// List of pending moves
		const list = document.createElement('div');
		list.style.cssText = `
			flex: 1;
			overflow-y: auto;
		`;

		this.pendingMoves.forEach((move) => {
			const item = this.createMoveItem(move);
			list.appendChild(item);
		});

		container.appendChild(list);

		// Footer with action buttons
		const footer = document.createElement('div');
		footer.style.cssText = `
			display: flex;
			gap: 8px;
			padding: 10px 12px;
			border-top: 1px solid var(--vscode-sideBar-border);
			background: var(--vscode-sideBarSectionHeader-background);
			flex-shrink: 0;
		`;

		const undoAllBtn = this.createChangesActionButton('Discard All', 'secondary', () => {
			this.callbacks.onUndoAll?.();
		});

		const applyAllBtn = this.createChangesActionButton('Apply All', 'primary', () => {
			this.callbacks.onApplyAll?.();
		});

		footer.appendChild(undoAllBtn);
		footer.appendChild(applyAllBtn);
		container.appendChild(footer);

		content.appendChild(container);
	}

	/**
	 * Create a move item row for the changes list
	 */
	private createMoveItem(move: PendingMove): HTMLElement {
		const item = document.createElement('div');
		item.style.cssText = `
			display: flex;
			align-items: center;
			padding: 8px 12px;
			border-bottom: 1px solid var(--vscode-sideBar-border);
			gap: 8px;
		`;

		// Icon
		const icon = document.createElement('span');
		icon.style.cssText = `
			font-size: 14px;
			opacity: 0.8;
		`;
		icon.className = 'codicon codicon-arrow-both';

		// Info
		const info = document.createElement('div');
		info.style.cssText = `
			flex: 1;
			min-width: 0;
		`;

		const elementName = document.createElement('div');
		elementName.style.cssText = `
			font-size: 12px;
			font-weight: 500;
			color: var(--vscode-foreground);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		`;
		elementName.textContent = `<${move.elementTagName}>`;
		elementName.title = move.elementSelector;

		const details = document.createElement('div');
		details.style.cssText = `
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		`;

		// Format: "moved to .container" or "reordered in .parent"
		if (move.fromParent === move.toParent) {
			details.textContent = `reordered: ${move.fromIndex} \u2192 ${move.toIndex}`;
		} else {
			details.textContent = `moved to ${this.shortenSelector(move.toParent)}`;
		}
		details.title = `From: ${move.fromParent}[${move.fromIndex}]\nTo: ${move.toParent}[${move.toIndex}]`;

		info.appendChild(elementName);
		info.appendChild(details);

		// Undo button
		const undoBtn = document.createElement('button');
		undoBtn.style.cssText = `
			background: transparent;
			border: 1px solid var(--vscode-button-secondaryBorder, var(--vscode-sideBar-border));
			color: var(--vscode-button-secondaryForeground);
			padding: 3px 8px;
			font-size: 11px;
			border-radius: 3px;
			cursor: pointer;
		`;
		undoBtn.textContent = 'Undo';
		undoBtn.addEventListener('mouseenter', () => {
			undoBtn.style.background = 'var(--vscode-button-secondaryHoverBackground)';
		});
		undoBtn.addEventListener('mouseleave', () => {
			undoBtn.style.background = 'transparent';
		});
		undoBtn.addEventListener('click', () => this.callbacks.onUndoMove?.(move.id));

		item.appendChild(icon);
		item.appendChild(info);
		item.appendChild(undoBtn);

		return item;
	}

	/**
	 * Create an action button for the changes footer
	 */
	private createChangesActionButton(
		text: string,
		type: 'primary' | 'secondary',
		onClick: () => void
	): HTMLElement {
		const btn = document.createElement('button');
		btn.style.cssText = `
			flex: 1;
			padding: 6px 12px;
			font-size: 12px;
			border-radius: 3px;
			cursor: pointer;
			border: none;
		`;

		if (type === 'primary') {
			btn.style.background = 'var(--vscode-button-background)';
			btn.style.color = 'var(--vscode-button-foreground)';
			btn.addEventListener('mouseenter', () => {
				btn.style.background = 'var(--vscode-button-hoverBackground)';
			});
			btn.addEventListener('mouseleave', () => {
				btn.style.background = 'var(--vscode-button-background)';
			});
		} else {
			btn.style.background = 'var(--vscode-button-secondaryBackground)';
			btn.style.color = 'var(--vscode-button-secondaryForeground)';
			btn.addEventListener('mouseenter', () => {
				btn.style.background = 'var(--vscode-button-secondaryHoverBackground)';
			});
			btn.addEventListener('mouseleave', () => {
				btn.style.background = 'var(--vscode-button-secondaryBackground)';
			});
		}

		btn.textContent = text;
		btn.addEventListener('click', onClick);

		return btn;
	}

	/**
	 * Shorten a selector for display
	 */
	private shortenSelector(selector: string): string {
		// Take last part if it's a complex selector
		const parts = selector.split(' ');
		const last = parts[parts.length - 1];
		// Truncate if too long
		if (last.length > 20) {
			return last.substring(0, 17) + '...';
		}
		return last;
	}

	// ============================================
	// Resize Handle
	// ============================================

	private createResizeHandle(): HTMLElement {
		const handle = document.createElement('div');
		handle.className = 'roopik-style-inspect-resize-handle';
		handle.style.cssText = `
			position: absolute;
			left: 0;
			top: 0;
			width: 4px;
			height: 100%;
			cursor: ew-resize;
			background: transparent;
			z-index: 10;
			transition: background 0.15s;
		`;

		handle.addEventListener('mouseenter', () => {
			handle.style.background = 'var(--vscode-focusBorder)';
		});
		handle.addEventListener('mouseleave', () => {
			if (!this.isResizing) {
				handle.style.background = 'transparent';
			}
		});

		return handle;
	}

	/**
	 * Apply VS Code-style scrollbar to an element
	 * Creates thin, dark, sleek scrollbars matching the IDE theme
	 */
	private applyScrollbarStyles(element: HTMLElement): void {
		// Create a style element for this specific scrollbar
		const styleId = `scrollbar-style-${Math.random().toString(36).substr(2, 9)}`;
		element.setAttribute('data-scrollbar-id', styleId);

		const style = document.createElement('style');
		style.textContent = `
			[data-scrollbar-id="${styleId}"]::-webkit-scrollbar {
				width: 10px;
				height: 10px;
			}

			[data-scrollbar-id="${styleId}"]::-webkit-scrollbar-track {
				background: transparent;
			}

			[data-scrollbar-id="${styleId}"]::-webkit-scrollbar-thumb {
				background: var(--vscode-scrollbarSlider-background);
				border-radius: 10px;
				border: 2px solid transparent;
				background-clip: padding-box;
			}

			[data-scrollbar-id="${styleId}"]::-webkit-scrollbar-thumb:hover {
				background: var(--vscode-scrollbarSlider-hoverBackground);
				border-radius: 10px;
				border: 2px solid transparent;
				background-clip: padding-box;
			}

			[data-scrollbar-id="${styleId}"]::-webkit-scrollbar-thumb:active {
				background: var(--vscode-scrollbarSlider-activeBackground);
				border-radius: 10px;
				border: 2px solid transparent;
				background-clip: padding-box;
			}

			/* For Firefox */
			[data-scrollbar-id="${styleId}"] {
				scrollbar-width: thin;
				scrollbar-color: var(--vscode-scrollbarSlider-background) transparent;
			}
		`;

		// Use mainWindow.document.head for multi-window support
		mainWindow.document.head.appendChild(style);
	}

	private setupResizeListeners(): void {
		const targetWindow = DOM.getWindow(this.container);
		const targetDocument = targetWindow.document;

		// Horizontal resize (panel width)
		this.resizeHandle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			this.isResizing = true;
			this.resizeStartX = e.clientX;
			this.resizeStartWidth = this.currentWidth;
			this.resizeHandle.style.background = 'var(--vscode-focusBorder)';
			targetDocument.body.style.cursor = 'ew-resize';
			targetDocument.body.style.userSelect = 'none';
		});

		targetDocument.addEventListener('mousemove', (e: MouseEvent) => {
			// Horizontal resize (panel width)
			if (this.isResizing) {
				const deltaX = this.resizeStartX - e.clientX;
				let newWidth = this.resizeStartWidth + deltaX;
				newWidth = Math.max(StyleInspectPanel.MIN_WIDTH, Math.min(StyleInspectPanel.MAX_WIDTH, newWidth));

				this.currentWidth = newWidth;
				this.container.style.width = `${newWidth}px`;
				this.callbacks.onVisibilityChanged?.(true, newWidth);
			}

			// Vertical resize (components height)
			if (this.isResizingVertical) {
				const deltaY = e.clientY - this.resizeStartY;
				let newHeight = this.resizeStartHeight + deltaY;
				newHeight = Math.max(
					StyleInspectPanel.MIN_COMPONENTS_HEIGHT,
					Math.min(StyleInspectPanel.MAX_COMPONENTS_HEIGHT, newHeight)
				);

				this.componentsHeight = newHeight;
				this.componentsSection.style.height = `${newHeight}px`;
			}
		});

		targetDocument.addEventListener('mouseup', () => {
			if (this.isResizing) {
				this.isResizing = false;
				this.resizeHandle.style.background = 'transparent';
				targetDocument.body.style.cursor = '';
				targetDocument.body.style.userSelect = '';
			}

			if (this.isResizingVertical) {
				this.isResizingVertical = false;
				this.verticalSeparator.style.background = 'var(--vscode-sideBarSectionHeader-background)';
				targetDocument.body.style.cursor = '';
				targetDocument.body.style.userSelect = '';
			}
		});
	}

	// ============================================
	// CSS Tab Helpers (from original implementation)
	// ============================================

	private createEmptyState(): HTMLElement {
		const container = document.createElement('div');
		container.style.cssText = `
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			padding: 40px 20px;
			text-align: center;
			color: var(--vscode-descriptionForeground);
		`;

		const icon = document.createElement('div');
		icon.style.cssText = `font-size: 32px; margin-bottom: 12px; opacity: 0.5;`;
		icon.textContent = '🎯';
		container.appendChild(icon);

		const hint = document.createElement('div');
		hint.style.cssText = `font-size: 13px; line-height: 1.5;`;
		hint.textContent = 'Use Inspect Mode to select an element';
		container.appendChild(hint);

		const subHint = document.createElement('div');
		subHint.style.cssText = `font-size: 11px; margin-top: 8px; opacity: 0.7;`;
		subHint.textContent = 'Press ESC to close this panel';
		container.appendChild(subHint);

		return container;
	}

	private createElementSection(data: ElementStyleInfo): HTMLElement {
		const section = this.createCollapsibleSection('element', 'Element');

		const tagContainer = document.createElement('div');
		tagContainer.style.cssText = `
			font-family: var(--vscode-editor-font-family), monospace;
			font-size: 12px;
			padding: 8px 0;
			word-break: break-all;
		`;

		const tagSpan = document.createElement('span');
		tagSpan.style.color = 'var(--vscode-symbolIcon-classForeground)';

		let elementStr = `<${data.tagName}`;
		if (data.id) {
			elementStr += ` id="${data.id}"`;
		}
		if (data.classes.length > 0) {
			elementStr += ` class="${data.classes.join(' ')}"`;
		}
		elementStr += '>';
		tagSpan.textContent = elementStr;

		tagContainer.appendChild(tagSpan);
		section.content.appendChild(tagContainer);

		if (this.isProjectMode && (data.componentName || data.htmlSource)) {
			const rowContainer = document.createElement('div');
			rowContainer.style.cssText = `
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 8px;
				margin-bottom: 4px;
			`;

			if (data.componentName) {
				const componentBadge = document.createElement('div');
				componentBadge.style.cssText = `
					display: inline-flex;
					align-items: center;
					gap: 4px;
					background: var(--vscode-badge-background);
					color: var(--vscode-badge-foreground);
					padding: 2px 8px;
					border-radius: 10px;
					font-size: 11px;
				`;
				componentBadge.textContent = `⚛ ${data.componentName}`;
				rowContainer.appendChild(componentBadge);
			} else {
				rowContainer.appendChild(document.createElement('div'));
			}

			if (data.htmlSource) {
				const btn = this.createButton('Open in Editor', () => {
					this.callbacks.onOpenFile(data.htmlSource!);
				});
				// Add file icon using codicon
				const icon = document.createElement('span');
				icon.className = 'codicon codicon-file';
				icon.style.cssText = 'margin-right: 4px;';
				btn.insertBefore(icon, btn.firstChild);
				btn.title = `${data.htmlSource.file}:${data.htmlSource.line}`;
				btn.style.marginBottom = '0';
				rowContainer.appendChild(btn);
			}

			section.content.appendChild(rowContainer);
		}

		return section.element;
	}

	private createCssInJsNotice(cssInJs: NonNullable<ElementStyleInfo['cssInJs']>): HTMLElement {
		const notice = document.createElement('div');
		notice.style.cssText = `
			padding: 8px 12px;
			background: var(--vscode-inputValidation-infoBackground);
			border-left: 3px solid var(--vscode-inputValidation-infoBorder);
			margin: 8px 12px;
			font-size: 11px;
		`;

		const libraryName = cssInJs.library || 'CSS-in-JS';

		const titleDiv = document.createElement('div');
		titleDiv.style.cssText = 'font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;';
		const icon = document.createElement('span');
		icon.className = 'codicon codicon-paintbrush';
		titleDiv.appendChild(icon);
		titleDiv.appendChild(document.createTextNode(`${libraryName} Detected`));
		notice.appendChild(titleDiv);

		const descDiv = document.createElement('div');
		descDiv.style.opacity = '0.8';
		descDiv.textContent = 'Styles are defined in the component file.' +
			(cssInJs.componentFile ? ' Click "Open in Editor" to edit.' : '');
		notice.appendChild(descDiv);

		return notice;
	}

	private createStylesSection(properties: ResolvedCSSProperty[]): HTMLElement {
		const grouped = this.groupPropertiesBySource(properties);
		const section = this.createCollapsibleSection('styles', `All Computed (${properties.length})`);

		for (const [sourceType, props] of grouped) {
			const groupEl = this.createPropertyGroup(sourceType, props);
			section.content.appendChild(groupEl);
		}

		return section.element;
	}

	private groupPropertiesBySource(properties: ResolvedCSSProperty[]): Map<CSSSourceType, ResolvedCSSProperty[]> {
		const groups = new Map<CSSSourceType, ResolvedCSSProperty[]>();
		for (const prop of properties) {
			const type = prop.sourceType;
			if (!groups.has(type)) {
				groups.set(type, []);
			}
			groups.get(type)!.push(prop);
		}
		return groups;
	}

	private createPropertyGroup(sourceType: CSSSourceType, properties: ResolvedCSSProperty[]): HTMLElement {
		const group = document.createElement('div');
		group.style.cssText = `margin-bottom: 12px;`;

		const header = document.createElement('div');
		header.style.cssText = `
			font-size: 10px;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
			margin-bottom: 4px;
			padding-bottom: 4px;
			border-bottom: 1px solid var(--vscode-widget-border);
		`;
		header.textContent = this.getSourceTypeLabel(sourceType);
		group.appendChild(header);

		const list = document.createElement('div');
		list.style.cssText = `
			font-family: var(--vscode-editor-font-family), monospace;
			font-size: 13px;
		`;

		for (const prop of properties) {
			const row = this.createPropertyRow(prop);
			list.appendChild(row);
		}

		group.appendChild(list);
		return group;
	}

	private getSourceTypeLabel(sourceType: CSSSourceType): string {
		switch (sourceType) {
			case 'css-file': return 'CSS Files';
			case 'scss-file': return 'SCSS Files';
			case 'less-file': return 'LESS Files';
			case 'inline': return 'Inline Styles';
			case 'css-in-js': return 'CSS-in-JS';
			case 'inherited': return 'Inherited';
			case 'user-agent': return 'Browser Defaults';
			default: return 'Other';
		}
	}

	private createPropertyRow(prop: ResolvedCSSProperty): HTMLElement {
		const row = document.createElement('div');
		row.style.cssText = `
			display: flex;
			align-items: flex-start;
			padding: 3px 0;
			gap: 8px;
			font-size: 13px;
			${prop.isOverridden ? 'opacity: 0.5;' : ''}
		`;

		const name = document.createElement('span');
		name.style.cssText = `
			color: var(--vscode-symbolIcon-propertyForeground);
			min-width: 110px;
			flex-shrink: 0;
			${prop.isOverridden ? 'text-decoration: line-through;' : ''}
		`;
		name.textContent = prop.name;
		row.appendChild(name);

		const value = document.createElement('span');
		value.style.cssText = `
			color: var(--vscode-symbolIcon-stringForeground);
			flex: 1;
			word-break: break-all;
			${prop.isOverridden ? 'text-decoration: line-through;' : ''}
		`;
		value.textContent = prop.value;

		if (prop.isImportant) {
			const importantSpan = document.createElement('span');
			importantSpan.style.color = 'var(--vscode-errorForeground)';
			importantSpan.textContent = ' !important';
			value.appendChild(importantSpan);
		}
		row.appendChild(value);

		const sourceContainer = document.createElement('div');
		sourceContainer.style.cssText = `display: flex; align-items: center; gap: 4px; flex-shrink: 0;`;

		if (prop.location && (prop.sourceType === 'css-file' || prop.sourceType === 'scss-file' || prop.sourceType === 'less-file')) {
			const link = document.createElement('a');
			link.style.cssText = `
				color: var(--vscode-textLink-foreground);
				cursor: pointer;
				font-size: 10px;
				white-space: nowrap;
				text-decoration: none;
			`;
			link.addEventListener('mouseenter', () => { link.style.textDecoration = 'underline'; });
			link.addEventListener('mouseleave', () => { link.style.textDecoration = 'none'; });

			const fileName = prop.location.file.split(/[/\\]/).pop() || 'file';
			link.textContent = `${fileName}:${prop.location.line}`;
			link.title = `${prop.location.file}:${prop.location.line}`;
			link.addEventListener('click', (e) => {
				e.preventDefault();
				this.callbacks.onOpenFile(prop.location!);
			});
			sourceContainer.appendChild(link);
		}

		row.appendChild(sourceContainer);
		return row;
	}

	private createRulesSection(rules: MatchedCSSRule[], title: string = 'CSS Rules', sectionId: string = 'rules'): HTMLElement {
		const section = this.createCollapsibleSection(sectionId, `${title} (${rules.length})`);

		for (const rule of rules) {
			const ruleEl = this.createRuleElement(rule);
			section.content.appendChild(ruleEl);
		}

		return section.element;
	}

	private createRuleElement(rule: MatchedCSSRule): HTMLElement {
		const el = document.createElement('div');
		el.style.cssText = `
			margin-bottom: 12px;
			font-family: var(--vscode-editor-font-family), monospace;
			font-size: 13px;
		`;

		const header = document.createElement('div');
		header.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			gap: 8px;
			margin-bottom: 4px;
		`;

		const selector = document.createElement('span');
		selector.style.cssText = `color: var(--vscode-symbolIcon-classForeground); word-break: break-all;`;
		selector.textContent = rule.selector;
		header.appendChild(selector);

		if (this.isProjectMode) {
			const fileLink = document.createElement('a');
			fileLink.style.cssText = `
				color: var(--vscode-textLink-foreground);
				cursor: pointer;
				font-size: 10px;
				white-space: nowrap;
				text-decoration: none;
				flex-shrink: 0;
			`;
			fileLink.addEventListener('mouseenter', () => { fileLink.style.textDecoration = 'underline'; });
			fileLink.addEventListener('mouseleave', () => { fileLink.style.textDecoration = 'none'; });

			const fileName = rule.file.split(/[/\\]/).pop() || 'file';
			fileLink.textContent = `→ ${fileName}:${rule.location.line}`;
			fileLink.title = `${rule.file}:${rule.location.line}`;
			fileLink.addEventListener('click', (e) => {
				e.preventDefault();
				this.callbacks.onOpenFile(rule.location);
			});
			header.appendChild(fileLink);
		} else {
			const sourceLabel = document.createElement('span');
			sourceLabel.style.cssText = `color: var(--vscode-descriptionForeground); font-size: 10px; white-space: nowrap; flex-shrink: 0;`;
			sourceLabel.textContent = `→ <inline-style>`;
			header.appendChild(sourceLabel);
		}

		el.appendChild(header);

		const props = document.createElement('div');
		props.style.cssText = `padding-left: 12px; color: var(--vscode-descriptionForeground);`;

		for (const prop of rule.properties) {
			const propLine = document.createElement('div');
			let propStyles = 'padding: 2px 0;';
			if (prop.isOverridden) {
				propStyles += ' text-decoration: line-through; opacity: 0.5;';
			} else if (prop.isNotInheritable) {
				propStyles += ' opacity: 0.5;';
			}
			propLine.style.cssText = propStyles;
			propLine.textContent = `${prop.name}: ${prop.value}${prop.isImportant ? ' !important' : ''};`;
			props.appendChild(propLine);
		}

		el.appendChild(props);
		return el;
	}

	private createInlineStylesSection(inlineStyles: ElementStyleInfo['inlineStyles']): HTMLElement {
		const section = this.createCollapsibleSection('inline', `Inline Styles (${inlineStyles.length})`);

		const list = document.createElement('div');
		list.style.cssText = `font-family: var(--vscode-editor-font-family), monospace; font-size: 11px;`;

		for (const style of inlineStyles) {
			const row = document.createElement('div');
			row.style.cssText = `display: flex; padding: 3px 0; gap: 8px;`;

			const name = document.createElement('span');
			name.style.cssText = `color: var(--vscode-symbolIcon-propertyForeground); min-width: 110px;`;
			name.textContent = style.name;
			row.appendChild(name);

			const value = document.createElement('span');
			value.style.cssText = `color: var(--vscode-symbolIcon-stringForeground);`;
			value.textContent = style.value;
			row.appendChild(value);

			list.appendChild(row);
		}

		section.content.appendChild(list);
		return section.element;
	}

	private createInheritedSection(inheritedStyles: NonNullable<ElementStyleInfo['inheritedStyles']>): HTMLElement {
		const totalRules = inheritedStyles.reduce((sum, i) => sum + i.matchedRules.length, 0);
		const section = this.createCollapsibleSection('inherited', `Inherited (${totalRules})`);

		for (const inherited of inheritedStyles) {
			const parentHeader = document.createElement('div');
			parentHeader.style.cssText = `
				font-size: 11px;
				color: var(--vscode-descriptionForeground);
				padding: 8px 0 4px 0;
				border-top: 1px solid var(--vscode-widget-border);
				margin-top: 8px;
			`;
			parentHeader.textContent = `Inherited from ${inherited.fromElement}`;
			section.content.appendChild(parentHeader);

			for (const rule of inherited.matchedRules) {
				const ruleEl = this.createRuleElement(rule);
				section.content.appendChild(ruleEl);
			}

			if (inherited.inlineStyle && inherited.inlineStyle.length > 0) {
				const inlineHeader = document.createElement('div');
				inlineHeader.style.cssText = `font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 8px; margin-bottom: 4px;`;
				inlineHeader.textContent = 'element.style';
				section.content.appendChild(inlineHeader);

				const list = document.createElement('div');
				list.style.cssText = `font-family: var(--vscode-editor-font-family), monospace; font-size: 13px; padding-left: 12px;`;

				for (const style of inherited.inlineStyle) {
					const row = document.createElement('div');
					row.style.cssText = `padding: 2px 0;`;
					row.textContent = `${style.name}: ${style.value};`;
					list.appendChild(row);
				}

				section.content.appendChild(list);
			}
		}

		return section.element;
	}

	private createCollapsibleSection(id: string, title: string): { element: HTMLElement; content: HTMLElement } {
		const section = document.createElement('div');
		section.style.cssText = `border-bottom: 1px solid var(--vscode-sideBar-border);`;

		const header = document.createElement('div');
		header.style.cssText = `
			padding: 8px 12px;
			display: flex;
			align-items: center;
			gap: 6px;
			cursor: pointer;
			user-select: none;
			background: var(--vscode-sideBarSectionHeader-background);
		`;
		header.addEventListener('mouseenter', () => { header.style.background = 'var(--vscode-list-hoverBackground)'; });
		header.addEventListener('mouseleave', () => { header.style.background = 'var(--vscode-sideBarSectionHeader-background)'; });

		const chevron = document.createElement('span');
		chevron.style.cssText = `
			font-size: 10px;
			transition: transform 0.15s;
			${this.expandedSections.has(id) ? 'transform: rotate(90deg);' : ''}
		`;
		chevron.className = 'codicon codicon-chevron-right';
		header.appendChild(chevron);

		const titleEl = document.createElement('span');
		titleEl.style.cssText = `
			font-weight: 600;
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--vscode-sideBarSectionHeader-foreground);
		`;
		titleEl.textContent = title;
		header.appendChild(titleEl);

		section.appendChild(header);

		const content = document.createElement('div');
		content.style.cssText = `padding: 8px 12px; display: ${this.expandedSections.has(id) ? 'block' : 'none'};`;
		section.appendChild(content);

		header.addEventListener('click', () => {
			const isExpanded = this.expandedSections.has(id);
			if (isExpanded) {
				this.expandedSections.delete(id);
				content.style.display = 'none';
				chevron.style.transform = '';
			} else {
				this.expandedSections.add(id);
				content.style.display = 'block';
				chevron.style.transform = 'rotate(90deg)';
			}
		});

		return { element: section, content };
	}

	private createButton(text: string, onClick: () => void): HTMLElement {
		const btn = document.createElement('button');
		btn.style.cssText = `
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none;
			padding: 6px 12px;
			cursor: pointer;
			font-size: 12px;
			display: flex;
			align-items: center;
			gap: 6px;
			border-radius: 2px;
			transition: background 0.15s;
		`;
		btn.textContent = text;
		btn.addEventListener('mouseenter', () => {
			btn.style.background = 'var(--vscode-button-secondaryHoverBackground)';
		});
		btn.addEventListener('mouseleave', () => {
			btn.style.background = 'var(--vscode-button-secondaryBackground)';
		});
		btn.addEventListener('click', onClick);
		return btn;
	}
}
