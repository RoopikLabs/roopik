/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useState, useMemo } from 'react';
import type { Sandbox, Point } from '../../types';

interface SandboxCardProps {
	sandbox: Sandbox;
	isSelected: boolean;
	isFocused: boolean;
	isDragging?: boolean;
	dragOffset?: Point;
	isOverlapping?: boolean;
	isExiting?: boolean;
	onMouseDown: (e: React.MouseEvent) => void;
	onClick: () => void;
	onDoubleClick: () => void;
	onDelete: () => void;
}

/**
 * Generate sandbox HTML that executes pre-built ESM from Core's pipeline
 *
 * The bundledCode is already transpiled by Core's ESBuild pipeline as ESM
 * with CDN imports (e.g., import React from "https://esm.sh/react@18.2.0").
 *
 * We embed the ESM code directly in <script type="module"> tag.
 * No blob URLs needed - the code runs inline as a module.
 */
function generateSandboxHTML(bundledCode: string): string {
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
		}
		.sandbox-error {
			display: flex;
			align-items: center;
			justify-content: center;
			min-height: 100vh;
			padding: 20px;
		}
		.sandbox-error .error-content {
			background: #fef2f2;
			border: 2px solid #fecaca;
			border-radius: 12px;
			padding: 24px;
			max-width: 500px;
		}
		.sandbox-error h3 {
			color: #dc2626;
			margin-bottom: 12px;
			font-size: 16px;
		}
		.sandbox-error pre {
			background: #f5f5f5;
			padding: 12px;
			border-radius: 8px;
			overflow-x: auto;
			font-size: 12px;
			color: #374151;
			white-space: pre-wrap;
			word-break: break-word;
		}
		.sandbox-loading {
			display: flex;
			align-items: center;
			justify-content: center;
			min-height: 100vh;
			color: #6b7280;
			font-size: 14px;
		}
	</style>
</head>
<body>
	<div id="root"><div class="sandbox-loading">Loading component...</div></div>

	<!-- ESM module script - the bundled code runs directly as a module -->
	<script type="module">
${bundledCode}

		// Notify parent that component is ready
		window.parent.postMessage({ type: 'sandbox-ready' }, '*');
	</script>

	<!-- Error handler for uncaught errors -->
	<script>
		window.onerror = function(msg, url, line, col, error) {
			console.error('[Sandbox] Error:', error || msg);
			const root = document.getElementById('root');
			if (root) {
				root.innerHTML = '<div class="sandbox-error"><div class="error-content">' +
					'<h3>Component Error</h3>' +
					'<pre>' + (error?.message || msg) + '</pre>' +
					'</div></div>';
			}
			window.parent.postMessage({
				type: 'sandbox-error',
				message: error?.message || String(msg)
			}, '*');
			return true;
		};
	</script>
</body>
</html>`;
}

/**
 * Loading state HTML shown while component is building
 */
const LOADING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Building...</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: #fafafa;
			display: flex;
			align-items: center;
			justify-content: center;
			min-height: 100vh;
		}
		.loading {
			text-align: center;
			color: #666;
		}
		.spinner {
			width: 40px;
			height: 40px;
			border: 3px solid #e5e7eb;
			border-top-color: #3b82f6;
			border-radius: 50%;
			animation: spin 1s linear infinite;
			margin: 0 auto 16px;
		}
		@keyframes spin {
			to { transform: rotate(360deg); }
		}
		.loading-text {
			font-size: 14px;
			color: #6b7280;
		}
	</style>
</head>
<body>
	<div class="loading">
		<div class="spinner"></div>
		<div class="loading-text">Building component...</div>
	</div>
</body>
</html>`;

/**
 * Error state HTML shown when build fails
 */
