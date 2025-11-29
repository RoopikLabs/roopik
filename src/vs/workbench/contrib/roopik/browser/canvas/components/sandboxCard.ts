/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { getWindow } from '../../../../../../base/browser/dom.js';
import type { Sandbox, SandboxState } from '../../../common/canvas/canvasTypes.js';
import { IWebviewService, IWebviewElement } from '../../../../webview/browser/webview.js';

/**
 * Sandbox Card Callbacks
 */
export interface ISandboxCardCallbacks {
	onClick: (id: string) => void;
	onDoubleClick: (id: string) => void;
	onDragStart: (id: string, e: MouseEvent) => void;
	onDelete: (id: string) => void;
	onExpand: (id: string) => void;
}

/**
 * Sandbox Card - Native DOM Component
 *
 * Glass-morphism styled card containing an iframe sandbox for component preview.
 * Following VSCode native DOM patterns (no React, no innerHTML).
 *
 * Features:
 * - Glass-morphism design with backdrop blur
 * - Drag handle for repositioning
 * - Selection and focus states
 * - Hover effects
 * - Delete and expand buttons
 * - Webview sandbox for component rendering (bypasses CSP restrictions)
 */
export class SandboxCard extends Disposable {
	private container: HTMLElement;
	private webviewElement: IWebviewElement | undefined;
	private webviewContainer: HTMLElement | undefined;
	private labelElement: HTMLElement;
	private actionButtons: HTMLElement | undefined;

	// State
	private _isSelected: boolean = false;
	private _isFocused: boolean = false;
	private _isHovered: boolean = false;
	private _isDragging: boolean = false;
	private _state: SandboxState = 'loading';

	constructor(
		private parent: HTMLElement,
		private sandbox: Sandbox,
		private callbacks: ISandboxCardCallbacks,
		private webviewService: IWebviewService
	) {
		super();
		this.container = this.createContainer();
		this.labelElement = this.createLabel();
		this.createWebview();
		this.render();
	}

	// ============================================
	// Container Creation
	// ============================================

