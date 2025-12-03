/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useEffect, useState } from 'react';
import type { Sandbox, Point } from '../../types';

interface SandboxCardProps {
	sandbox: Sandbox;
	isSelected: boolean;
	isFocused: boolean;
	isDragging?: boolean;
	dragOffset?: Point;
	isOverlapping?: boolean;
	onMouseDown: (e: React.MouseEvent) => void;
	onClick: () => void;
	onDoubleClick: () => void;
	onDelete: () => void;
}

/**
 * Sandbox template HTML with Babel for client-side React transpilation
 */
const SANDBOX_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval' https://unpkg.com; connect-src https://unpkg.com;">
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
	</style>
</head>
<body>
	<div id="root">
		<div style="color: #666; font-size: 14px;">Initializing sandbox...</div>
	</div>
	<script src="https://unpkg.com/@babel/standalone@7.23.5/babel.min.js"></script>
	<script>
		function loadCDNScripts(urls) {
			return new Promise((resolve, reject) => {
				if (!urls || urls.length === 0) { resolve(); return; }
				let loaded = 0;
				urls.forEach(url => {
					const script = document.createElement('script');
					script.src = url;
					script.crossOrigin = 'anonymous';
					script.onload = () => { loaded++; if (loaded === urls.length) resolve(); };
					script.onerror = () => reject(new Error('Failed to load: ' + url));
					document.head.appendChild(script);
				});
			});
		}

		function renderComponent(code) {
			try {
				const transpiled = Babel.transform(code, {
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
				window.parent.postMessage({ type: 'ready' }, '*');
			} catch (error) {
				const root = document.getElementById('root');
				root.innerHTML = '<div class="sandbox-error"><h3>Component Error</h3><pre>' + error.message + '</pre></div>';
				window.parent.postMessage({ type: 'error', message: error.message }, '*');
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
					root.innerHTML = '<div class="sandbox-error"><h3>Initialization Error</h3><pre>' + error.message + '</pre></div>';
				}
			} else if (message.type === 'update') {
				renderComponent(message.code);
			}
		});

		window.parent.postMessage({ type: 'sandbox-ready' }, '*');
	</script>
</body>
</html>
`;

export function SandboxCard({
	sandbox,
	isSelected,
	isFocused,
	isDragging = false,
	dragOffset,
	isOverlapping = false,
	onMouseDown,
	onClick,
	onDoubleClick,
	onDelete
}: SandboxCardProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [isHovered, setIsHovered] = useState(false);

	// Send sandboxMessage to iframe when it loads
	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) return;

		const handleIframeLoad = () => {
			setTimeout(() => {
				iframe.contentWindow?.postMessage(sandbox.sandboxMessage, '*');
			}, 100);
		};

		iframe.addEventListener('load', handleIframeLoad);
		return () => iframe.removeEventListener('load', handleIframeLoad);
	}, [sandbox.id, sandbox.sandboxMessage]);

	const handleExpandClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		// TODO: Implement fullscreen mode
	};

	const handleDeleteClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onDelete();
	};

	// Build className
	const classNames = ['sandbox-card'];
	if (isSelected) classNames.push('selected');
	if (isFocused) classNames.push('focused');
	if (isDragging) classNames.push('dragging');
	if (isOverlapping) classNames.push('overlapping');

	return (
		<div
			className={classNames.join(' ')}
			style={{
				left: sandbox.x,
				top: sandbox.y,
				width: sandbox.width,
				height: sandbox.height,
				zIndex: sandbox.zIndex,
				transform: dragOffset ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` : 'none',
			}}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClick();
			}}
			onDoubleClick={(e) => {
				if (e.target === e.currentTarget) onDoubleClick();
			}}
		>
			{/* Header with label and actions */}
			<div className="card-header">
				{/* Drag handle + label */}
				<div
					className="card-label"
					onMouseDown={(e) => {
						e.stopPropagation();
						onMouseDown(e);
					}}
				>
					<svg className="drag-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
						<circle cx="4" cy="4" r="1.5" fill="currentColor" />
						<circle cx="12" cy="4" r="1.5" fill="currentColor" />
						<circle cx="4" cy="8" r="1.5" fill="currentColor" />
						<circle cx="12" cy="8" r="1.5" fill="currentColor" />
						<circle cx="4" cy="12" r="1.5" fill="currentColor" />
						<circle cx="12" cy="12" r="1.5" fill="currentColor" />
					</svg>
					<span className="title">{sandbox.id}</span>
				</div>

				{/* Action buttons */}
				{(isHovered || isSelected || isFocused) && (
					<div className="card-actions">
						<button onClick={handleExpandClick} title="Expand to fullscreen">
							<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M2 6 L2 2 L6 2" />
								<path d="M10 2 L14 2 L14 6" />
								<path d="M14 10 L14 14 L10 14" />
								<path d="M6 14 L2 14 L2 10" />
							</svg>
						</button>
						<button className="delete" onClick={handleDeleteClick} title="Delete sandbox">
							<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<path d="M4 4 L12 12" />
								<path d="M12 4 L4 12" />
							</svg>
						</button>
					</div>
				)}
			</div>

			{/* Iframe content */}
			<div className="card-body">
				<iframe
					ref={iframeRef}
					srcDoc={SANDBOX_HTML}
					sandbox="allow-scripts allow-same-origin"
					title={sandbox.id}
					style={{
						pointerEvents: isDragging ? 'none' : 'auto',
					}}
				/>
			</div>
		</div>
	);
}
