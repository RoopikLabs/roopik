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
}

/**
 * Style Inspect Panel
 *
 * Displays complete CSS source information for an inspected element.
 * Features:
 * - Element info (tag, classes, id) with source link
 * - Computed styles grouped by source type
 * - Matched CSS rules with file:line links
 * - Overridden property indicators
 * - Inline edit capability (optional)
 * - CSS-in-JS detection notice
 *
 * Uses VSCode theming variables for consistent appearance.
 */
export class StyleInspectPanel {
	private container: HTMLElement;
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

	// Collapsible section states - prioritize element-specific styles
	// 'element', 'inline', 'rules' are expanded by default (top priority)
	// 'inherited', 'resets', 'styles' are collapsed by default (less important)
	private expandedSections = new Set<string>(['element', 'inline', 'rules']);

	// NOTE: ESC key handling has been moved to centralized key handler in editor.ts
	// Keys from BrowserView are intercepted by Electron's before-input-event
	// and forwarded via IPC for unified handling

	constructor(
		private readonly parent: HTMLElement,
		private readonly callbacks: IStyleInspectPanelCallbacks
	) {
		this.container = this.createContainer();

		// Create resize handle (on left edge of panel)
		this.resizeHandle = this.createResizeHandle();
		this.container.appendChild(this.resizeHandle);

		// Content container
		this.contentContainer = document.createElement('div');
		this.contentContainer.className = 'style-inspect-content';
		this.contentContainer.style.cssText = `
			flex: 1;
			overflow-y: auto;
			overflow-x: hidden;
		`;
		this.container.appendChild(this.contentContainer);
		this.parent.appendChild(this.container);

		// Setup resize event listeners
		this.setupResizeListeners();

		// NOTE: ESC key handling is done centrally in editor.ts via onBrowserKeyPress
	}

	/**
	 * Show panel with element style information
	 * @param data Element style data
	 * @param isProjectMode When true, file links are clickable; when false, links are disabled
	 */
	show(data: ElementStyleInfo, isProjectMode: boolean = false): void {
		this.currentData = data;
		this.isProjectMode = isProjectMode;
		this.render();
		this.container.style.display = 'flex';
		this.container.style.width = `${this.currentWidth}px`;
		this.isVisible = true;
		// Notify parent to adjust browser bounds
		this.callbacks.onVisibilityChanged?.(true, this.currentWidth);
	}

