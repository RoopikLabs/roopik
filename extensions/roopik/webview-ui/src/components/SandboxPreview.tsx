/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useEffect, useState } from 'react';
import type { Sandbox } from '../types';

interface SandboxPreviewProps {
	sandbox: Sandbox;
	isSelected: boolean;
	isFocused: boolean;
	onMouseDown: (e: React.MouseEvent) => void;
	onClick: () => void;
	onDoubleClick: () => void;
	onDelete: () => void;
}

export function SandboxPreview({ sandbox, isSelected, isFocused, onMouseDown, onClick, onDoubleClick, onDelete }: SandboxPreviewProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [isHovered, setIsHovered] = useState(false);

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

	return (
		<div
			className="sandbox"
			style={{
				position: 'absolute',
				left: sandbox.x,
				top: sandbox.y,
				width: sandbox.width,
				height: sandbox.height,
				zIndex: sandbox.zIndex,
				padding: '40px 120px', // Less top/bottom, 5x more left/right
				margin: '20px', // Add margin between containers
				display: 'flex',
				flexDirection: 'column',
				background: isSelected
					? 'linear-gradient(135deg, rgba(30, 30, 35, 0.95) 0%, rgba(20, 20, 25, 0.95) 100%)'
					: 'linear-gradient(135deg, rgba(40, 40, 45, 0.85) 0%, rgba(30, 30, 35, 0.85) 100%)',
				backdropFilter: 'blur(20px) saturate(180%)',
				WebkitBackdropFilter: 'blur(20px) saturate(180%)',
				borderRadius: '16px',
				border: isFocused
					? '2px solid rgba(0, 122, 204, 0.6)'
					: isSelected
					? '2px solid rgba(75, 85, 190, 0.6)'
					: isHovered
					? '2px solid rgba(255, 165, 0, 0.5)'
					: '1px solid rgba(255, 255, 255, 0.1)',
				boxShadow: isFocused
					? '0 0 0 4px rgba(0, 122, 204, 0.15), 0 20px 60px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
					: isSelected
					? '0 0 0 4px rgba(75, 85, 190, 0.15), 0 20px 60px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 20px rgba(75, 85, 190, 0.2)'
					: isHovered
					? '0 0 0 4px rgba(255, 165, 0, 0.1), 0 16px 48px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 20px rgba(255, 165, 0, 0.2)'
					: '0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
				transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
				cursor: 'pointer', // Show it's clickable
			}}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
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
			{/* Sandbox ID label - top left */}
			<div
				className="sandbox-label"
				style={{
					position: 'absolute',
					top: '16px',
					left: '20px',
					display: 'flex',
					alignItems: 'center',
					gap: '8px',
					cursor: 'move',
					userSelect: 'none',
					zIndex: 10,
				}}
				onMouseDown={(e) => {
					e.stopPropagation();
					onMouseDown(e);
				}}
			>
				{/* Drag icon */}
				<svg
					width="14"
					height="14"
					viewBox="0 0 16 16"
					fill="none"
					style={{
						opacity: isFocused ? 0.6 : isSelected ? 0.6 : 0.3,
						flexShrink: 0,
						color: isFocused ? '#007acc' : isSelected ? '#5865f2' : '#ffffff'
					}}
				>
					<circle cx="4" cy="4" r="1.5" fill="currentColor" />
					<circle cx="12" cy="4" r="1.5" fill="currentColor" />
					<circle cx="4" cy="8" r="1.5" fill="currentColor" />
					<circle cx="12" cy="8" r="1.5" fill="currentColor" />
					<circle cx="4" cy="12" r="1.5" fill="currentColor" />
					<circle cx="12" cy="12" r="1.5" fill="currentColor" />
				</svg>

				<span
					style={{
						fontSize: '12px',
						fontWeight: 600,
						color: isFocused ? '#4fc3f7' : isSelected ? '#7c87f7' : 'rgba(255, 255, 255, 0.6)',
						letterSpacing: '0.05em',
						textTransform: 'uppercase',
					}}
				>
					{sandbox.id}
				</span>
			</div>

			{/* Action buttons - top right (visible on hover, selected, or focused) */}
			{(isHovered || isSelected || isFocused) && (
				<div
					style={{
						position: 'absolute',
						top: '16px',
						right: '20px',
						display: 'flex',
						alignItems: 'center',
						gap: '8px',
						zIndex: 10,
					}}
				>
					{/* Expand button */}
					<button
						onClick={(e) => {
							e.stopPropagation();
							handleExpandClick();
						}}
						style={{
							background: 'transparent',
							border: 'none',
							padding: '4px',
							cursor: 'pointer',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							transition: 'all 0.2s ease',
							opacity: 0.7,
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.opacity = '1';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.opacity = '0.7';
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
							{/* Top-left arrow */}
							<path d="M2 6 L2 2 L6 2" />
							{/* Top-right arrow */}
							<path d="M10 2 L14 2 L14 6" />
							{/* Bottom-right arrow */}
							<path d="M14 10 L14 14 L10 14" />
							{/* Bottom-left arrow */}
							<path d="M6 14 L2 14 L2 10" />
						</svg>
					</button>

					{/* Delete button */}
					<button
						onClick={(e) => {
							e.stopPropagation();
							handleDeleteClick();
						}}
						style={{
							background: 'transparent',
							border: 'none',
							padding: '4px',
							cursor: 'pointer',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							transition: 'all 0.2s ease',
							opacity: 0.7,
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.opacity = '1';
							const svg = e.currentTarget.querySelector('svg');
							if (svg) svg.setAttribute('stroke', '#ef4444');
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.opacity = '0.7';
							const svg = e.currentTarget.querySelector('svg');
							if (svg) svg.setAttribute('stroke', 'rgba(255, 255, 255, 0.9)');
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
			)}

			{/* Content area with iframe */}
			<div
				style={{
					flex: 1,
					position: 'relative',
					background: '#ffffff',
					borderRadius: '8px',
					overflow: 'hidden',
					boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.1)',
					marginTop: '10px', // Space for label
				}}
			>
				<iframe
					ref={iframeRef}
					className="sandbox-iframe"
					srcDoc={sandboxHTML}
					sandbox="allow-scripts allow-same-origin"
					title={sandbox.id}
					style={{
						width: '100%',
						height: '100%',
						border: 'none',
						display: 'block',
						pointerEvents: 'auto',
					}}
				/>
			</div>
		</div>
	);
}
