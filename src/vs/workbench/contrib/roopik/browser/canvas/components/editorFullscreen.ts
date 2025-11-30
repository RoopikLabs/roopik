/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * EditorFullscreen - Editor-contained fullscreen component preview
 *
 * Shows a single component in a fullscreen view WITHIN the editor container.
 * This keeps the VSCode activity bar, sidebar, and command palette accessible.
 *
 * Features:
 * - Fills editor pane (position: absolute, not fixed)
 * - Activity bar and sidebar remain accessible
 * - Device presets for responsive testing (Auto, Desktop, Tablet, Mobile)
 * - Native browser zoom (Ctrl+/-, pinch) works inside webview
 * - Keyboard shortcuts (ESC to exit)
 * - Ready for future inspect/edit/AI integration
 *
 * Two Levels of Fullscreen (documented in SANDBOX_ARCHITECTURE.md):
 * - Level 1: Editor Fullscreen (this component) - stays within editor
 * - Level 2: True Fullscreen (future) - covers entire VSCode window
 *
 * Note: No custom zoom controls - use native browser zoom (Ctrl+/-, pinch)
 * which works automatically inside the webview.
 */

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { getWindow, clearNode } from '../../../../../../base/browser/dom.js';
import type { Sandbox } from '../../../common/canvas/canvasTypes.js';
import { IWebviewService, IWebviewElement } from '../../../../webview/browser/webview.js';

// Device presets for responsive preview
export type DevicePreset = 'desktop' | 'tablet' | 'mobile' | 'auto';

export interface IDevicePresetConfig {
	name: string;
	width: number | 'auto';
	height: number | 'auto';
	icon: string;
}

export const DEVICE_PRESETS: Record<DevicePreset, IDevicePresetConfig> = {
	auto: { name: 'Auto', width: 'auto', height: 'auto', icon: 'expand' },
	desktop: { name: 'Desktop', width: 1280, height: 800, icon: 'monitor' },
	tablet: { name: 'Tablet', width: 768, height: 1024, icon: 'tablet' },
	mobile: { name: 'Mobile', width: 375, height: 667, icon: 'smartphone' }
};

export interface IEditorFullscreenCallbacks {
	onClose: () => void;
	onDeviceChange?: (device: DevicePreset) => void;
	onTrueFullscreen?: () => void;  // Future: expand to true fullscreen
}

export interface IEditorFullscreenState {
	sandbox: Sandbox;
	device: DevicePreset;
	backgroundColor: string;
}

/**
 * EditorFullscreen - Editor-contained fullscreen mode
 *
 * Key differences from true fullscreen:
 * - Uses position: absolute (not fixed) to stay within editor container
 * - Activity bar and sidebar remain accessible
 * - Covers entire editor pane (bottom: 0)
 */

export class EditorFullscreen extends Disposable {
	private overlay: HTMLElement;
	private contentContainer: HTMLElement | undefined;
	private controlsContainer: HTMLElement | undefined;
	private webviewElement: IWebviewElement | undefined;
	private webviewContainer: HTMLElement | undefined;
	private sizeIndicator: HTMLElement | undefined;

	private state: IEditorFullscreenState;

	constructor(
		private editorContainer: HTMLElement,  // The editor pane container (not document.body)
		sandbox: Sandbox,
		private callbacks: IEditorFullscreenCallbacks,
		private webviewService: IWebviewService
	) {
		super();

		this.state = {
			sandbox,
			device: 'auto',
			backgroundColor: '#1a1a1a'
		};

		this.overlay = this.createOverlay();
		this.render();

		// Setup keyboard handler
		this.setupKeyboardHandler();

		// Setup resize handler for responsive device presets
		this.setupResizeHandler();
	}

