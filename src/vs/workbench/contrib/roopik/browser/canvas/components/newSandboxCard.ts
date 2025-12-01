/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IWebviewService, IWebviewElement } from '../../../../webview/browser/webview.js';
import { getWindow } from '../../../../../../base/browser/dom.js';
import { Sandbox, DevicePreset, SandboxState } from '../../../common/canvas/canvasTypes.js';
import { ISandboxPipelineService } from '../../../common/sandboxPipeline/sandboxPipelineService.js';

export interface INewSandboxCardCallbacks {
	onClick: (id: string) => void;
	onDelete: (id: string) => void;
	onDoubleClick?: (id: string) => void;
	onDragStart?: (id: string, e: MouseEvent) => void;
	onExpand?: (id: string) => void;
	onDeviceModeChange?: (id: string, mode: DevicePreset) => void;
}

/**
 * New Sandbox Card - Uses ESBuild Pipeline
 */
export class NewSandboxCard extends Disposable {
	private container: HTMLElement;
	private webviewElement: IWebviewElement | null = null;
	private webviewContainer: HTMLElement | null = null;
	private _state: SandboxState = 'loading';

	// Visual state
	private _isSelected: boolean = false;
	// private _isFocused: boolean = false;
	private _isDragging: boolean = false;
	// private _isOverlapping: boolean = false;

	constructor(
		private parent: HTMLElement,
		private sandbox: Sandbox,
		private callbacks: INewSandboxCardCallbacks,
		private webviewService: IWebviewService,
		private pipelineService: ISandboxPipelineService
	) {
		super();
		this.container = this.createContainer();
		this.createWebview();
		this.render();
	}

	private createContainer(): HTMLElement {
		const container = document.createElement('div');
		container.className = 'new-sandbox-card';
		container.style.position = 'absolute';
		container.style.left = `${this.sandbox.x}px`;
		container.style.top = `${this.sandbox.y}px`;
		container.style.width = `${this.sandbox.width}px`;
		container.style.height = `${this.sandbox.height}px`;
		container.style.background = 'linear-gradient(135deg, rgba(40, 40, 45, 0.95) 0%, rgba(30, 30, 35, 0.95) 100%)';
		container.style.border = '2px solid #4CAF50'; // Green border
		container.style.borderRadius = '12px';
		container.style.padding = '12px';
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.5)';
		container.style.backdropFilter = 'blur(60px)';
		container.style.zIndex = String(this.sandbox.zIndex);
		container.style.transition = 'box-shadow 0.2s ease, border-color 0.2s ease';

		// Add label
		const label = document.createElement('div');
		label.textContent = `🚀 NEW: ${this.sandbox.id}`;
		label.style.color = '#4CAF50';
		label.style.fontSize = '12px';
		label.style.fontWeight = 'bold';
		label.style.marginBottom = '8px';
		label.style.userSelect = 'none';
		container.appendChild(label);

		// Add delete button
		const deleteBtn = document.createElement('button');
		deleteBtn.textContent = '×';
		deleteBtn.style.position = 'absolute';
		deleteBtn.style.top = '8px';
		deleteBtn.style.right = '8px';
		deleteBtn.style.background = 'rgba(255, 0, 0, 0.8)';
		deleteBtn.style.border = 'none';
		deleteBtn.style.color = 'white';
		deleteBtn.style.width = '24px';
		deleteBtn.style.height = '24px';
		deleteBtn.style.borderRadius = '50%';
		deleteBtn.style.cursor = 'pointer';
		deleteBtn.style.fontSize = '18px';
		deleteBtn.style.lineHeight = '1';
		deleteBtn.onclick = (e) => {
			e.stopPropagation();
			this.callbacks.onDelete(this.sandbox.id);
		};
		container.appendChild(deleteBtn);

		// Event listeners
		container.onmousedown = (e) => {
			if (e.target === container || e.target === label) {
				this.callbacks.onDragStart?.(this.sandbox.id, e);
			}
			this.callbacks.onClick(this.sandbox.id);
		};

		container.ondblclick = () => this.callbacks.onDoubleClick?.(this.sandbox.id);

