/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * CanvasPanel - WebviewPanel wrapper for the infinite canvas
 *
 * Key feature: retainContextWhenHidden preserves state across tab switches!
 */
export class CanvasPanel {
	private readonly panel: vscode.WebviewPanel;
	private readonly extensionUri: vscode.Uri;
	private disposed = false;

	constructor(extensionUri: vscode.Uri) {
		this.extensionUri = extensionUri;

		this.panel = vscode.window.createWebviewPanel(
			'roopikCanvas',
			'Roopik Canvas',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true, // Key for persistence!
				localResourceRoots: [extensionUri]
			}
		);

		this.panel.webview.html = this.getHtml();
		this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this));
		this.panel.onDidDispose(() => this.dispose());

		console.log('[CanvasPanel] Created');
	}

	reveal(): void {
		this.panel.reveal();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.panel.dispose();
	}

	onDidDispose(callback: () => void): void {
		this.panel.onDidDispose(callback);
	}

	addComponent(): void {
		this.panel.webview.postMessage({
			type: 'addComponent',
			payload: {
				id: `component-${Date.now()}`,
				code: `export default function Button() {\n  return <button>Click me</button>;\n}`
			}
		});
	}

	private async handleMessage(message: { type: string; payload?: unknown }): Promise<void> {
		console.log('[CanvasPanel] Message:', message.type);

		switch (message.type) {
			case 'ready':
				console.log('[CanvasPanel] Webview ready');
				break;

			case 'transformCode':
				await this.handleTransformCode(message.payload as TransformPayload);
				break;
		}
	}

	private async handleTransformCode(payload: TransformPayload): Promise<void> {
		try {
			const result = await vscode.commands.executeCommand<{ html: string }>(
				'roopik.core.transformCode',
				payload.code,
				{}
			);

			this.panel.webview.postMessage({
				type: 'transformComplete',
				payload: { html: result?.html ?? '<div>Error</div>', componentId: payload.componentId }
			});
		} catch (error) {
			this.panel.webview.postMessage({
				type: 'transformError',
				payload: { error: String(error), componentId: payload.componentId }
			});
		}
	}

	private getHtml(): string {
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		style-src 'unsafe-inline';
		script-src 'nonce-${nonce}';
		frame-src blob: data:;
	">
	<title>Roopik Canvas</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		html, body {
			width: 100%; height: 100%;
			overflow: hidden;
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
		}
		#canvas {
			width: 100%; height: 100%;
			position: relative;
			overflow: hidden;
			cursor: grab;
		}
		#canvas.dragging { cursor: grabbing; }
		#content {
			position: absolute;
			transform-origin: 0 0;
			will-change: transform;
		}
		.card {
			position: absolute;
			width: 320px; height: 240px;
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			box-shadow: 0 4px 12px rgba(0,0,0,0.15);
			overflow: hidden;
			cursor: move;
		}
		.card:hover { border-color: var(--vscode-focusBorder); }
		.card-header {
			padding: 8px 12px;
			background: var(--vscode-sideBar-background);
			border-bottom: 1px solid var(--vscode-panel-border);
			font-size: 12px;
			display: flex;
			justify-content: space-between;
		}
		.card-body {
			width: 100%; height: calc(100% - 36px);
			background: white;
		}
		.card-body iframe { width: 100%; height: 100%; border: none; }
		#status {
			position: fixed;
			bottom: 0; left: 0; right: 0;
			height: 24px;
			background: var(--vscode-statusBar-background);
			color: var(--vscode-statusBar-foreground);
			font-size: 11px;
			display: flex;
			align-items: center;
			padding: 0 12px;
			gap: 16px;
		}
		.empty {
			position: absolute;
			top: 50%; left: 50%;
			transform: translate(-50%, -50%);
			text-align: center;
			color: var(--vscode-descriptionForeground);
		}
	</style>