	private createOverlay(): HTMLElement {
		const overlay = document.createElement('div');
		overlay.className = 'roopik-editor-fullscreen';
		overlay.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 100;
			background: ${this.state.backgroundColor};
			opacity: 0;
			transition: opacity 0.3s ease;
			display: flex;
			flex-direction: column;
			border-radius: 0;
		`;

		// Append to editor container (not document.body)
		this.editorContainer.appendChild(overlay);

		// Animate in
		requestAnimationFrame(() => {
			overlay.style.opacity = '1';
		});

		return overlay;
	}

	private render(): void {
		// Clear overlay using VSCode's safe clearNode
		clearNode(this.overlay);

		// Create top controls bar
		this.controlsContainer = this.createControlsBar();
		this.overlay.appendChild(this.controlsContainer);

		// Create content area
		this.contentContainer = this.createContentArea();
		this.overlay.appendChild(this.contentContainer);

		// Create webview for component
		this.createWebview();
	}

	private createControlsBar(): HTMLElement {
		const bar = document.createElement('div');
		bar.className = 'fullscreen-controls-bar';
		bar.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 12px 20px;
			background: rgba(0, 0, 0, 0.3);
			backdrop-filter: blur(10px);
			-webkit-backdrop-filter: blur(10px);
			border-bottom: 1px solid rgba(255, 255, 255, 0.1);
			flex-shrink: 0;
		`;

		// Left section - Component info
		const leftSection = document.createElement('div');
		leftSection.style.cssText = `display: flex; align-items: center; gap: 12px;`;

		const title = document.createElement('span');
		title.style.cssText = `
			font-size: 14px;
			font-weight: 600;
			color: #ffffff;
			letter-spacing: -0.01em;
		`;
		title.textContent = this.state.sandbox.componentId || this.state.sandbox.id;
		leftSection.appendChild(title);

		bar.appendChild(leftSection);

		// Center section - Device presets + size indicator
		const centerSection = document.createElement('div');
		centerSection.style.cssText = `display: flex; align-items: center; gap: 12px;`;

		// Device buttons container
		const deviceButtons = document.createElement('div');
		deviceButtons.style.cssText = `display: flex; align-items: center; gap: 4px;`;

		const devices: DevicePreset[] = ['auto', 'desktop', 'tablet', 'mobile'];
		devices.forEach(device => {
			const btn = this.createDeviceButton(device);
			deviceButtons.appendChild(btn);
		});

		centerSection.appendChild(deviceButtons);

		// Size indicator (shows actual dimensions)
		this.sizeIndicator = document.createElement('span');
		this.sizeIndicator.className = 'size-indicator';
		this.sizeIndicator.style.cssText = `
			font-size: 11px;
			color: rgba(255, 255, 255, 0.5);
			font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
			padding: 4px 8px;
			background: rgba(255, 255, 255, 0.05);
			border-radius: 4px;
		`;
		centerSection.appendChild(this.sizeIndicator);

		bar.appendChild(centerSection);

		// Right section - Reload + Close buttons
		const rightSection = document.createElement('div');
		rightSection.style.cssText = `display: flex; align-items: center; gap: 8px;`;

		// Reload button
		const reloadBtn = this.createReloadButton();
		rightSection.appendChild(reloadBtn);

		// Close button
		const closeBtn = this.createCloseButton();
		rightSection.appendChild(closeBtn);

		bar.appendChild(rightSection);

		return bar;
	}