	/**
	 * Hide panel
	 */
	hide(): void {
		this.container.style.display = 'none';
		this.isVisible = false;
		this.currentData = null;
		// Notify parent to restore browser bounds
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
			this.render();
		}
	}

	/**
	 * Dispose of the panel
	 */
	dispose(): void {
		// ESC key handling is done centrally in editor.ts - no cleanup needed here
		this.container.remove();
	}

	// ============================================
	// Rendering
	// ============================================

	private render(): void {
		if (!this.currentData) {
			return;
		}

		// Clear content using safe DOM manipulation (no innerHTML for Trusted Types compliance)
		while (this.contentContainer.firstChild) {
			this.contentContainer.removeChild(this.contentContainer.firstChild);
		}

		// Header
		this.contentContainer.appendChild(this.createHeader());

		// Check if this is empty state (no element selected)
		if (!this.currentData.tagName) {
			this.contentContainer.appendChild(this.createEmptyState());
			return;
		}

		// Element section (always first)
		this.contentContainer.appendChild(this.createElementSection(this.currentData));

		// CSS-in-JS notice (if detected)
		if (this.currentData.cssInJs?.detected) {
			this.contentContainer.appendChild(this.createCssInJsNotice(this.currentData.cssInJs));
		}

		// Filter rules: separate element-specific from universal/resets
		const elementSpecificRules = this.currentData.matchedRules.filter(r =>
			r.selector !== '*' && !r.selector.startsWith('*,')
		);
		const resetRules = this.currentData.matchedRules.filter(r =>
			r.selector === '*' || r.selector.startsWith('*,')
		);

		// 1. INLINE STYLES (highest priority - directly on element)
		if (this.currentData.inlineStyles.length > 0) {
			this.contentContainer.appendChild(this.createInlineStylesSection(this.currentData.inlineStyles));
		}

		// 2. ELEMENT-SPECIFIC CSS RULES (what the user wrote for this element)
		if (elementSpecificRules.length > 0) {
			this.contentContainer.appendChild(this.createRulesSection(elementSpecificRules, 'Element Styles'));
		}

		// 3. INHERITED - single section with sub-groups by parent element
		if (this.currentData.inheritedStyles && this.currentData.inheritedStyles.length > 0) {
			this.contentContainer.appendChild(this.createInheritedSection(this.currentData.inheritedStyles));
		}

		// 4. RESET/UNIVERSAL RULES (collapsed by default, less important)
		if (resetRules.length > 0) {
			this.contentContainer.appendChild(this.createRulesSection(resetRules, 'Reset Styles', 'resets'));
		}

		// 5. ALL COMPUTED (collapsed by default - for advanced users)
		if (this.currentData.properties.length > 0) {
			this.contentContainer.appendChild(this.createStylesSection(this.currentData.properties));
		}
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

	/**
	 * Create resize handle on left edge
	 */
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

		// Hover effect
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
	 * Setup resize event listeners
	 */
	private setupResizeListeners(): void {
		// Mouse down on handle starts resize
		this.resizeHandle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			this.isResizing = true;
			this.resizeStartX = e.clientX;
			this.resizeStartWidth = this.currentWidth;
			this.resizeHandle.style.background = 'var(--vscode-focusBorder)';

			// Add body class to prevent text selection during drag
			document.body.style.cursor = 'ew-resize';
			document.body.style.userSelect = 'none';
		});

		// Mouse move updates width
		document.addEventListener('mousemove', (e) => {
			if (!this.isResizing) {
				return;
			}

			// Calculate new width (dragging left = larger panel)
			const deltaX = this.resizeStartX - e.clientX;
			let newWidth = this.resizeStartWidth + deltaX;

			// Clamp to min/max
			newWidth = Math.max(StyleInspectPanel.MIN_WIDTH, Math.min(StyleInspectPanel.MAX_WIDTH, newWidth));

			// Update width
			this.currentWidth = newWidth;
			this.container.style.width = `${newWidth}px`;

			// Notify parent to update browser bounds
			this.callbacks.onVisibilityChanged?.(true, newWidth);
		});

		// Mouse up ends resize
		document.addEventListener('mouseup', () => {
			if (this.isResizing) {
				this.isResizing = false;
				this.resizeHandle.style.background = 'transparent';
				document.body.style.cursor = '';
				document.body.style.userSelect = '';
			}
		});
	}

	/**
	 * Create empty state hint when no element is selected
	 */
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
		icon.style.cssText = `
			font-size: 32px;
			margin-bottom: 12px;
			opacity: 0.5;
		`;
		icon.textContent = '🎯';
		container.appendChild(icon);

		const hint = document.createElement('div');
		hint.style.cssText = `
			font-size: 13px;
			line-height: 1.5;
		`;
		hint.textContent = 'Use Inspect Mode to select an element';
		container.appendChild(hint);

		const subHint = document.createElement('div');
		subHint.style.cssText = `
			font-size: 11px;
			margin-top: 8px;
			opacity: 0.7;
		`;
		subHint.textContent = 'Press ESC to close this panel';
		container.appendChild(subHint);

		return container;
	}

	private createHeader(): HTMLElement {
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
		title.textContent = 'Styles';
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
		closeBtn.title = 'Close panel';
		closeBtn.addEventListener('mouseenter', () => { closeBtn.style.opacity = '1'; });
		closeBtn.addEventListener('mouseleave', () => { closeBtn.style.opacity = '0.7'; });
		closeBtn.addEventListener('click', () => this.hide());
		header.appendChild(closeBtn);

		return header;
	}

	// ============================================
	// Element Section
	// ============================================

	private createElementSection(data: ElementStyleInfo): HTMLElement {
		const section = this.createCollapsibleSection('element', 'Element');

		// Element tag representation
		const tagContainer = document.createElement('div');
		tagContainer.style.cssText = `
			font-family: var(--vscode-editor-font-family), monospace;
			font-size: 12px;
			padding: 8px 0;
			word-break: break-all;
		`;

		// Build element string using safe DOM manipulation
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

		// Component name and Open in Editor button row (only in project mode)
		// Put them on the same row to save vertical space
		if (this.isProjectMode && (data.componentName || data.htmlSource)) {
			const rowContainer = document.createElement('div');
			rowContainer.style.cssText = `
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 8px;
				margin-bottom: 4px;
			`;

			// Component badge (left side)
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
				// Spacer if no component name
				const spacer = document.createElement('div');
				rowContainer.appendChild(spacer);
			}

			// Open in Editor button (right side)
			if (data.htmlSource) {
				const btn = this.createButton('📄 Open in Editor', () => {
					this.callbacks.onOpenFile(data.htmlSource!);
				});
				btn.title = `${data.htmlSource.file}:${data.htmlSource.line}`;
				btn.style.marginBottom = '0'; // Remove bottom margin since row handles spacing
				rowContainer.appendChild(btn);
			}

			section.content.appendChild(rowContainer);
		}

		return section.element;
	}

	// ============================================
	// CSS-in-JS Notice
	// ============================================

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

		// Build notice using safe DOM manipulation
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

	// ============================================
	// Computed Styles Section
	// ============================================

	private createStylesSection(properties: ResolvedCSSProperty[]): HTMLElement {
		// Group properties by source type
		const grouped = this.groupPropertiesBySource(properties);
		const section = this.createCollapsibleSection('styles', `All Computed (${properties.length})`);

		// Create groups
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

		// Group header
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

		// Properties list
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

		// Property name
		const name = document.createElement('span');
		name.style.cssText = `
			color: var(--vscode-symbolIcon-propertyForeground);
			min-width: 110px;
			flex-shrink: 0;
			${prop.isOverridden ? 'text-decoration: line-through;' : ''}
		`;
		name.textContent = prop.name;
		row.appendChild(name);

		// Property value
		const value = document.createElement('span');
		value.style.cssText = `
			color: var(--vscode-symbolIcon-stringForeground);
			flex: 1;
			word-break: break-all;
			${prop.isOverridden ? 'text-decoration: line-through;' : ''}
		`;
		value.textContent = prop.value;

		// Add !important indicator using safe DOM manipulation
		if (prop.isImportant) {
			const importantSpan = document.createElement('span');
			importantSpan.style.color = 'var(--vscode-errorForeground)';
			importantSpan.textContent = ' !important';
			value.appendChild(importantSpan);
		}
		row.appendChild(value);

		// Source link container
		const sourceContainer = document.createElement('div');
		sourceContainer.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
			flex-shrink: 0;
		`;

		// Source link (if available) - for CSS/SCSS/LESS files
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

		// Note: Edit functionality will be via double-click in future, no icon needed
		row.appendChild(sourceContainer);
		return row;
	}

	// ============================================
	// Matched Rules Section
	// ============================================

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

		// Header with selector and file link
		const header = document.createElement('div');
		header.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			gap: 8px;
			margin-bottom: 4px;
		`;

		// Selector
		const selector = document.createElement('span');
		selector.style.cssText = `
			color: var(--vscode-symbolIcon-classForeground);
			word-break: break-all;
		`;
		selector.textContent = rule.selector;
		header.appendChild(selector);

		// File link - only show clickable link in project mode
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
			// Non-project mode: show source type as plain text (non-clickable)
			const sourceLabel = document.createElement('span');
			sourceLabel.style.cssText = `
				color: var(--vscode-descriptionForeground);
				font-size: 10px;
				white-space: nowrap;
				flex-shrink: 0;
			`;
			sourceLabel.textContent = `→ <inline-style>`;
			header.appendChild(sourceLabel);
		}

		el.appendChild(header);

		// All properties (show everything - will be editable in future)
		const props = document.createElement('div');
		props.style.cssText = `
			padding-left: 12px;
			color: var(--vscode-descriptionForeground);
		`;

		for (const prop of rule.properties) {
			const propLine = document.createElement('div');
			// Styling logic:
			// - isOverridden: true → strikethrough + reduced opacity (property overridden by closer rule)
			// - isNotInheritable: true → reduced opacity only (property doesn't inherit, like background-color)
			// - Both false → normal display (active)
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

	// ============================================
	// Inline Styles Section
	// ============================================

	private createInlineStylesSection(inlineStyles: ElementStyleInfo['inlineStyles']): HTMLElement {
		const section = this.createCollapsibleSection('inline', `Inline Styles (${inlineStyles.length})`);

		const list = document.createElement('div');
		list.style.cssText = `
			font-family: var(--vscode-editor-font-family), monospace;
			font-size: 11px;
		`;

		for (const style of inlineStyles) {
			const row = document.createElement('div');
			row.style.cssText = `
				display: flex;
				padding: 3px 0;
				gap: 8px;
			`;

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

	// ============================================
	// Inherited Styles Section (single section with sub-groups like Chrome)
	// ============================================

	private createInheritedSection(inheritedStyles: NonNullable<ElementStyleInfo['inheritedStyles']>): HTMLElement {
		// Count total rules across all parents
		const totalRules = inheritedStyles.reduce((sum, i) => sum + i.matchedRules.length, 0);
		const section = this.createCollapsibleSection('inherited', `Inherited (${totalRules})`);

		// Add each parent element's styles as a sub-group
		for (const inherited of inheritedStyles) {
			// Parent element header (e.g., "Inherited from section.hero")
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

			// Render each matched rule from this parent
			for (const rule of inherited.matchedRules) {
				const ruleEl = this.createRuleElement(rule);
				section.content.appendChild(ruleEl);
			}

			// Render inline styles from this parent (if any)
			if (inherited.inlineStyle && inherited.inlineStyle.length > 0) {
				const inlineHeader = document.createElement('div');
				inlineHeader.style.cssText = `
					font-size: 10px;
					color: var(--vscode-descriptionForeground);
					margin-top: 8px;
					margin-bottom: 4px;
				`;
				inlineHeader.textContent = 'element.style';
				section.content.appendChild(inlineHeader);

				const list = document.createElement('div');
				list.style.cssText = `
					font-family: var(--vscode-editor-font-family), monospace;
					font-size: 11px;
					padding-left: 12px;
				`;

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

	// ============================================
	// Collapsible Section Helper
	// ============================================

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
		content.style.cssText = `
			padding: 8px 12px;
			display: ${this.expandedSections.has(id) ? 'block' : 'none'};
		`;
		section.appendChild(content);

		// Toggle on click
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

	// ============================================
	// Helpers
	// ============================================

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