</head>
<body>
	<div id="canvas">
		<div id="content"></div>
		<div class="empty" id="empty">
			<h2>Roopik Canvas</h2>
			<p>Click "Add Component" to start</p>
		</div>
	</div>
	<div id="status">
		<span id="zoom">100%</span>
		<span id="count">0 components</span>
	</div>

	<script nonce="${nonce}">
	(function() {
		const vscode = acquireVsCodeApi();
		const canvas = document.getElementById('canvas');
		const content = document.getElementById('content');
		const empty = document.getElementById('empty');
		const zoomEl = document.getElementById('zoom');
		const countEl = document.getElementById('count');

		const state = { x: 0, y: 0, scale: 1, dragging: false, target: null, start: { x: 0, y: 0 } };
		const components = new Map();

		function updateTransform() {
			content.style.transform = \`translate(\${state.x}px, \${state.y}px) scale(\${state.scale})\`;
			zoomEl.textContent = Math.round(state.scale * 100) + '%';
		}

		function updateCount() {
			const n = components.size;
			countEl.textContent = n + ' component' + (n !== 1 ? 's' : '');
			empty.style.display = n === 0 ? 'block' : 'none';
		}

		function createCard(id, code, x = 100, y = 100) {
			const card = document.createElement('div');
			card.className = 'card';
			card.dataset.id = id;
			card.style.left = x + 'px';
			card.style.top = y + 'px';
			card.innerHTML = \`
				<div class="card-header">
					<span>\${id}</span>
					<span style="cursor:pointer">×</span>
				</div>
				<div class="card-body">
					<iframe sandbox="allow-scripts"></iframe>
				</div>
			\`;

			card.querySelector('.card-header').addEventListener('mousedown', (e) => {
				if (e.target.textContent === '×') {
					card.remove();
					components.delete(id);
					updateCount();
					return;
				}
				state.dragging = true;
				state.target = card;
				state.start = { x: e.clientX - parseInt(card.style.left), y: e.clientY - parseInt(card.style.top) };
				canvas.classList.add('dragging');
			});

			content.appendChild(card);
			components.set(id, { code, x, y });
			updateCount();

			vscode.postMessage({ type: 'transformCode', payload: { code, componentId: id } });
			return card;
		}

		canvas.addEventListener('mousedown', (e) => {
			if (e.target === canvas || e.target === content) {
				state.dragging = true;
				state.target = null;
				state.start = { x: e.clientX - state.x, y: e.clientY - state.y };
				canvas.classList.add('dragging');
			}
		});

		document.addEventListener('mousemove', (e) => {
			if (!state.dragging) return;
			if (state.target) {
				state.target.style.left = (e.clientX - state.start.x) + 'px';
				state.target.style.top = (e.clientY - state.start.y) + 'px';
			} else {
				state.x = e.clientX - state.start.x;
				state.y = e.clientY - state.start.y;
				updateTransform();
			}
		});

		document.addEventListener('mouseup', () => {
			state.dragging = false;
			state.target = null;
			canvas.classList.remove('dragging');
		});

		canvas.addEventListener('wheel', (e) => {
			e.preventDefault();
			const delta = e.deltaY > 0 ? 0.9 : 1.1;
			const newScale = Math.max(0.1, Math.min(3, state.scale * delta));
			const rect = canvas.getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			state.x = mx - (mx - state.x) * (newScale / state.scale);
			state.y = my - (my - state.y) * (newScale / state.scale);
			state.scale = newScale;
			updateTransform();
		});

		window.addEventListener('message', (e) => {
			const msg = e.data;
			if (msg.type === 'addComponent') {
				const n = components.size;
				createCard(msg.payload.id, msg.payload.code, 100 + (n % 3) * 350, 100 + Math.floor(n / 3) * 280);
			} else if (msg.type === 'transformComplete') {
				const card = document.querySelector(\`[data-id="\${msg.payload.componentId}"]\`);
				if (card) card.querySelector('iframe').srcdoc = msg.payload.html;
			}
		});

		vscode.postMessage({ type: 'ready' });
	})();
	</script>
</body>
</html>`;
	}
}

function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < 32; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

interface TransformPayload {
	code: string;
	componentId: string;
}