function generateErrorHTML(error: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Build Error</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: #fef2f2;
			display: flex;
			align-items: center;
			justify-content: center;
			min-height: 100vh;
			padding: 20px;
		}
		.error-container {
			background: white;
			border: 2px solid #fecaca;
			border-radius: 12px;
			padding: 24px;
			max-width: 500px;
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
		}
		h3 {
			color: #dc2626;
			margin-bottom: 12px;
			font-size: 16px;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.icon {
			width: 20px;
			height: 20px;
		}
		pre {
			background: #f5f5f5;
			padding: 12px;
			border-radius: 8px;
			overflow-x: auto;
			font-size: 12px;
			color: #374151;
			white-space: pre-wrap;
			word-break: break-word;
		}
	</style>
</head>
<body>
	<div class="error-container">
		<h3>
			<svg class="icon" viewBox="0 0 20 20" fill="#dc2626">
				<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
			</svg>
			Build Failed
		</h3>
		<pre>${escapeHtml(error)}</pre>
	</div>
</body>
</html>`;
}

/**
 * Pending state HTML shown before build starts
 */
const PENDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Pending</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: #f9fafb;
			display: flex;
			align-items: center;
			justify-content: center;
			min-height: 100vh;
		}
		.pending {
			text-align: center;
			color: #9ca3af;
		}
		.icon {
			width: 48px;
			height: 48px;
			margin-bottom: 12px;
			opacity: 0.5;
		}
		.pending-text {
			font-size: 14px;
		}
	</style>
</head>
<body>
	<div class="pending">
		<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="12" cy="12" r="10"/>
			<path d="M12 6v6l4 2"/>
		</svg>
		<div class="pending-text">Waiting to build...</div>
	</div>
</body>
</html>`;

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export function SandboxCard({
	sandbox,
	isSelected,
	isFocused,
	isDragging = false,
	dragOffset,
	isOverlapping = false,
	isExiting = false,
	onMouseDown,
	onClick,
	onDoubleClick,
	onDelete
}: SandboxCardProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [isHovered, setIsHovered] = useState(false);

	// Generate srcDoc based on build status
	const srcDoc = useMemo(() => {
		console.log('[SandboxCard] 🔄 Generating srcDoc for:', {
			sandboxId: sandbox.id,
			buildStatus: sandbox.buildStatus,
			hasBundledCode: !!sandbox.bundledCode,
			bundledCodeLength: sandbox.bundledCode?.length || 0
		});

		switch (sandbox.buildStatus) {
			case 'pending':
				console.log('[SandboxCard] ⏳ Status: pending');
				return PENDING_HTML;
			case 'building':
				console.log('[SandboxCard] 🔨 Status: building');
				return LOADING_HTML;
			case 'error':
				console.error('[SandboxCard] ❌ Status: error -', sandbox.buildError);
				return generateErrorHTML(sandbox.buildError || 'Unknown error');
			case 'ready':
				if (sandbox.bundledCode) {
					console.log('[SandboxCard] ✅ Status: ready - Injecting bundledCode');
					console.log('[SandboxCard] 📦 BundledCode preview (first 500 chars):', sandbox.bundledCode.substring(0, 500));
					const html = generateSandboxHTML(sandbox.bundledCode);
					console.log('[SandboxCard] 📄 Generated HTML length:', html.length);
					return html;
				}
				console.error('[SandboxCard] ❌ Status: ready but no bundledCode!');
				return generateErrorHTML('No bundled code available');
			default:
				console.warn('[SandboxCard] ⚠️ Unknown status:', sandbox.buildStatus);
				return PENDING_HTML;
		}
	}, [sandbox.buildStatus, sandbox.buildError, sandbox.bundledCode, sandbox.id]);

	// Get display name from componentInput
	const displayName = useMemo(() => {
		const input = sandbox.componentInput;
		if (!input) return sandbox.id;

		// Use the first filename without extension
		const filename = Object.keys(input.files)[0];
		if (filename) {
			return filename.replace(/\.(jsx|tsx|js|ts|vue|svelte)$/, '');
		}
		return input.id;
	}, [sandbox.id, sandbox.componentInput]);

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
	if (isExiting) classNames.push('exiting');

	// Add build status class for visual feedback
	if (sandbox.buildStatus === 'building') classNames.push('building');
	if (sandbox.buildStatus === 'error') classNames.push('build-error');

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
					<span className="title">{displayName}</span>

					{/* Build status indicator */}
					{sandbox.buildStatus === 'building' && (
						<span className="status-badge building">Building...</span>
					)}
					{sandbox.buildStatus === 'error' && (
						<span className="status-badge error">Error</span>
					)}
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
					srcDoc={srcDoc}
					sandbox="allow-scripts allow-same-origin"
					title={displayName}
					style={{
						pointerEvents: isDragging ? 'none' : 'auto',
					}}
				/>
			</div>
		</div>
	);
}