		return container;
	}

	private createWebview(): void {
		this.webviewContainer = document.createElement('div');
		this.webviewContainer.style.flex = '1';
		this.webviewContainer.style.background = '#ffffff';
		this.webviewContainer.style.borderRadius = '8px';
		this.webviewContainer.style.overflow = 'hidden';
		this.webviewContainer.style.position = 'relative';

		this.webviewElement = this.webviewService.createWebviewElement({
			title: `New Sandbox: ${this.sandbox.id}`,
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

		this.webviewElement.mountTo(this.webviewContainer, getWindow(this.parent));
		this.webviewElement.setHtml(this.getSandboxHtml());

		this._register(this.webviewElement.onMessage((e: any) => {
			this.onWebviewMessage(e.message);
		}));

		// Process component through pipeline
		setTimeout(() => {
			this.processComponentWithPipeline();
		}, 500);
	}

	private getSandboxHtml(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-eval' 'unsafe-inline' blob: https://esm.sh; style-src 'unsafe-inline'; connect-src https://esm.sh;">
    <title>New Roopik Sandbox</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: #fff; }
        #root { min-height: 100vh; width: 100%; }
        .loading { padding: 20px; color: #666; }
        .error { padding: 20px; background: #fee; border-left: 4px solid #c33; color: #c33; }
    </style>
</head>
<body>
    <div id="root">
        <div class="loading">Processing with ESBuild pipeline...</div>
    </div>
    <script type="module">
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', (event) => {
            const { type, code } = event.data;

            if (type === 'execute') {
                try {
                    const blob = new Blob([code], { type: 'text/javascript' });
                    const url = URL.createObjectURL(blob);
                    import(url)
                        .then(() => {
                            vscode.postMessage({ type: 'rendered' });
                            URL.revokeObjectURL(url);
                        })
                        .catch(error => {
                            console.error(error);
                            document.getElementById('root').innerHTML =
                                '<div class="error">Error: ' + error.message + '</div>';
                            vscode.postMessage({ type: 'error', message: error.message });
                        });
                } catch (error) {
                    document.getElementById('root').innerHTML =
                        '<div class="error">Error: ' + error.message + '</div>';
                    vscode.postMessage({ type: 'error', message: error.message });
                }
            }
        });

        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
	}

	private async processComponentWithPipeline(): Promise<void> {
		if (!this.sandbox.sessionCode) {
			console.error('[NewSandboxCard] No code to process');
			return;
		}

		try {
			this._state = 'loading';

			// Detect framework from code
			const framework = this.detectFramework(this.sandbox.sessionCode);
			const filename = this.getFilenameForFramework(framework);

			// Process through pipeline
			const jobId = await this.pipelineService.processComponent({
				id: this.sandbox.id,
				source: 'ai',
				files: {
					[filename]: this.sandbox.sessionCode
				},
				dependencies: this.getDependenciesForFramework(framework)
			});

			// Wait for result
			const result = await this.pipelineService.waitForCompletion(jobId);

			// Send bundled code to webview
			this.webviewElement?.postMessage({
				type: 'execute',
				code: result.bundledCode
			});

			this._state = 'ready';
			console.log('[NewSandboxCard] ✅ Rendered via pipeline!', {
				framework: result.framework,
				cdnUrls: result.cdnUrls,
				size: result.metadata.size
			});

		} catch (error) {
			this._state = 'error';
			console.error('[NewSandboxCard] Pipeline error:', error);
		}
	}

	/**
	 * Detect framework from code content
	 */
	private detectFramework(code: string): string {
		// Vue SFC detection
		if (code.includes('<template>') && code.includes('<script')) {
			return 'vue';
		}

		// Svelte detection
		if (code.includes('<script>') && code.includes('<style>') && !code.includes('<template>')) {
			return 'svelte';
		}

		// Vanilla HTML detection
		if (code.trim().startsWith('<') && !code.includes('import React') && !code.includes('from \'react\'')) {
			return 'html';
		}

		// Solid detection
		if (code.includes('solid-js')) {
			return 'solid';
		}

		// Preact detection
		if (code.includes('preact')) {
			return 'preact';
		}

		// Default to React
		return 'react';
	}

	/**
	 * Get appropriate filename for framework
	 */
	private getFilenameForFramework(framework: string): string {
		const extensionMap: Record<string, string> = {
			'react': 'Component.jsx',
			'vue': 'Component.vue',
			'svelte': 'Component.svelte',
			'solid': 'Component.tsx',
			'preact': 'Component.jsx',
			'html': 'index.html'
		};

		return extensionMap[framework] || 'Component.jsx';
	}

	/**
	 * Get dependencies for framework
	 */
	private getDependenciesForFramework(framework: string): Record<string, string> {
		const depsMap: Record<string, Record<string, string>> = {
			'react': { 'react': '18', 'react-dom': '18' },
			'vue': { 'vue': '3.4.21' },
			'svelte': { 'svelte': '4.2.15' },
			'solid': { 'solid-js': '1.8.0' },
			'preact': { 'preact': '10.19.0' },
			'html': {}
		};

		return depsMap[framework] || {};
	}

	private onWebviewMessage(message: any): void {
		if (message.type === 'ready') {
			console.log('[NewSandboxCard] Webview ready');
		} else if (message.type === 'rendered') {
			this._state = 'ready';
			console.log('[NewSandboxCard] Component rendered');
		} else if (message.type === 'error') {
			this._state = 'error';
			console.error('[NewSandboxCard] Error:', message.message);
		}
	}

	private render(): void {
		if (this.webviewContainer) {
			this.container.appendChild(this.webviewContainer);
		}
		this.parent.appendChild(this.container);
	}

	// ============================================
	// Public API (Matching SandboxCard)
	// ============================================

	get element(): HTMLElement {
		return this.container;
	}

	get id(): string {
		return this.sandbox.id;
	}

	get state(): SandboxState {
		return this._state;
	}

	setSelected(selected: boolean): void {
		this._isSelected = selected;
		this.updateVisualState();
	}

	setFocused(focused: boolean): void {
		// this._isFocused = focused;
		this.updateVisualState();
	}

	setDragging(dragging: boolean): void {
		this._isDragging = dragging;
		this.updateVisualState();
	}

	setOverlapping(overlapping: boolean): void {
		// this._isOverlapping = overlapping;
		this.updateVisualState();
	}

	applyDragOffset(offsetX: number, offsetY: number): void {
		this.container.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
	}

	commitDragPosition(newX: number, newY: number): void {
		this.sandbox.x = newX;
		this.sandbox.y = newY;
		this.container.style.transform = 'none';
		this.container.style.left = `${newX}px`;
		this.container.style.top = `${newY}px`;
	}

	update(sandbox: Partial<Sandbox>): void {
		Object.assign(this.sandbox, sandbox);
		if (sandbox.x !== undefined) this.container.style.left = `${sandbox.x}px`;
		if (sandbox.y !== undefined) this.container.style.top = `${sandbox.y}px`;
		if (sandbox.width !== undefined) this.container.style.width = `${sandbox.width}px`;
		if (sandbox.height !== undefined) this.container.style.height = `${sandbox.height}px`;
		if (sandbox.zIndex !== undefined) this.container.style.zIndex = String(sandbox.zIndex);
	}

	setGlobalDeviceMode(mode: DevicePreset): void {
		// TODO: Implement device mode scaling
	}

	forceDeviceMode(mode: DevicePreset): void {
		// TODO: Implement forced device mode
	}

	private updateVisualState(): void {
		if (this._isSelected) {
			this.container.style.borderColor = '#4CAF50';
			this.container.style.boxShadow = '0 0 0 4px rgba(76, 175, 80, 0.3), 0 12px 48px rgba(0, 0, 0, 0.5)';
		} else {
			this.container.style.borderColor = '#4CAF50';
			this.container.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.5)';
		}

		if (this._isDragging) {
			this.container.style.cursor = 'grabbing';
			this.container.style.opacity = '0.8';
		} else {
			this.container.style.cursor = 'default';
			this.container.style.opacity = '1';
		}
	}

	override dispose(): void {
		this.webviewElement?.dispose();
		this.container.remove();
		super.dispose();
	}
}
