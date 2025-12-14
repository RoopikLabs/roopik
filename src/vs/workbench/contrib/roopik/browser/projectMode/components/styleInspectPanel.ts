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

	// Resize state
	private isResizing: boolean = false;
	private resizeStartX: number = 0;
	private resizeStartWidth: number = 0;

	// Collapsible section states
	private expandedSections = new Set<string>(['element', 'styles', 'rules']);

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
	}

	/**
	 * Show panel with element style information
	 */
	show(data: ElementStyleInfo): void {
		this.currentData = data;
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

		// Element section
		this.contentContainer.appendChild(this.createElementSection(this.currentData));

		// CSS-in-JS notice (if detected)
		if (this.currentData.cssInJs?.detected) {
			this.contentContainer.appendChild(this.createCssInJsNotice(this.currentData.cssInJs));
		}

		// Computed styles section
		if (this.currentData.properties.length > 0) {
			this.contentContainer.appendChild(this.createStylesSection(this.currentData.properties));
		}

		// Matched rules section
		if (this.currentData.matchedRules.length > 0) {
			this.contentContainer.appendChild(this.createRulesSection(this.currentData.matchedRules));
		}

		// Inline styles section
		if (this.currentData.inlineStyles.length > 0) {
			this.contentContainer.appendChild(this.createInlineStylesSection(this.currentData.inlineStyles));
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

		// Component name (if available)
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
				margin-bottom: 8px;
			`;
			componentBadge.textContent = `⚛ ${data.componentName}`;
			section.content.appendChild(componentBadge);
		}

		// Open source button (if htmlSource available)
		if (data.htmlSource) {
			const btn = this.createButton('📄 Open in Editor', () => {
				this.callbacks.onOpenFile(data.htmlSource!);
			});
			btn.title = `${data.htmlSource.file}:${data.htmlSource.line}`;
			section.content.appendChild(btn);
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
		const section = this.createCollapsibleSection('styles', `Computed Styles (${properties.length})`);

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

		// Source link (if available)
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

		// Edit button (if editable and not overridden)
		if (prop.location && !prop.isOverridden && this.callbacks.onEditStyle) {
			const editBtn = document.createElement('button');
			editBtn.style.cssText = `
				background: none;
				border: none;
				cursor: pointer;
				padding: 2px;
				opacity: 0;
				font-size: 10px;
				color: var(--vscode-icon-foreground);
				transition: opacity 0.15s;
			`;
			editBtn.textContent = '✎';
			editBtn.title = 'Edit value';

			row.addEventListener('mouseenter', () => { editBtn.style.opacity = '0.7'; });
			row.addEventListener('mouseleave', () => { editBtn.style.opacity = '0'; });

			editBtn.addEventListener('click', () => this.startInlineEdit(prop, value));
			sourceContainer.appendChild(editBtn);
		}

		row.appendChild(sourceContainer);
		return row;
	}

	// ============================================
	// Matched Rules Section
	// ============================================

	private createRulesSection(rules: MatchedCSSRule[]): HTMLElement {
		const section = this.createCollapsibleSection('rules', `CSS Rules (${rules.length})`);

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

		// File link
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

		el.appendChild(header);

		// Properties preview (first few)
		const props = document.createElement('div');
		props.style.cssText = `
			padding-left: 12px;
			color: var(--vscode-descriptionForeground);
		`;

		const maxPreview = 3;
		for (let i = 0; i < Math.min(rule.properties.length, maxPreview); i++) {
			const prop = rule.properties[i];
			const propLine = document.createElement('div');
			propLine.style.cssText = prop.isOverridden ? 'text-decoration: line-through; opacity: 0.5;' : '';
			propLine.textContent = `${prop.name}: ${prop.value}${prop.isImportant ? ' !important' : ''};`;
			props.appendChild(propLine);
		}

		if (rule.properties.length > maxPreview) {
			const more = document.createElement('div');
			more.style.cssText = `opacity: 0.5; font-style: italic;`;
			more.textContent = `... ${rule.properties.length - maxPreview} more properties`;
			props.appendChild(more);
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
	// Inline Edit
	// ============================================

	private startInlineEdit(prop: ResolvedCSSProperty, valueElement: HTMLElement): void {
		if (!this.callbacks.onEditStyle) {
			return;
		}

		const input = document.createElement('input');
		input.type = 'text';
		input.value = prop.value;
		input.style.cssText = `
			font-family: var(--vscode-editor-font-family), monospace;
			font-size: 11px;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-focusBorder);
			padding: 2px 4px;
			width: 100%;
			outline: none;
		`;

		const originalText = valueElement.textContent || '';
		valueElement.textContent = '';
		valueElement.appendChild(input);
		input.focus();
		input.select();

		const commit = () => {
			const newValue = input.value.trim();
			if (newValue && newValue !== prop.value) {
				this.callbacks.onEditStyle!(prop, newValue);
				valueElement.textContent = newValue;
			} else {
				valueElement.textContent = originalText;
			}
		};

		const cancel = () => {
			valueElement.textContent = originalText;
		};

		input.addEventListener('blur', commit);
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				commit();
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				cancel();
			}
		});
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
