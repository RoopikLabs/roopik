/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type {
	ElementStyleInfo,
	ResolvedCSSProperty,
	MatchedCSSRule,
	CSSSourceLocation,
	CSSSourceType
} from '../../../common/cssResolvers/types.js';

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
}

/**
 * Tab identifiers
 */
type TabId = 'css' | 'design' | 'components';

/**
 * Style Inspect Panel (Tabbed)
 *
 * Three-tab panel for element inspection:
 * - CSS: Current styles panel (Element, Inline, Rules, Inherited)
 * - Design: Figma-like Position/Layout/Dimensions editors (stub for now)
 * - Components: DOM tree from CDP, expandable, synced with inspect
 *
 * Uses VSCode theming variables for consistent appearance.
 */
export class StyleInspectPanel {
	private container: HTMLElement;
	private headerContainer: HTMLElement;
	private tabBar: HTMLElement;
	private contentContainer: HTMLElement;
	private resizeHandle: HTMLElement;
	private isVisible: boolean = false;
	private currentData: ElementStyleInfo | null = null;

	// Panel size constants
	private static readonly DEFAULT_WIDTH = 320;
	private static readonly MIN_WIDTH = 200;
	private static readonly MAX_WIDTH = 600;

	// Current width (persisted during session)
	private currentWidth: number = StyleInspectPanel.DEFAULT_WIDTH;

	// Project mode flag - when false, file links are disabled
	private isProjectMode: boolean = false;

	// Resize state
	private isResizing: boolean = false;
	private resizeStartX: number = 0;
	private resizeStartWidth: number = 0;

	// Tab state
	private activeTab: TabId = 'css';
	private tabButtons: Map<TabId, HTMLElement> = new Map();
	private tabContents: Map<TabId, HTMLElement> = new Map();

	// Collapsible section states for CSS tab
	private expandedSections = new Set<string>(['element', 'inline', 'rules']);

	// DOM tree data for Components tab
	private domTree: DOMTreeNode | null = null;
	private selectedNodeId: number | null = null;
	private expandedNodes = new Set<number>();