	private createDeviceButton(device: DevicePreset): HTMLElement {
		const config = DEVICE_PRESETS[device];
		const isActive = this.state.device === device;

		const btn = document.createElement('button');
		btn.title = config.name;
		btn.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			padding: 6px 12px;
			background: ${isActive ? 'rgba(59, 130, 246, 0.2)' : 'transparent'};
			border: 1px solid ${isActive ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.1)'};
			border-radius: 6px;
			color: ${isActive ? '#60a5fa' : 'rgba(255, 255, 255, 0.7)'};
			font-size: 12px;
			cursor: pointer;
			transition: all 0.15s ease;
		`;

		// Icon
		btn.appendChild(this.createDeviceIcon(device));

		// Label
		const label = document.createElement('span');
		label.textContent = config.name;
		btn.appendChild(label);

		btn.addEventListener('mouseenter', () => {
			if (!isActive) {
				btn.style.background = 'rgba(255, 255, 255, 0.08)';
				btn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
			}
		});

		btn.addEventListener('mouseleave', () => {
			if (!isActive) {
				btn.style.background = 'transparent';
				btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
			}
		});

		btn.addEventListener('click', () => {
			this.state.device = device;
			this.callbacks.onDeviceChange?.(device);
			this.render();
		});

		return btn;
	}

	private createDeviceIcon(device: DevicePreset): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		svg.setAttribute('stroke-width', '1.5');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

		switch (device) {
			case 'auto':
				path.setAttribute('d', 'M2 4h12v8H2zM5 14h6');
				break;
			case 'desktop':
				path.setAttribute('d', 'M2 3h12v9H2zM6 14h4M8 12v2');
				break;
			case 'tablet':
				path.setAttribute('d', 'M4 2h8v12H4zM7 12h2');
				break;
			case 'mobile':
				path.setAttribute('d', 'M5 1h6v14H5zM7 12h2');
				break;
		}

		path.setAttribute('stroke-linecap', 'round');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);

		return svg;
	}

	private createCloseButton(): HTMLElement {
		const btn = document.createElement('button');
		btn.title = 'Close fullscreen (ESC)';
		btn.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			background: rgba(255, 255, 255, 0.08);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 8px;
			color: rgba(255, 255, 255, 0.9);
			cursor: pointer;
			transition: all 0.15s ease;
			margin-left: 8px;
		`;

		// X icon
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '18');
		svg.setAttribute('height', '18');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		svg.setAttribute('stroke-width', '2');
		svg.setAttribute('stroke-linecap', 'round');

		const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path1.setAttribute('d', 'M4 4L12 12');
		svg.appendChild(path1);

		const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path2.setAttribute('d', 'M12 4L4 12');
		svg.appendChild(path2);

		btn.appendChild(svg);

		btn.addEventListener('mouseenter', () => {
			btn.style.background = 'rgba(239, 68, 68, 0.2)';
			btn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
			btn.style.color = '#ef4444';
		});

		btn.addEventListener('mouseleave', () => {
			btn.style.background = 'rgba(255, 255, 255, 0.08)';
			btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
			btn.style.color = 'rgba(255, 255, 255, 0.9)';
		});

		btn.addEventListener('click', () => this.close());