	private createContainer(): HTMLElement {
		const container = document.createElement('div');
		container.className = 'roopik-sandbox-card';
		container.dataset.sandboxId = this.sandbox.id;

		// Base styles
		container.style.position = 'absolute';
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.borderRadius = '20px';
		container.style.overflow = 'hidden';
		container.style.cursor = 'pointer';
		container.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

		// Padding for glass effect
		container.style.padding = '40px 120px';
		container.style.margin = '20px';

		// Apply initial position and size directly (this.container not yet assigned)
		container.style.left = `${this.sandbox.x}px`;
		container.style.top = `${this.sandbox.y}px`;
		container.style.width = `${this.sandbox.width}px`;
		container.style.height = `${this.sandbox.height}px`;
		container.style.zIndex = String(this.sandbox.zIndex);

		// Apply initial visual state directly
		container.style.background = 'linear-gradient(135deg, rgba(40, 40, 45, 0.25) 0%, rgba(30, 30, 35, 0.25) 100%)';
		container.style.backdropFilter = 'blur(60px) saturate(250%) brightness(1.1)';
		(container.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'blur(60px) saturate(250%) brightness(1.1)';
		container.style.border = '1px solid rgba(255, 255, 255, 0.2)';
		container.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 2px 0 rgba(255, 255, 255, 0.15), inset 0 -2px 0 rgba(255, 255, 255, 0.05)';

		// Event listeners
		this.setupEventListeners(container);

		this.parent.appendChild(container);
		return container;
	}

	private setupEventListeners(container: HTMLElement): void {
		// Hover
		container.addEventListener('mouseenter', () => {
			this._isHovered = true;
			this.updateVisualState();
			this.showActionButtons();
		});

		container.addEventListener('mouseleave', () => {
			this._isHovered = false;
			this.updateVisualState();
			if (!this._isSelected && !this._isFocused) {
				this.hideActionButtons();
			}
		});

		// Click (select)
		container.addEventListener('click', (e) => {
			// Don't trigger if clicking on action buttons or iframe
			if ((e.target as HTMLElement).closest('.sandbox-action-btn') ||
				(e.target as HTMLElement).tagName === 'IFRAME') {
				return;
			}
			this.callbacks.onClick(this.sandbox.id);
		});

		// Double-click (focus mode)
		container.addEventListener('dblclick', (e) => {
			if ((e.target as HTMLElement).tagName === 'IFRAME') {
				return;
			}
			this.callbacks.onDoubleClick(this.sandbox.id);
		});
	}

	// ============================================
	// Label (Drag Handle)
	// ============================================

	private createLabel(): HTMLElement {
		const label = document.createElement('div');
		label.className = 'sandbox-label';
		label.style.position = 'absolute';
		label.style.top = '16px';
		label.style.left = '20px';
		label.style.display = 'flex';
		label.style.alignItems = 'center';
		label.style.gap = '8px';
		label.style.cursor = 'move';
		label.style.userSelect = 'none';
		label.style.zIndex = '10';

		// Drag icon (2x3 grip)
		const dragIcon = this.createDragIcon();
		label.appendChild(dragIcon);

		// ID text
		const idText = document.createElement('span');
		idText.style.fontSize = '12px';
		idText.style.fontWeight = '700';
		idText.style.color = '#ffffff';
		idText.style.letterSpacing = '0.05em';
		idText.style.textTransform = 'uppercase';
		idText.style.textShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
		idText.textContent = this.sandbox.id;
		label.appendChild(idText);

		// Drag events
		label.addEventListener('mousedown', (e) => {
			e.stopPropagation();
			this._isDragging = true;
			this.updateVisualState();
			this.callbacks.onDragStart(this.sandbox.id, e);
		});

		return label;
	}

	private createDragIcon(): HTMLElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('fill', 'none');
		svg.style.opacity = '0.7';
		svg.style.flexShrink = '0';
		svg.style.color = '#ffffff';

		// 2x3 dot grid
		const positions = [
			[4, 4], [12, 4],
			[4, 8], [12, 8],
			[4, 12], [12, 12]
		];

		for (const [cx, cy] of positions) {
			const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			circle.setAttribute('cx', String(cx));
			circle.setAttribute('cy', String(cy));
			circle.setAttribute('r', '1.5');
			circle.setAttribute('fill', 'currentColor');
			svg.appendChild(circle);
		}

		return svg as unknown as HTMLElement;
	}

	// ============================================
	// Action Buttons (Delete, Expand)
	// ============================================

	private createActionButtons(): HTMLElement {
		const container = document.createElement('div');
		container.className = 'sandbox-actions';
		container.style.position = 'absolute';
		container.style.top = '16px';
		container.style.right = '20px';
		container.style.display = 'flex';
		container.style.alignItems = 'center';
		container.style.gap = '8px';
		container.style.zIndex = '10';
		container.style.opacity = '0';
		container.style.transition = 'opacity 0.2s ease';

		// Expand button
		const expandBtn = this.createActionButton('Expand to fullscreen', this.createExpandIcon(), () => {
			this.callbacks.onExpand(this.sandbox.id);
		});
		container.appendChild(expandBtn);

		// Delete button
		const deleteBtn = this.createActionButton('Delete sandbox', this.createDeleteIcon(), () => {
			this.callbacks.onDelete(this.sandbox.id);
		}, true);
		container.appendChild(deleteBtn);

		return container;
	}

