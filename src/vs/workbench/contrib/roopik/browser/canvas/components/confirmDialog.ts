/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * ConfirmDialog - Native DOM confirmation dialog component
 *
 * A modal dialog for confirming destructive actions like deletion.
 * Features glass-morphism design consistent with canvas UI.
 */

import { Disposable } from '../../../../../../base/common/lifecycle.js';

export interface IConfirmDialogOptions {
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	isDanger?: boolean;
}

export interface IConfirmDialogCallbacks {
	onConfirm: () => void;
	onCancel: () => void;
}

export class ConfirmDialog extends Disposable {
	private overlay: HTMLElement;
	private dialog: HTMLElement;

	constructor(
		private parent: HTMLElement,
		private options: IConfirmDialogOptions,
		private callbacks: IConfirmDialogCallbacks
	) {
		super();
		this.overlay = this.createOverlay();
		this.dialog = this.createDialog();
		this.render();
	}

	private createOverlay(): HTMLElement {
		const overlay = document.createElement('div');
		overlay.className = 'roopik-confirm-dialog-overlay';
		overlay.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: rgba(0, 0, 0, 0.5);
			backdrop-filter: blur(4px);
			-webkit-backdrop-filter: blur(4px);
			z-index: 10000;
			display: flex;
			align-items: center;
			justify-content: center;
			opacity: 0;
			transition: opacity 0.2s ease;
		`;

		// Click outside to cancel
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) {
				this.cancel();
			}
		});

		// ESC key to cancel
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.cancel();
			} else if (e.key === 'Enter') {
				this.confirm();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		this._register({
			dispose: () => document.removeEventListener('keydown', handleKeyDown)
		});

		return overlay;
	}

	private createDialog(): HTMLElement {
		const dialog = document.createElement('div');
		dialog.className = 'roopik-confirm-dialog';
		dialog.style.cssText = `
			background: rgba(28, 28, 30, 0.95);
			backdrop-filter: blur(20px) saturate(180%);
			-webkit-backdrop-filter: blur(20px) saturate(180%);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 16px;
			box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.3);
			padding: 24px;
			min-width: 320px;
			max-width: 400px;
			transform: scale(0.95);
			opacity: 0;
			transition: all 0.2s ease;
		`;

		// Stop click propagation
		dialog.addEventListener('click', (e) => e.stopPropagation());

		return dialog;
	}

	private render(): void {
		// Title
		const title = document.createElement('h3');
		title.style.cssText = `
			margin: 0 0 12px 0;
			font-size: 16px;
			font-weight: 600;
			color: #ffffff;
			letter-spacing: -0.01em;
		`;
		title.textContent = this.options.title;
		this.dialog.appendChild(title);

		// Message
		const message = document.createElement('p');
		message.style.cssText = `
			margin: 0 0 24px 0;
			font-size: 14px;
			color: rgba(255, 255, 255, 0.7);
			line-height: 1.5;
		`;
		message.textContent = this.options.message;
		this.dialog.appendChild(message);

		// Button container
		const buttonContainer = document.createElement('div');
		buttonContainer.style.cssText = `
			display: flex;
			gap: 12px;
			justify-content: flex-end;
		`;

		// Cancel button
		const cancelBtn = this.createButton(
			this.options.cancelText || 'Cancel',
			false,
			() => this.cancel()
		);
		buttonContainer.appendChild(cancelBtn);

		// Confirm button
		const confirmBtn = this.createButton(
			this.options.confirmText || 'Confirm',
			this.options.isDanger ?? false,
			() => this.confirm()
		);
		buttonContainer.appendChild(confirmBtn);

		this.dialog.appendChild(buttonContainer);

		// Add to DOM
		this.overlay.appendChild(this.dialog);
		this.parent.appendChild(this.overlay);

		// Trigger animation
		requestAnimationFrame(() => {
			this.overlay.style.opacity = '1';
			this.dialog.style.opacity = '1';
			this.dialog.style.transform = 'scale(1)';
		});
	}

	private createButton(text: string, isDanger: boolean, onClick: () => void): HTMLElement {
		const btn = document.createElement('button');
		btn.textContent = text;

		const baseStyles = `
			padding: 10px 20px;
			font-size: 14px;
			font-weight: 500;
			border: none;
			border-radius: 10px;
			cursor: pointer;
			transition: all 0.15s ease;
		`;

		if (isDanger) {
			btn.style.cssText = baseStyles + `
				background: rgba(239, 68, 68, 0.2);
				color: #ef4444;
				border: 1px solid rgba(239, 68, 68, 0.3);
			`;
			btn.addEventListener('mouseenter', () => {
				btn.style.background = 'rgba(239, 68, 68, 0.3)';
				btn.style.borderColor = 'rgba(239, 68, 68, 0.5)';
			});
			btn.addEventListener('mouseleave', () => {
				btn.style.background = 'rgba(239, 68, 68, 0.2)';
				btn.style.borderColor = 'rgba(239, 68, 68, 0.3)';
			});
		} else {
			btn.style.cssText = baseStyles + `
				background: rgba(255, 255, 255, 0.08);
				color: rgba(255, 255, 255, 0.9);
				border: 1px solid rgba(255, 255, 255, 0.1);
			`;
			btn.addEventListener('mouseenter', () => {
				btn.style.background = 'rgba(255, 255, 255, 0.12)';
			});
			btn.addEventListener('mouseleave', () => {
				btn.style.background = 'rgba(255, 255, 255, 0.08)';
			});
		}

		btn.addEventListener('click', onClick);
		return btn;
	}

	private confirm(): void {
		this.animateOut(() => {
			this.callbacks.onConfirm();
			this.dispose();
		});
	}

	private cancel(): void {
		this.animateOut(() => {
			this.callbacks.onCancel();
			this.dispose();
		});
	}

	private animateOut(callback: () => void): void {
		this.overlay.style.opacity = '0';
		this.dialog.style.opacity = '0';
		this.dialog.style.transform = 'scale(0.95)';
		setTimeout(callback, 200);
	}

	public override dispose(): void {
		if (this.overlay.parentElement) {
			this.overlay.parentElement.removeChild(this.overlay);
		}
		super.dispose();
	}
}

/**
 * Show a confirmation dialog and return a promise
 */
export function showConfirmDialog(
	parent: HTMLElement,
	options: IConfirmDialogOptions
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmDialog(parent, options, {
			onConfirm: () => resolve(true),
			onCancel: () => resolve(false)
		});
	});
}