		return btn;
	}

	private createReloadButton(): HTMLElement {
		const btn = document.createElement('button');
		btn.title = 'Reload component';
		btn.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			background: rgba(255, 255, 255, 0.08);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 8px;
			color: rgba(255, 255, 255, 0.9);
			cursor: pointer;
			transition: all 0.15s ease;
		`;

		// Reload icon (circular arrow)
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '16');
		svg.setAttribute('height', '16');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		svg.setAttribute('stroke-width', '1.5');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');

		// Circular arrow path
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M14 8A6 6 0 1 1 8 2');
		svg.appendChild(path);

		// Arrow head
		const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		arrow.setAttribute('d', 'M8 5V2h3');
		svg.appendChild(arrow);

		btn.appendChild(svg);

		btn.addEventListener('mouseenter', () => {
			btn.style.background = 'rgba(59, 130, 246, 0.2)';
			btn.style.borderColor = 'rgba(59, 130, 246, 0.4)';
			btn.style.color = '#60a5fa';
		});

		btn.addEventListener('mouseleave', () => {
			btn.style.background = 'rgba(255, 255, 255, 0.08)';
			btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
			btn.style.color = 'rgba(255, 255, 255, 0.9)';
		});

		btn.addEventListener('click', () => this.reloadComponent());

		return btn;
	}

	private reloadComponent(): void {
		// Re-send the code to the webview to trigger a fresh render
		this.sendCodeToWebview();
	}

	private createContentArea(): HTMLElement {
		const content = document.createElement('div');
		content.className = 'fullscreen-content';
		content.style.cssText = `
			flex: 1;
			display: flex;
			align-items: center;
			justify-content: center;
			overflow: auto;
			padding: 40px;
		`;

		return content;
	}

	private createWebview(): void {
		if (!this.contentContainer) {
			return;
		}

		// Calculate dimensions based on device preset
		const config = DEVICE_PRESETS[this.state.device];
		const containerRect = this.contentContainer.getBoundingClientRect();

		// Available space with padding
		const padding = 80; // 40px on each side
		const availableWidth = containerRect.width - padding;
		const availableHeight = containerRect.height - padding;

		let viewportWidth: number;
		let viewportHeight: number;
		let scale: number;

		if (config.width === 'auto' || config.height === 'auto') {
			// Auto mode - use all available space, no scaling
			viewportWidth = availableWidth;
			viewportHeight = availableHeight;
			scale = 1;
		} else {
			// Device preset - REAL EMULATION
			// The webview gets the full device resolution (e.g., 1280×800)
			// We use CSS transform to scale it visually to fit the screen
			viewportWidth = config.width;
			viewportHeight = config.height;

			// Calculate scale factor to fit within available space
			const scaleX = availableWidth / viewportWidth;
			const scaleY = availableHeight / viewportHeight;
			scale = Math.min(scaleX, scaleY, 1); // Never scale up beyond 1:1
		}

		// Calculate the visual size after scaling (for the wrapper)
		const visualWidth = Math.round(viewportWidth * scale);
		const visualHeight = Math.round(viewportHeight * scale);

		// Create webview container with device frame styling
		// This container gets the FULL viewport size (e.g., 1280×800)
		// CSS transform scales it down visually while keeping internal viewport size
		this.webviewContainer = document.createElement('div');
		this.webviewContainer.className = 'fullscreen-webview-container';
		this.webviewContainer.style.cssText = `
			width: ${viewportWidth}px;
			height: ${viewportHeight}px;
			background: #ffffff;
			border-radius: ${scale < 1 ? Math.round(12 / scale) : 12}px;
			overflow: hidden;
			transform: scale(${scale});
			transform-origin: top left;
			box-shadow: 0 ${Math.round(24 / scale)}px ${Math.round(80 / scale)}px rgba(0, 0, 0, 0.5);
		`;

		// Wrapper to contain the scaled webview and center it
		const wrapper = document.createElement('div');
		wrapper.className = 'fullscreen-webview-wrapper';
		wrapper.style.cssText = `
			width: ${visualWidth}px;
			height: ${visualHeight}px;
			position: relative;
			border-radius: ${scale < 1 ? 12 : 12}px;
			overflow: hidden;
			box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.3);
		`;

		// Device frame (optional visual) - on wrapper
		if (this.state.device !== 'auto') {
			wrapper.style.border = '8px solid #2a2a2a';
			wrapper.style.borderRadius = '20px';
		}

		wrapper.appendChild(this.webviewContainer);

		// Update size indicator with actual viewport dimensions and scale
		this.updateSizeIndicator(viewportWidth, viewportHeight, config, scale);

		this.contentContainer.appendChild(wrapper);

		// Create webview element
		this.webviewElement = this.webviewService.createWebviewElement({
			title: `Fullscreen: ${this.state.sandbox.id}`,
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

		// Mount webview
		this.webviewElement.mountTo(this.webviewContainer, getWindow(this.editorContainer));

		// Set HTML content
		this.webviewElement.setHtml(this.getFullscreenHtml());

		// Listen for ready message and send code
		this._register(this.webviewElement.onMessage(e => {
			if (e.message.type === 'sandbox-ready') {
				this.sendCodeToWebview();
			}
		}));
	}

	private getFullscreenHtml(): string {
		// Similar to SandboxCard but optimized for fullscreen viewing
		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Roopik Fullscreen Preview</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%;
            height: 100%;
            overflow: auto;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #ffffff;
        }
        #root {
            min-height: 100%;
            width: 100%;
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
        <div class="sandbox-loading">Loading component...</div>
    </div>
    <script src="https://unpkg.com/@babel/standalone@7.23.5/babel.min.js"></script>
    <script>
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
                let processedCode = code;

                const importRegex = /import\\s+(?:([\\w]+)\\s*,?\\s*)?(?:\\{([^}]+)\\})?\\s*from\\s*['"][^'"]+['"];?/g;
                const destructuredImports = [];

                processedCode = processedCode.replace(importRegex, (match, defaultImport, namedImports) => {
                    if (namedImports) {
                        const imports = namedImports.split(',').map(s => s.trim());
                        imports.forEach(imp => {
                            const parts = imp.split(/\\s+as\\s+/);
                            const originalName = parts[0].trim();
                            const localName = parts[1] ? parts[1].trim() : originalName;
                            destructuredImports.push({ originalName, localName });
                        });
                    }
                    return '';
                });

                if (destructuredImports.length > 0) {
                    const destructureStatement = 'const { ' +
                        destructuredImports.map(i => i.originalName === i.localName ? i.originalName : i.originalName + ': ' + i.localName).join(', ') +
                        ' } = React;\\n';
                    processedCode = destructureStatement + processedCode;
                }

                processedCode = processedCode.replace(/export\\s+default\\s+function\\s+(\\w+)?/, 'function Component');
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

                vscode.postMessage({ type: 'rendered', sandboxId: '${this.state.sandbox.id}' });
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
                vscode.postMessage({ type: 'error', sandboxId: '${this.state.sandbox.id}', message: error.message });
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

        vscode.postMessage({ type: 'sandbox-ready', sandboxId: '${this.state.sandbox.id}' });
    </script>
</body>
</html>`;
	}

	private sendCodeToWebview(): void {
		if (this.state.sandbox.sessionCode && this.webviewElement) {
			this.webviewElement.postMessage({
				type: 'init',
				code: this.state.sandbox.sessionCode,
				cdnUrls: this.state.sandbox.cdnUrls || []
			});
		}
	}

	private setupKeyboardHandler(): void {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.close();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		this._register({
			dispose: () => document.removeEventListener('keydown', handleKeyDown)
		});
	}

	private setupResizeHandler(): void {
		// Debounced resize handler to update webview container dimensions
		let resizeTimeout: ReturnType<typeof setTimeout> | undefined;

		const handleResize = () => {
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}
			resizeTimeout = setTimeout(() => {
				this.updateWebviewSize();
			}, 100); // Debounce by 100ms
		};

		window.addEventListener('resize', handleResize);
		this._register({
			dispose: () => {
				window.removeEventListener('resize', handleResize);
				if (resizeTimeout) {
					clearTimeout(resizeTimeout);
				}
			}
		});
	}

	private updateWebviewSize(): void {
		if (!this.contentContainer || !this.webviewContainer) {
			return;
		}

		const config = DEVICE_PRESETS[this.state.device];
		const containerRect = this.contentContainer.getBoundingClientRect();

		// Available space with padding
		const padding = 80; // 40px on each side
		const availableWidth = containerRect.width - padding;
		const availableHeight = containerRect.height - padding;

		let viewportWidth: number;
		let viewportHeight: number;
		let scale: number;

		if (config.width === 'auto' || config.height === 'auto') {
			// Auto mode - use all available space, no scaling
			viewportWidth = availableWidth;
			viewportHeight = availableHeight;
			scale = 1;
		} else {
			// Device preset - REAL EMULATION
			viewportWidth = config.width;
			viewportHeight = config.height;

			// Calculate scale factor to fit within available space
			const scaleX = availableWidth / viewportWidth;
			const scaleY = availableHeight / viewportHeight;
			scale = Math.min(scaleX, scaleY, 1); // Never scale up beyond 1:1
		}

		// Calculate the visual size after scaling (for the wrapper)
		const visualWidth = Math.round(viewportWidth * scale);
		const visualHeight = Math.round(viewportHeight * scale);

		// Update webview container - full viewport size with CSS transform
		this.webviewContainer.style.width = `${viewportWidth}px`;
		this.webviewContainer.style.height = `${viewportHeight}px`;
		this.webviewContainer.style.transform = `scale(${scale})`;
		this.webviewContainer.style.transformOrigin = 'top left';
		this.webviewContainer.style.borderRadius = `${scale < 1 ? Math.round(12 / scale) : 12}px`;

		// Update wrapper size
		const wrapper = this.webviewContainer.parentElement;
		if (wrapper && wrapper.classList.contains('fullscreen-webview-wrapper')) {
			wrapper.style.width = `${visualWidth}px`;
			wrapper.style.height = `${visualHeight}px`;
		}

		// Update size indicator
		this.updateSizeIndicator(viewportWidth, viewportHeight, config, scale);
	}

	private updateSizeIndicator(viewportWidth: number, viewportHeight: number, config: IDevicePresetConfig, scale: number = 1): void {
		if (!this.sizeIndicator) {
			return;
		}

		if (config.width === 'auto' || config.height === 'auto') {
			// Auto mode - just show current size
			this.sizeIndicator.textContent = `${Math.round(viewportWidth)} × ${Math.round(viewportHeight)}`;
			this.sizeIndicator.style.color = 'rgba(255, 255, 255, 0.5)';
		} else {
			// Device preset - show ACTUAL viewport size and visual scale
			const targetWidth = config.width as number;
			const targetHeight = config.height as number;

			if (scale < 0.99) {
				// Scaled down visually - show viewport size and visual scale percentage
				const scalePercent = Math.round(scale * 100);
				this.sizeIndicator.textContent = `${targetWidth} × ${targetHeight} @ ${scalePercent}%`;
				this.sizeIndicator.style.color = 'rgba(251, 191, 36, 0.7)'; // Amber to indicate visual scaling
			} else {
				// Full size (1:1)
				this.sizeIndicator.textContent = `${targetWidth} × ${targetHeight} (1:1)`;
				this.sizeIndicator.style.color = 'rgba(34, 197, 94, 0.7)'; // Green for full size
			}
		}
	}

	/**
	 * Calculate a human-readable ratio from a scale value
	 * e.g., 0.8 -> "4:5", 0.75 -> "3:4", 0.5 -> "1:2"
	 */
	private calculateRatio(scale: number): string {
		// Common ratios to match against
		const commonRatios = [
			{ ratio: '1:1', value: 1 },
			{ ratio: '9:10', value: 0.9 },
			{ ratio: '4:5', value: 0.8 },
			{ ratio: '3:4', value: 0.75 },
			{ ratio: '2:3', value: 0.667 },
			{ ratio: '1:2', value: 0.5 },
			{ ratio: '1:3', value: 0.333 },
			{ ratio: '1:4', value: 0.25 },
		];

		// Find closest matching ratio
		let closest = commonRatios[0];
		let minDiff = Math.abs(scale - closest.value);

		for (const r of commonRatios) {
			const diff = Math.abs(scale - r.value);
			if (diff < minDiff) {
				minDiff = diff;
				closest = r;
			}
		}

		// If close enough to a common ratio, use it
		if (minDiff < 0.05) {
			return closest.ratio;
		}

		// Otherwise, calculate approximate ratio
		// Find GCD to simplify the fraction
		const percent = Math.round(scale * 100);
		const gcd = this.gcd(percent, 100);
		const numerator = percent / gcd;
		const denominator = 100 / gcd;

		// If denominator is reasonable, show as ratio
		if (denominator <= 10) {
			return `${numerator}:${denominator}`;
		}

		// Fall back to percentage for odd values
		return `${percent}%`;
	}

	/**
	 * Calculate Greatest Common Divisor using Euclidean algorithm
	 */
	private gcd(a: number, b: number): number {
		return b === 0 ? a : this.gcd(b, a % b);
	}

	private close(): void {
		// Animate out
		this.overlay.style.opacity = '0';
		setTimeout(() => {
			this.callbacks.onClose();
			this.dispose();
		}, 300);
	}

	public override dispose(): void {
		if (this.webviewElement) {
			this.webviewElement.dispose();
			this.webviewElement = undefined;
		}
		if (this.overlay.parentElement) {
			this.overlay.parentElement.removeChild(this.overlay);
		}
		super.dispose();
	}
}