	private createActionButton(title: string, icon: HTMLElement, onClick: () => void, isDanger: boolean = false): HTMLElement {
		const btn = document.createElement('button');
		btn.className = 'sandbox-action-btn';
		btn.title = title;
		btn.style.background = 'transparent';
		btn.style.border = 'none';
		btn.style.padding = '4px';
		btn.style.cursor = 'pointer';
		btn.style.display = 'flex';
		btn.style.alignItems = 'center';
		btn.style.justifyContent = 'center';
		btn.style.transition = 'all 0.2s ease';
		btn.style.opacity = '0.7';
		btn.style.borderRadius = '4px';

		btn.appendChild(icon);

		btn.addEventListener('mouseenter', () => {
			btn.style.opacity = '1';
			if (isDanger) {
				const svg = btn.querySelector('svg');
				if (svg) {
					svg.setAttribute('stroke', '#ef4444');
				}
			}
		});

		btn.addEventListener('mouseleave', () => {
			btn.style.opacity = '0.7';
			if (isDanger) {
				const svg = btn.querySelector('svg');
				if (svg) {
					svg.setAttribute('stroke', 'rgba(255, 255, 255, 0.9)');
				}
			}
		});

		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			onClick();
		});

		return btn;
	}

	private createExpandIcon(): HTMLElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '18');
		svg.setAttribute('height', '18');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'rgba(255, 255, 255, 0.9)');
		svg.setAttribute('stroke-width', '1.5');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');

		// Four corner arrows
		const paths = ['M2 6 L2 2 L6 2', 'M10 2 L14 2 L14 6', 'M14 10 L14 14 L10 14', 'M6 14 L2 14 L2 10'];
		for (const d of paths) {
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', d);
			svg.appendChild(path);
		}

		return svg as unknown as HTMLElement;
	}

	private createDeleteIcon(): HTMLElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '18');
		svg.setAttribute('height', '18');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'rgba(255, 255, 255, 0.9)');
		svg.setAttribute('stroke-width', '2');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');

		// X shape
		const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path1.setAttribute('d', 'M4 4 L12 12');
		svg.appendChild(path1);

		const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path2.setAttribute('d', 'M12 4 L4 12');
		svg.appendChild(path2);

		return svg as unknown as HTMLElement;
	}

	private showActionButtons(): void {
		if (this.actionButtons) {
			this.actionButtons.style.opacity = '1';
		}
	}

	private hideActionButtons(): void {
		if (this.actionButtons) {
			this.actionButtons.style.opacity = '0';
		}
	}

	// ============================================
	// Webview Sandbox (bypasses CSP restrictions)
	// ============================================

	private createWebview(): void {
		// Create container for webview
		this.webviewContainer = document.createElement('div');
		this.webviewContainer.className = 'sandbox-webview-container';
		this.webviewContainer.style.flex = '1';
		this.webviewContainer.style.position = 'relative';
		this.webviewContainer.style.background = '#ffffff';
		this.webviewContainer.style.borderRadius = '8px';
		this.webviewContainer.style.overflow = 'hidden';
		this.webviewContainer.style.boxShadow = 'inset 0 0 0 1px rgba(0, 0, 0, 0.1)';
		this.webviewContainer.style.marginTop = '10px';

		// Create webview element using VSCode's webview service
		this.webviewElement = this.webviewService.createWebviewElement({
			title: `Sandbox: ${this.sandbox.id}`,
			options: {
				enableFindWidget: false,
				retainContextWhenHidden: true
			},
			contentOptions: {
				allowScripts: true,
				localResourceRoots: []
			},
			extension: undefined
		});

		// Mount webview to container
		this.webviewElement.mountTo(this.webviewContainer, getWindow(this.parent));

		// Set the HTML content
		this.webviewElement.setHtml(this.getSandboxHtml());

		// Listen for messages from webview
		this._register(this.webviewElement.onMessage(e => {
			this.onWebviewMessage(e.message);
		}));

		// Send initial code after a short delay to ensure webview is ready
		setTimeout(() => {
			this.sendCodeToWebview();
		}, 500);
	}

	private getSandboxHtml(): string {
		// Golden Template - loads dependencies from CDN and transpiles with Babel
		// Uses VSCode webview API for communication (acquireVsCodeApi)
		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Roopik Component Sandbox</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #ffffff;
            overflow: auto;
        }
        #root {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .sandbox-error {
            background: #fee;
            border: 2px solid #fcc;
            border-radius: 8px;
            padding: 20px;
            max-width: 600px;
        }
        .sandbox-error h3 { color: #c33; margin-bottom: 10px; }
        .sandbox-error pre {
            background: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 12px;
        }
        .sandbox-loading {
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div id="root">
        <div class="sandbox-loading">Initializing sandbox...</div>
    </div>
    <script src="https://unpkg.com/@babel/standalone@7.23.5/babel.min.js"></script>
    <script>
        // Acquire VSCode API for communication with host
        const vscode = acquireVsCodeApi();
        let cdnScriptsLoaded = false;

        function loadCDNScripts(urls) {
            return new Promise((resolve, reject) => {
                if (!urls || urls.length === 0) {
                    resolve();
                    return;
                }
                let loaded = 0;
                const total = urls.length;
                urls.forEach(url => {
                    const script = document.createElement('script');
                    script.src = url;
                    script.crossOrigin = 'anonymous';
                    script.onload = () => {
                        loaded++;
                        if (loaded === total) {
                            cdnScriptsLoaded = true;
                            resolve();
                        }
                    };
                    script.onerror = () => reject(new Error('Failed to load CDN script: ' + url));
                    document.head.appendChild(script);
                });
            });
        }

        function renderComponent(code) {
            try {
                // Strip import statements - React/ReactDOM are loaded via CDN as globals
                // Also extract destructured imports like { useState } from 'react'
                let processedCode = code;

                // Handle: import React, { useState, useEffect } from 'react';
                // Handle: import { useState } from 'react';
                // Handle: import React from 'react';
                const importRegex = /import\\s+(?:([\\w]+)\\s*,?\\s*)?(?:\\{([^}]+)\\})?\\s*from\\s*['"][^'"]+['"];?/g;
                const destructuredImports = [];

                processedCode = processedCode.replace(importRegex, (match, defaultImport, namedImports) => {
                    if (namedImports) {
                        // Extract named imports: useState, useEffect, etc.
                        const imports = namedImports.split(',').map(s => s.trim());
                        imports.forEach(imp => {
                            // Handle "useState as myState" syntax
                            const parts = imp.split(/\\s+as\\s+/);
                            const originalName = parts[0].trim();
                            const localName = parts[1] ? parts[1].trim() : originalName;
                            destructuredImports.push({ originalName, localName });
                        });
                    }
                    return ''; // Remove the import statement
                });

                // Add destructured imports at the top (e.g., const { useState, useEffect } = React;)
                if (destructuredImports.length > 0) {
                    const destructureStatement = 'const { ' +
                        destructuredImports.map(i => i.originalName === i.localName ? i.originalName : i.originalName + ': ' + i.localName).join(', ') +
                        ' } = React;\\n';
                    processedCode = destructureStatement + processedCode;
                }

                // Replace 'export default function' with 'function Component'
                processedCode = processedCode.replace(/export\\s+default\\s+function\\s+(\\w+)?/, 'function Component');
                // Replace 'export default' with assignment
                processedCode = processedCode.replace(/export\\s+default\\s+/, 'const Component = ');

                const transpiled = Babel.transform(processedCode, {
                    presets: ['react'],
                    filename: 'component.jsx'
                }).code;
                const root = document.getElementById('root');
                root.innerHTML = '';
                const componentFunc = new Function('React', 'ReactDOM', transpiled + '\\n\\nreturn Component;');
                const Component = componentFunc(window.React, window.ReactDOM);
                if (window.ReactDOM.createRoot) {
                    const reactRoot = window.ReactDOM.createRoot(root);
                    reactRoot.render(window.React.createElement(Component));
                } else {
                    window.ReactDOM.render(window.React.createElement(Component), root);
                }
                vscode.postMessage({ type: 'rendered', sandboxId: '${this.sandbox.id}' });
            } catch (error) {
                const root = document.getElementById('root');
                root.innerHTML = '';
                const errorDiv = document.createElement('div');
                errorDiv.className = 'sandbox-error';
                const h3 = document.createElement('h3');
                h3.textContent = 'Component Error';
                errorDiv.appendChild(h3);
                const pre = document.createElement('pre');
                pre.textContent = error.message;
                errorDiv.appendChild(pre);
                root.appendChild(errorDiv);
                vscode.postMessage({ type: 'error', sandboxId: '${this.sandbox.id}', message: error.message });
            }
        }

        window.addEventListener('message', async (event) => {
            const message = event.data;
            if (message.type === 'init') {
                try {
                    if (message.cdnUrls && message.cdnUrls.length > 0) {
                        await loadCDNScripts(message.cdnUrls);
                    }
                    renderComponent(message.code);
                } catch (error) {
                    const root = document.getElementById('root');
                    root.innerHTML = '';
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'sandbox-error';
                    const h3 = document.createElement('h3');
                    h3.textContent = 'Initialization Error';
                    errorDiv.appendChild(h3);
                    const pre = document.createElement('pre');
                    pre.textContent = error.message;
                    errorDiv.appendChild(pre);
                    root.appendChild(errorDiv);
                }
            } else if (message.type === 'update') {
                renderComponent(message.code);
            }
        });

        vscode.postMessage({ type: 'sandbox-ready', sandboxId: '${this.sandbox.id}' });
    </script>
</body>
</html>`;
	}

	private onWebviewMessage(message: any): void {
		if (message.type === 'sandbox-ready') {
			// Webview is ready, send the component code
			this.sendCodeToWebview();
		} else if (message.type === 'rendered') {
			this._state = 'ready';
			this.sandbox.state = 'ready';
		} else if (message.type === 'error') {
			this._state = 'error';
			this.sandbox.state = 'error';
			this.sandbox.errorMessage = message.message;
			console.error(`[SandboxCard] Error in ${this.sandbox.id}:`, message.message);
		}
	}

	private sendCodeToWebview(): void {
		if (this.sandbox.sessionCode && this.webviewElement) {
			this.webviewElement.postMessage({
				type: 'init',
				code: this.sandbox.sessionCode,
				cdnUrls: this.sandbox.cdnUrls || []
			});
		}
	}

	// ============================================
	// Render
	// ============================================

	private render(): void {
		// Add label
		this.container.appendChild(this.labelElement);

		// Add action buttons
		this.actionButtons = this.createActionButtons();
		this.container.appendChild(this.actionButtons);

		// Add webview container
		if (this.webviewContainer) {
			this.container.appendChild(this.webviewContainer);
		}
	}

	// ============================================
	// Visual State Updates
	// ============================================

	private updateVisualState(): void {
		// Background gradient
		if (this._isSelected) {
			this.container.style.background = 'linear-gradient(135deg, rgba(30, 30, 35, 0.35) 0%, rgba(20, 20, 25, 0.35) 100%)';
		} else {
			this.container.style.background = 'linear-gradient(135deg, rgba(40, 40, 45, 0.25) 0%, rgba(30, 30, 35, 0.25) 100%)';
		}

		// Backdrop filter (disabled during drag for performance)
		if (this._isDragging) {
			this.container.style.backdropFilter = 'none';
			(this.container.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'none';
		} else {
			this.container.style.backdropFilter = 'blur(60px) saturate(250%) brightness(1.1)';
			(this.container.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'blur(60px) saturate(250%) brightness(1.1)';
		}

		// Border
		if (this._isFocused) {
			this.container.style.border = '1px solid rgba(0, 122, 204, 0.5)';
		} else if (this._isSelected) {
			this.container.style.border = '1px solid rgba(75, 85, 190, 0.5)';
		} else if (this._isHovered) {
			this.container.style.border = '1px solid rgba(255, 165, 0, 0.45)';
		} else {
			this.container.style.border = '1px solid rgba(255, 255, 255, 0.2)';
		}

		// Box shadow
		if (this._isDragging) {
			this.container.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.5)';
		} else if (this._isFocused) {
			this.container.style.boxShadow = '0 0 0 4px rgba(0, 122, 204, 0.15), 0 32px 80px rgba(0, 0, 0, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.25), inset 0 -2px 0 rgba(255, 255, 255, 0.05)';
		} else if (this._isSelected) {
			this.container.style.boxShadow = '0 0 0 4px rgba(75, 85, 190, 0.15), 0 32px 80px rgba(0, 0, 0, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.25), inset 0 -2px 0 rgba(255, 255, 255, 0.05), 0 0 32px rgba(75, 85, 190, 0.2)';
		} else if (this._isHovered) {
			this.container.style.boxShadow = '0 0 0 4px rgba(255, 165, 0, 0.1), 0 24px 64px rgba(0, 0, 0, 0.35), inset 0 2px 0 rgba(255, 255, 255, 0.2), inset 0 -2px 0 rgba(255, 255, 255, 0.05), 0 0 32px rgba(255, 165, 0, 0.2)';
		} else {
			this.container.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 2px 0 rgba(255, 255, 255, 0.15), inset 0 -2px 0 rgba(255, 255, 255, 0.05)';
		}

		// Cursor
		this.container.style.cursor = this._isDragging ? 'grabbing' : 'pointer';

		// Transition (disabled during drag)
		this.container.style.transition = this._isDragging ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

		// Webview pointer events (disabled during drag)
		if (this.webviewContainer) {
			this.webviewContainer.style.pointerEvents = this._isDragging ? 'none' : 'auto';
		}
	}

	// ============================================
	// Position and Size Updates
	// ============================================

	private updatePosition(): void {
		this.container.style.left = `${this.sandbox.x}px`;
		this.container.style.top = `${this.sandbox.y}px`;
	}

	private updateSize(): void {
		this.container.style.width = `${this.sandbox.width}px`;
		this.container.style.height = `${this.sandbox.height}px`;
	}

	private updateZIndex(): void {
		this.container.style.zIndex = String(this.sandbox.zIndex);
	}

	// ============================================
	// Public API
	// ============================================

	get id(): string {
		return this.sandbox.id;
	}

	get element(): HTMLElement {
		return this.container;
	}

	get state(): SandboxState {
		return this._state;
	}

	setSelected(selected: boolean): void {
		this._isSelected = selected;
		this.updateVisualState();
		if (selected) {
			this.showActionButtons();
		} else if (!this._isHovered && !this._isFocused) {
			this.hideActionButtons();
		}
	}

	setFocused(focused: boolean): void {
		this._isFocused = focused;
		this.updateVisualState();
		if (focused) {
			this.showActionButtons();
		}
	}

	setDragging(dragging: boolean): void {
		this._isDragging = dragging;
		this.updateVisualState();
	}

	/**
	 * Apply drag offset (visual only, doesn't update sandbox data)
	 */
	applyDragOffset(offsetX: number, offsetY: number): void {
		this.container.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
	}

	/**
	 * Clear drag offset and update actual position
	 */
	commitDragPosition(newX: number, newY: number): void {
		this.sandbox.x = newX;
		this.sandbox.y = newY;
		this.container.style.transform = 'none';
		this.updatePosition();
	}

	/**
	 * Update sandbox data and re-render
	 */
	update(sandbox: Partial<Sandbox>): void {
		Object.assign(this.sandbox, sandbox);

		if ('x' in sandbox || 'y' in sandbox) {
			this.updatePosition();
		}
		if ('width' in sandbox || 'height' in sandbox) {
			this.updateSize();
		}
		if ('zIndex' in sandbox) {
			this.updateZIndex();
		}
		if ('sessionCode' in sandbox || 'cdnUrls' in sandbox) {
			// Re-send code to webview
			if (this.webviewElement) {
				this.webviewElement.postMessage({
					type: 'update',
					code: this.sandbox.sessionCode
				});
			}
		}
	}

	/**
	 * Update render state
	 */
	setState(state: SandboxState, errorMessage?: string): void {
		this._state = state;
		this.sandbox.state = state;
		if (errorMessage) {
			this.sandbox.errorMessage = errorMessage;
		}
	}

	override dispose(): void {
		// Dispose webview element
		if (this.webviewElement) {
			this.webviewElement.dispose();
			this.webviewElement = undefined;
		}
		this.container.remove();
		super.dispose();
	}
}
