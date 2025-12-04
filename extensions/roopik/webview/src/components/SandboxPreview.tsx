/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useEffect } from 'react';
import type { Sandbox } from '../types';
import '../canvasView/styles/sandboxPreview.css';

interface SandboxPreviewProps {
	sandbox: Sandbox;
	isSelected: boolean;
	isFocused: boolean;
	isDragging?: boolean;
	dragOffset?: { x: number; y: number };
	onMouseDown: (e: React.MouseEvent) => void;
	onClick: () => void;
	onDoubleClick: () => void;
	onDelete: () => void;
}

export function SandboxPreview({ sandbox, isSelected, isFocused, isDragging = false, dragOffset, onMouseDown, onClick, onDoubleClick, onDelete }: SandboxPreviewProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);

	// Handler for expand button (TODO: implement fullscreen mode)
	const handleExpandClick = () => {
		// TODO: Implement fullscreen/expand mode in future
		console.log('[SandboxPreview] Expand clicked for:', sandbox.id);
	};

	// Handler for delete button
	const handleDeleteClick = () => {
		onDelete();
	};

	// Send sandboxMessage to iframe when it loads
	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) {return;}

		const handleIframeLoad = () => {
			console.log('[SandboxPreview] Iframe loaded, sending message:', sandbox.id);

			// Wait a bit for sandbox template to initialize
			setTimeout(() => {
				iframe.contentWindow?.postMessage(sandbox.sandboxMessage, '*');
				console.log('[SandboxPreview] Message sent to iframe:', sandbox.sandboxMessage.type);
			}, 100);
		};

		iframe.addEventListener('load', handleIframeLoad);
		return () => {
			iframe.removeEventListener('load', handleIframeLoad);
		};
	}, [sandbox.id, sandbox.sandboxMessage]);

	// Create inline HTML with sandbox_template.html
	// For now, we'll use a simple loading template and rely on postMessage
	const sandboxHTML = `
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
        let cdnScriptsLoaded = false;

        function loadCDNScripts(urls) {
            return new Promise((resolve, reject) => {
                if (urls.length === 0) {
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
                console.error('[Sandbox] Component error:', error);
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
                    console.error('[Sandbox] Init error:', error);
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

	// Build CSS class names based on state
	const classNames = [
		'sandbox-preview',
		isSelected && 'selected',
		isFocused && 'focused',
		isDragging && 'dragging',
	].filter(Boolean).join(' ');

	return (
		<div
			className={classNames}
			style={{
				left: sandbox.x,
				top: sandbox.y,
				width: sandbox.width,
				height: sandbox.height,
				zIndex: sandbox.zIndex,
				transform: dragOffset ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` : 'none',
			}}
			onClick={(e) => {
				// Select on click anywhere on container background (not label, not iframe)
				if (e.target === e.currentTarget) {
					onClick();
				}
			}}
			onDoubleClick={(e) => {
				// Focus mode - double-click anywhere on container to zoom in
				if (e.target === e.currentTarget) {
					onDoubleClick();
				}
			}}
		>
			{/* Header with label and actions */}
			<div className="sandbox-header">
				{/* Sandbox ID label - left side */}
				<div
					className="sandbox-label"
					onMouseDown={(e) => {
						e.stopPropagation();
						onMouseDown(e);
					}}
				>
					{/* Drag icon */}
					<svg
						className="drag-icon"
						width="14"
						height="14"
						viewBox="0 0 16 16"
						fill="none"
					>
						<circle cx="4" cy="4" r="1.5" fill="currentColor" />
						<circle cx="12" cy="4" r="1.5" fill="currentColor" />
						<circle cx="4" cy="8" r="1.5" fill="currentColor" />
						<circle cx="12" cy="8" r="1.5" fill="currentColor" />
						<circle cx="4" cy="12" r="1.5" fill="currentColor" />
						<circle cx="12" cy="12" r="1.5" fill="currentColor" />
					</svg>

					<span className="title">{sandbox.id}</span>
				</div>

				{/* Action buttons - right side */}
				<div className="sandbox-actions">
					{/* Expand button */}
					<button
						onClick={(e) => {
							e.stopPropagation();
							handleExpandClick();
						}}
						title="Expand to fullscreen (Coming soon)"
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 16 16"
							fill="none"
							stroke="rgba(255, 255, 255, 0.9)"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M2 6 L2 2 L6 2" />
							<path d="M10 2 L14 2 L14 6" />
							<path d="M14 10 L14 14 L10 14" />
							<path d="M6 14 L2 14 L2 10" />
						</svg>
					</button>

					{/* Delete button */}
					<button
						className="delete"
						onClick={(e) => {
							e.stopPropagation();
							handleDeleteClick();
						}}
						title="Delete sandbox"
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 16 16"
							fill="none"
							stroke="rgba(255, 255, 255, 0.9)"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M4 4 L12 12" />
							<path d="M12 4 L4 12" />
						</svg>
					</button>
				</div>
			</div>

			{/* Content area with iframe */}
			<div className="sandbox-content">
				<iframe
					ref={iframeRef}
					srcDoc={sandboxHTML}
					sandbox="allow-scripts allow-same-origin"
					title={sandbox.id}
				/>
			</div>
		</div>
	);
}
