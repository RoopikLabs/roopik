/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { PendingMove } from '../features/dragDrop/types.js';

/**
 * Callbacks for pending changes panel actions
 */
export interface IPendingChangesPanelCallbacks {
	onUndoMove: (moveId: string) => void;
	onUndoAll: () => void;
	onApplyAll: () => void;
	onClose: () => void;
}

/**
 * Floating panel showing pending DOM changes
 *
 * Displays a list of moves that haven't been saved to source yet.
 * Users can undo individual moves or apply/undo all at once.
 *
 * UI Style: VSCode-themed floating panel (like quick pick)
 */
export class PendingChangesPanel {
	private container: HTMLElement;
	private panel: HTMLElement | null = null;
	private listContainer: HTMLElement | null = null;
	private isVisible: boolean = false;

	constructor(
		container: HTMLElement,
		private readonly callbacks: IPendingChangesPanelCallbacks
	) {
		this.container = container;
	}

	/**
	 * Show the panel with pending moves
	 */
	show(moves: PendingMove[]): void {
		if (!this.panel) {
			this.createPanel();
		}
		this.updateList(moves);
		this.panel!.style.display = 'flex';
		this.isVisible = true;
	}

	/**
	 * Hide the panel
	 */
	hide(): void {
		if (this.panel) {
			this.panel.style.display = 'none';
		}
		this.isVisible = false;
	}

	/**
	 * Toggle panel visibility
	 */
	toggle(moves: PendingMove[]): void {
		if (this.isVisible) {
			this.hide();
		} else {
			this.show(moves);
		}
	}

	/**
	 * Update the list of pending moves
	 */
	updateList(moves: PendingMove[]): void {
		if (!this.listContainer) return;

		this.listContainer.innerHTML = '';

		if (moves.length === 0) {
			const emptyMsg = document.createElement('div');
			emptyMsg.style.cssText = `
				padding: 16px;
				text-align: center;
				color: var(--vscode-descriptionForeground);
				font-style: italic;
			`;
			emptyMsg.textContent = 'No pending changes';
			this.listContainer.appendChild(emptyMsg);
			return;
		}

		moves.forEach((move) => {
			const item = this.createMoveItem(move);
			this.listContainer!.appendChild(item);
		});
	}

	/**
	 * Check if panel is visible
	 */
	getIsVisible(): boolean {
		return this.isVisible;
	}

	/**
	 * Create the panel DOM structure
	 */
	private createPanel(): void {
		this.panel = document.createElement('div');
		this.panel.style.cssText = `
			position: absolute;
			top: 50px;
			right: 10px;
			width: 320px;
			max-height: 400px;
			background: var(--vscode-quickInput-background);
			border: 1px solid var(--vscode-widget-border);
			border-radius: 6px;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
			z-index: 1000;
			display: none;
			flex-direction: column;
			overflow: hidden;
		`;

		// Header
		const header = document.createElement('div');
		header.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 10px 12px;
			background: var(--vscode-quickInputTitle-background);
			border-bottom: 1px solid var(--vscode-widget-border);
		`;

		const title = document.createElement('span');
		title.style.cssText = `
			font-weight: 600;
			font-size: 13px;
			color: var(--vscode-foreground);
		`;
		title.textContent = 'Pending Changes';

		const closeBtn = document.createElement('button');
		closeBtn.style.cssText = `
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			padding: 2px 6px;
			font-size: 16px;
			opacity: 0.7;
		`;
		closeBtn.textContent = '\u00D7'; // ×
		closeBtn.title = 'Close';
		closeBtn.onmouseenter = () => closeBtn.style.opacity = '1';
		closeBtn.onmouseleave = () => closeBtn.style.opacity = '0.7';
		closeBtn.onclick = () => this.callbacks.onClose();

		header.appendChild(title);
		header.appendChild(closeBtn);

		// List container (scrollable)
		this.listContainer = document.createElement('div');
		this.listContainer.style.cssText = `
			flex: 1;
			overflow-y: auto;
			max-height: 280px;
		`;

		// Footer with action buttons
		const footer = document.createElement('div');
		footer.style.cssText = `
			display: flex;
			gap: 8px;
			padding: 10px 12px;
			border-top: 1px solid var(--vscode-widget-border);
			background: var(--vscode-quickInputTitle-background);
		`;

		const undoAllBtn = this.createActionButton('Undo All', 'secondary', () => {
			this.callbacks.onUndoAll();
		});

		const applyAllBtn = this.createActionButton('Apply All', 'primary', () => {
			this.callbacks.onApplyAll();
		});

		footer.appendChild(undoAllBtn);
		footer.appendChild(applyAllBtn);

		// Assemble
		this.panel.appendChild(header);
		this.panel.appendChild(this.listContainer);
		this.panel.appendChild(footer);

		this.container.appendChild(this.panel);
	}

	/**
	 * Create a move item row
	 */
	private createMoveItem(move: PendingMove): HTMLElement {
		const item = document.createElement('div');
		item.style.cssText = `
			display: flex;
			align-items: center;
			padding: 8px 12px;
			border-bottom: 1px solid var(--vscode-widget-border);
			gap: 8px;
		`;

		// Icon
		const icon = document.createElement('span');
		icon.style.cssText = `
			font-size: 14px;
			opacity: 0.8;
		`;
		icon.textContent = '\u2195'; // ↕

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
			border: 1px solid var(--vscode-button-secondaryBorder, var(--vscode-widget-border));
			color: var(--vscode-button-secondaryForeground);
			padding: 3px 8px;
			font-size: 11px;
			border-radius: 3px;
			cursor: pointer;
		`;
		undoBtn.textContent = 'Undo';
		undoBtn.onmouseenter = () => {
			undoBtn.style.background = 'var(--vscode-button-secondaryHoverBackground)';
		};
		undoBtn.onmouseleave = () => {
			undoBtn.style.background = 'transparent';
		};
		undoBtn.onclick = () => this.callbacks.onUndoMove(move.id);

		item.appendChild(icon);
		item.appendChild(info);
		item.appendChild(undoBtn);

		return item;
	}

	/**
	 * Create an action button
	 */
	private createActionButton(
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
			btn.onmouseenter = () => {
				btn.style.background = 'var(--vscode-button-hoverBackground)';
			};
			btn.onmouseleave = () => {
				btn.style.background = 'var(--vscode-button-background)';
			};
		} else {
			btn.style.background = 'var(--vscode-button-secondaryBackground)';
			btn.style.color = 'var(--vscode-button-secondaryForeground)';
			btn.onmouseenter = () => {
				btn.style.background = 'var(--vscode-button-secondaryHoverBackground)';
			};
			btn.onmouseleave = () => {
				btn.style.background = 'var(--vscode-button-secondaryBackground)';
			};
		}

		btn.textContent = text;
		btn.onclick = onClick;

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

	/**
	 * Dispose and cleanup
	 */
	dispose(): void {
		if (this.panel && this.panel.parentElement) {
			this.panel.parentElement.removeChild(this.panel);
		}
		this.panel = null;
		this.listContainer = null;
	}
}