	constructor(
		private readonly parent: HTMLElement,
		private readonly callbacks: IStyleInspectPanelCallbacks
	) {
		this.container = this.createContainer();

		// Create resize handle (on left edge of panel)
		this.resizeHandle = this.createResizeHandle();
		this.container.appendChild(this.resizeHandle);

		// Header with title and close button
		this.headerContainer = this.createHeaderContainer();
		this.container.appendChild(this.headerContainer);

		// Tab bar
		this.tabBar = this.createTabBar();
		this.container.appendChild(this.tabBar);

		// Content container (holds tab contents)
		this.contentContainer = document.createElement('div');
		this.contentContainer.className = 'style-inspect-content';
		this.contentContainer.style.cssText = `
			flex: 1;
			overflow-y: auto;
			overflow-x: hidden;
		`;
		this.container.appendChild(this.contentContainer);

		// Create tab content containers
		this.createTabContents();

		this.parent.appendChild(this.container);

		// Setup resize event listeners
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
	 * Set DOM tree for Components tab
	 */
	setDOMTree(tree: DOMTreeNode): void {
		this.domTree = tree;
		if (this.activeTab === 'components') {
			this.renderComponentsTab();
		}
	}

	/**
	 * Highlight a node in the Components tree (called when user selects element in browser)
	 */
	highlightTreeNode(nodeId: number): void {
		this.selectedNodeId = nodeId;
		// Expand parent nodes to make selected node visible
		this.expandParentsOfNode(nodeId);
		if (this.activeTab === 'components') {
			this.renderComponentsTab();
		}
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
		closeBtn.textContent = '✕';
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
			border-bottom: 1px solid var(--vscode-sideBar-border);
			background: var(--vscode-sideBar-background);
			flex-shrink: 0;
		`;

		const tabs: { id: TabId; label: string }[] = [
			{ id: 'css', label: 'CSS' },
			{ id: 'design', label: 'Design' },
			{ id: 'components', label: 'Components' }
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
			flex: 1;
			padding: 8px 12px;
			border: none;
			background: transparent;
			color: var(--vscode-foreground);
			font-size: 12px;
			font-weight: 500;
			cursor: pointer;
			opacity: 0.7;
			transition: opacity 0.15s, border-bottom 0.15s;
			border-bottom: 2px solid transparent;
		`;
		btn.textContent = label;

		if (id === this.activeTab) {
			btn.style.opacity = '1';
			btn.style.borderBottom = '2px solid var(--vscode-focusBorder)';
		}

		btn.addEventListener('mouseenter', () => {
			if (id !== this.activeTab) {
				btn.style.opacity = '0.9';
			}
		});
		btn.addEventListener('mouseleave', () => {
			if (id !== this.activeTab) {
				btn.style.opacity = '0.7';
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
			prevBtn.style.borderBottom = '2px solid transparent';
		}

		const newBtn = this.tabButtons.get(tabId);
		if (newBtn) {
			newBtn.style.opacity = '1';
			newBtn.style.borderBottom = '2px solid var(--vscode-focusBorder)';
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

		// Components tab content
		const componentsContent = document.createElement('div');
		componentsContent.className = 'tab-content-components';
		componentsContent.style.display = 'none';
		this.tabContents.set('components', componentsContent);
		this.contentContainer.appendChild(componentsContent);
	}

	private renderActiveTab(): void {
		switch (this.activeTab) {
			case 'css':
				this.renderCssTab();
				break;
			case 'design':
				this.renderDesignTab();
				break;
			case 'components':
				this.renderComponentsTab();
				break;
		}
	}

	// ============================================
	// CSS Tab (existing functionality)
	// ============================================

	private renderCssTab(): void {
		const content = this.tabContents.get('css');
		if (!content) return;

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
	// Design Tab (stub - future Figma-like editing)
	// ============================================

	private renderDesignTab(): void {
		const content = this.tabContents.get('design');
		if (!content) return;

		// Clear content
		while (content.firstChild) {
			content.removeChild(content.firstChild);
		}

		// Stub message
		const stub = document.createElement('div');
		stub.style.cssText = `
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
		icon.textContent = '🎨';
		stub.appendChild(icon);

		const title = document.createElement('div');
		title.style.cssText = `font-size: 13px; font-weight: 600; margin-bottom: 8px;`;
		title.textContent = 'Visual Design Editor';
		stub.appendChild(title);

		const desc = document.createElement('div');
		desc.style.cssText = `font-size: 11px; opacity: 0.7; line-height: 1.5;`;
		desc.textContent = 'Figma-like visual editing for Position, Layout, Dimensions, Padding, and Margin. Coming soon!';
		stub.appendChild(desc);

		// Preview of what's coming (non-functional)
		const preview = this.createDesignTabPreview();
		stub.appendChild(preview);

		content.appendChild(stub);
	}

	private createDesignTabPreview(): HTMLElement {
		const preview = document.createElement('div');
		preview.style.cssText = `
			margin-top: 20px;
			padding: 16px;
			background: var(--vscode-editor-background);
			border-radius: 4px;
			width: 100%;
			opacity: 0.5;
		`;

		// Position section
		const posSection = document.createElement('div');
		posSection.style.cssText = `margin-bottom: 16px;`;

		const posLabel = document.createElement('div');
		posLabel.style.cssText = `font-size: 10px; text-transform: uppercase; margin-bottom: 8px; opacity: 0.7;`;
		posLabel.textContent = 'Position';
		posSection.appendChild(posLabel);

		const posInputs = document.createElement('div');
		posInputs.style.cssText = `display: flex; gap: 8px;`;
		posInputs.appendChild(this.createMiniInput('X', '0'));
		posInputs.appendChild(this.createMiniInput('Y', '0'));
		posSection.appendChild(posInputs);
		preview.appendChild(posSection);

		// Dimensions section
		const dimSection = document.createElement('div');
		dimSection.style.cssText = `margin-bottom: 16px;`;

		const dimLabel = document.createElement('div');
		dimLabel.style.cssText = `font-size: 10px; text-transform: uppercase; margin-bottom: 8px; opacity: 0.7;`;
		dimLabel.textContent = 'Dimensions';
		dimSection.appendChild(dimLabel);

		const dimInputs = document.createElement('div');
		dimInputs.style.cssText = `display: flex; gap: 8px;`;
		dimInputs.appendChild(this.createMiniInput('W', 'auto'));
		dimInputs.appendChild(this.createMiniInput('H', 'auto'));
		dimSection.appendChild(dimInputs);
		preview.appendChild(dimSection);

		return preview;
	}

	private createMiniInput(label: string, value: string): HTMLElement {
		const container = document.createElement('div');
		container.style.cssText = `flex: 1;`;

		const labelEl = document.createElement('span');
		labelEl.style.cssText = `font-size: 10px; color: var(--vscode-descriptionForeground); margin-right: 4px;`;
		labelEl.textContent = label;
		container.appendChild(labelEl);

		const input = document.createElement('input');
		input.type = 'text';
		input.value = value;
		input.disabled = true;
		input.style.cssText = `
			width: 50px;
			padding: 4px 6px;
			border: 1px solid var(--vscode-input-border);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			font-size: 11px;
			border-radius: 2px;
		`;
		container.appendChild(input);

		return container;
	}

	// ============================================
	// Components Tab (DOM Tree)
	// ============================================

	private renderComponentsTab(): void {
		const content = this.tabContents.get('components');
		if (!content) return;

		// Clear content
		while (content.firstChild) {
			content.removeChild(content.firstChild);
		}

		if (!this.domTree) {
			// Empty state - waiting for DOM tree
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
			icon.textContent = '🌲';
			empty.appendChild(icon);

			const hint = document.createElement('div');
			hint.style.cssText = `font-size: 13px; line-height: 1.5;`;
			hint.textContent = 'DOM tree will appear here';
			empty.appendChild(hint);

			const subHint = document.createElement('div');
			subHint.style.cssText = `font-size: 11px; margin-top: 8px; opacity: 0.7;`;
			subHint.textContent = 'Navigate to a page to see the component structure';
			empty.appendChild(subHint);

			content.appendChild(empty);
			return;
		}

		// Render tree
		const treeContainer = document.createElement('div');
		treeContainer.style.cssText = `
			font-family: var(--vscode-editor-font-family), monospace;
			font-size: 12px;
			padding: 8px 0;
		`;

		this.renderTreeNode(treeContainer, this.domTree, 0);
		content.appendChild(treeContainer);
	}

	private renderTreeNode(container: HTMLElement, node: DOMTreeNode, depth: number): void {
		const row = document.createElement('div');
		const isSelected = node.nodeId === this.selectedNodeId;
		const isExpanded = this.expandedNodes.has(node.nodeId);
		const hasChildren = node.children && node.children.length > 0;

		row.style.cssText = `
			display: flex;
			align-items: center;
			padding: 2px 8px 2px ${8 + depth * 16}px;
			cursor: pointer;
			${isSelected ? 'background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground);' : ''}
		`;

		// Hover effect
		if (!isSelected) {
			row.addEventListener('mouseenter', () => {
				row.style.background = 'var(--vscode-list-hoverBackground)';
			});
			row.addEventListener('mouseleave', () => {
				row.style.background = '';
			});
		}

		// Expand/collapse chevron
		const chevron = document.createElement('span');
		chevron.style.cssText = `
			width: 16px;
			font-size: 10px;
			opacity: ${hasChildren ? '1' : '0'};
			transition: transform 0.15s;
			${isExpanded ? 'transform: rotate(90deg);' : ''}
		`;
		chevron.textContent = '▶';

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
			this.renderComponentsTab();
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
		this.renderComponentsTab();
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

	private setupResizeListeners(): void {
		this.resizeHandle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			this.isResizing = true;
			this.resizeStartX = e.clientX;
			this.resizeStartWidth = this.currentWidth;
			this.resizeHandle.style.background = 'var(--vscode-focusBorder)';
			document.body.style.cursor = 'ew-resize';
			document.body.style.userSelect = 'none';
		});

		document.addEventListener('mousemove', (e) => {
			if (!this.isResizing) return;

			const deltaX = this.resizeStartX - e.clientX;
			let newWidth = this.resizeStartWidth + deltaX;
			newWidth = Math.max(StyleInspectPanel.MIN_WIDTH, Math.min(StyleInspectPanel.MAX_WIDTH, newWidth));

			this.currentWidth = newWidth;
			this.container.style.width = `${newWidth}px`;
			this.callbacks.onVisibilityChanged?.(true, newWidth);
		});

		document.addEventListener('mouseup', () => {
			if (this.isResizing) {
				this.isResizing = false;
				this.resizeHandle.style.background = 'transparent';
				document.body.style.cursor = '';
				document.body.style.userSelect = '';
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
				const btn = this.createButton('📄 Open in Editor', () => {
					this.callbacks.onOpenFile(data.htmlSource!);
				});
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
		titleDiv.style.cssText = 'font-weight: 600; margin-bottom: 4px;';
		titleDiv.textContent = `💅 ${libraryName} Detected`;
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
			font-size: 11px;
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
			font-size: 11px;
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
				list.style.cssText = `font-family: var(--vscode-editor-font-family), monospace; font-size: 11px; padding-left: 12px;`;

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
		chevron.textContent = '▶';
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
