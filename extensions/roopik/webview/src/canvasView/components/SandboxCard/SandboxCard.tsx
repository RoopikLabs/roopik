/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import type { Sandbox, Point, DevicePreset, BuildErrorInfo } from '../../types';
import { DEVICE_PRESETS, getNextDevicePreset } from '../../types';
import { DeviceIcon } from '../DeviceToggle';
import { DeleteConfirmModal } from '../Toolbar/DeleteConfirmModal';
import { DEFAULT_CONFIG, getFocusedSandboxDimensions } from '../../services/gridManager';
import '../../styles/sandboxCard.css';

interface SandboxCardProps {
	sandbox: Sandbox;
	isSelected: boolean;
	isFocused: boolean;
	isDragging?: boolean;
	dragOffset?: Point;
	isOverlapping?: boolean;
	isExiting?: boolean;
	/** Global device mode from canvas */
	globalDeviceMode: DevicePreset;
	/** Viewport dimensions for dynamic focused sandbox sizing */
	viewport?: { width: number; height: number };
	/** Position of the focused sandbox (for calculating push-away offset) */
	focusedSandboxPosition?: { x: number; y: number } | null;
	/** Whether select mode is enabled globally */
	isSelectMode?: boolean;
	/** Whether inspect mode is enabled globally */
	isInspectMode?: boolean;
	/** Whether inspect mode should auto-capture screenshots */
	captureOnInspectSelect?: boolean;
	onMouseDown: (e: React.MouseEvent) => void;
	onClick: () => void;
	onDoubleClick: () => void;
	onDelete: (deleteSourceCode?: boolean) => void;
	/** Callback to show code view for this sandbox */
	onShowCode: () => void;
	/** Callback to force rebuild this sandbox */
	onRebuild: () => void;
	/** Callback to update sandbox device mode */
	onDeviceModeChange: (mode: DevicePreset | undefined) => void;
	/** Delete source code preference from parent */
	deleteSourceCodePref?: boolean;
	/** Callback when delete source code preference changes */
	onDeleteSourceCodePrefChange?: (value: boolean) => void;
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
function generateSandboxHTML(bundledCode: string, componentId: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Roopik Component Sandbox</title>
	<!-- Tailwind CSS v4 Play CDN - enables Tailwind utility classes in all components -->
	<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: #ffffff;
			overflow: auto;
			overflow-x: hidden; /* Prevent horizontal scrollbar in device emulation */
		}
		#root {
			min-height: 100vh;
		}

		/* VS Code-style thin dark scrollbar */
		::-webkit-scrollbar {
			width: 10px;
			height: 10px;
		}
		::-webkit-scrollbar-track {
			background: rgba(0, 0, 0, 0.1);
		}
		::-webkit-scrollbar-thumb {
			background: rgba(60, 60, 60, 0.8);
			border-radius: 5px;
			border: 2px solid transparent;
			background-clip: padding-box;
		}
		::-webkit-scrollbar-thumb:hover {
			background: rgba(80, 80, 80, 0.9);
			border: 2px solid transparent;
			background-clip: padding-box;
		}
		::-webkit-scrollbar-corner {
			background: transparent;
		}
		/* Firefox scrollbar */
		* {
			scrollbar-width: thin;
			scrollbar-color: rgba(60, 60, 60, 0.8) rgba(0, 0, 0, 0.1);
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

	<!-- Screenshot capture helper (delegates to parent) -->
	<script>
		(function() {
			const componentId = ${JSON.stringify(componentId)};
			window.__roopikCaptureElement = (element, options) => {
				if (window.parent && window.parent.__roopikRequestScreenshot) {
					window.parent.__roopikRequestScreenshot({
						componentId,
						element,
						target: options?.target || "component",
						requestId: options?.requestId,
						intent: options?.intent
					});
					return;
				}

				window.parent.postMessage({
					type: "roopik-screenshot-error",
					componentId,
					requestId: options?.requestId,
					message: "Screenshot capture is unavailable in parent window"
				}, "*");
			};

			window.addEventListener("message", (event) => {
				if (event.data?.type === "roopik-capture-screenshot") {
					const requestId = event.data.requestId;
					const intent = event.data.intent;
					window.__roopikCaptureElement(document.body, {
						target: "component",
						requestId,
						intent
					});
				}
			});
		})();
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
 * Now accepts optional structured errorInfo for detailed display
 * Supports both esbuild format (errors array) and simple format
 */
function generateErrorHTML(error: string, errorInfo?: BuildErrorInfo): string {
	// Extract location from errorInfo - check both esbuild format and simple format
	let file: string | undefined;
	let line: number | undefined;
	let column: number | undefined;
	let lineText: string | undefined;

	if (errorInfo) {
		// Check esbuild format first (errors array with location)
		if (errorInfo.errors && errorInfo.errors.length > 0) {
			const firstError = errorInfo.errors[0];
			if (firstError.location) {
				file = firstError.location.file;
				line = firstError.location.line;
				column = firstError.location.column;
				lineText = firstError.location.lineText;
			}
		}
		// Fallback to simple format
		if (!file && !line) {
			file = errorInfo.file;
			line = errorInfo.line;
			column = errorInfo.column;
		}
	}

	// Clean up file path (remove vfs:./ prefix if present)
	if (file) {
		file = file.replace(/^vfs:\.\//, '');
	}

	// Build location HTML
	let locationHtml = '';
	if (file || line) {
		const parts: string[] = [];
		if (file) {
			parts.push(escapeHtml(file));
		}
		if (line) {
			parts.push(`line ${line}`);
			if (column) {
				parts.push(`col ${column}`);
			}
		}
		if (parts.length > 0) {
			locationHtml = `<div class="error-location">${parts.join(' : ')}</div>`;
		}
	}

	// Build line preview HTML if we have lineText
	let linePreviewHtml = '';
	if (lineText && column) {
		// Show the problematic line with a caret pointing to the error column
		const escapedLine = escapeHtml(lineText);
		const caretPadding = ' '.repeat(Math.max(0, column - 1));
		linePreviewHtml = `
		<div class="error-line-preview">
			<code>${escapedLine}</code>
			<code class="error-caret">${caretPadding}^</code>
		</div>`;
	}

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
			margin-bottom: 8px;
			font-size: 16px;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.icon {
			width: 20px;
			height: 20px;
		}
		.error-location {
			background: #fef3c7;
			color: #92400e;
			padding: 6px 10px;
			border-radius: 6px;
			font-size: 12px;
			font-family: 'SF Mono', Monaco, 'Courier New', monospace;
			margin-bottom: 12px;
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.error-line-preview {
			background: #1e1e1e;
			padding: 8px 12px;
			border-radius: 6px;
			margin-bottom: 12px;
			overflow-x: auto;
		}
		.error-line-preview code {
			display: block;
			font-family: 'SF Mono', Monaco, 'Courier New', monospace;
			font-size: 11px;
			color: #d4d4d4;
			white-space: pre;
		}
		.error-caret {
			color: #f87171;
			font-weight: bold;
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
		${locationHtml}
		${linePreviewHtml}
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
	globalDeviceMode,
	viewport,
	focusedSandboxPosition,
	isSelectMode = false,
	isInspectMode = false,
	captureOnInspectSelect = false,
	onMouseDown,
	onClick,
	onDoubleClick,
	onDelete,
	onShowCode,
	onRebuild,
	onDeviceModeChange,
	deleteSourceCodePref = false,
	onDeleteSourceCodePrefChange
}: SandboxCardProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [isHovered, setIsHovered] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	// Track if component is "activated" for interaction (click-to-activate for better zoom UX)
	const [isActivated, setIsActivated] = useState(false);

	// Send select mode toggle to iframe when isSelectMode changes
	useEffect(() => {
		if (iframeRef.current?.contentWindow) {
			iframeRef.current.contentWindow.postMessage({
				type: 'roopik-toggle-select',
				enabled: isSelectMode
			}, '*');
		}
	}, [isSelectMode, sandbox.id]);

	// Send inspect mode toggle to iframe when isInspectMode changes
	useEffect(() => {
		if (iframeRef.current?.contentWindow) {
			iframeRef.current.contentWindow.postMessage({
				type: 'roopik-toggle-inspect',
				enabled: isInspectMode,
				captureOnSelect: captureOnInspectSelect
			}, '*');
		} else {
			console.log('[SandboxCard] Cannot send - iframe not ready');
		}
	}, [isInspectMode, captureOnInspectSelect, sandbox.id]);

	// Reset activation when not focused or not selected
	useEffect(() => {
		if (!isFocused && !isSelected) {
			setIsActivated(false);
		}
	}, [isFocused, isSelected]);

	// Effective device mode: sandbox override or global
	const effectiveDeviceMode = sandbox.deviceMode ?? globalDeviceMode;
	const hasOverride = sandbox.deviceMode !== undefined;
	const preset = DEVICE_PRESETS[effectiveDeviceMode];
	const isDeviceMode = preset.width !== 'auto';

	// FIX: Use blob URL instead of srcDoc to work around VS Code webview rendering issues.
	const [blobUrl, setBlobUrl] = useState<string | null>(null);
	const prevBlobUrlRef = useRef<string | null>(null);

	useEffect(() => {
		let html: string;

		switch (sandbox.buildStatus) {
			case 'pending':
				html = PENDING_HTML;
				break;
			case 'building':
				html = LOADING_HTML;
				break;
			case 'error':
				html = generateErrorHTML(sandbox.buildError || 'Unknown error', sandbox.buildErrorInfo);
				break;
			case 'ready':
				if (sandbox.bundledCode) {
					html = generateSandboxHTML(sandbox.bundledCode, sandbox.id);
				} else {
					html = generateErrorHTML('No bundled code available');
				}
				break;
			default:
				html = PENDING_HTML;
		}

		// Revoke previous blob URL to prevent memory leaks
		if (prevBlobUrlRef.current) {
			URL.revokeObjectURL(prevBlobUrlRef.current);
		}

		// Create new blob URL
		const blob = new Blob([html], { type: 'text/html' });
		const url = URL.createObjectURL(blob);

		prevBlobUrlRef.current = url;
		setBlobUrl(url);

		// Cleanup on unmount
		return () => {
			if (prevBlobUrlRef.current) {
				URL.revokeObjectURL(prevBlobUrlRef.current);
				prevBlobUrlRef.current = null;
			}
		};
	}, [sandbox.buildStatus, sandbox.bundledCode, sandbox.bundleNonce, sandbox.id, sandbox.buildError, sandbox.buildErrorInfo]);

	// Get display name from componentInput (prefer name, fallback to filename)
	const displayName = useMemo(() => {
		const input = sandbox.componentInput;
		if (!input) return sandbox.id;

		// Prefer the name field if available
		if (input.name) {
			return input.name;
		}

		// Fallback: use the first filename without extension
		const filename = Object.keys(input.files)[0];
		if (filename) {
			return filename.replace(/\.(jsx|tsx|js|ts|vue|svelte)$/, '');
		}
		return input.id;
	}, [sandbox.id, sandbox.componentInput]);

	const handleShowCodeClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onShowCode();
	};

	const handleRebuildClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onRebuild();
	};

	const handleCaptureClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!iframeRef.current?.contentWindow) {
			console.warn('[SandboxCard] Cannot capture - iframe not ready');
			return;
		}
		const requestId = `manual-${sandbox.id}-${Date.now()}`;
		iframeRef.current.contentWindow.postMessage({
			type: 'roopik-capture-screenshot',
			requestId,
			intent: 'attach'
		}, '*');
	};

	const handleDeleteClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		setShowDeleteConfirm(true);
	};

	const handleConfirmDelete = (deleteSourceCode: boolean) => {
		setShowDeleteConfirm(false);
		onDelete(deleteSourceCode);
	};

	const handleCancelDelete = () => {
		setShowDeleteConfirm(false);
	};

	// Toggle device mode for this sandbox
	const handleDeviceToggle = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (hasOverride) {
			// Cycle through modes, or reset to global if back to global mode
			const nextMode = getNextDevicePreset(effectiveDeviceMode);
			if (nextMode === globalDeviceMode) {
				// Reset to follow global
				onDeviceModeChange(undefined);
			} else {
				onDeviceModeChange(nextMode);
			}
		} else {
			// Start override with next mode from current
			const nextMode = getNextDevicePreset(effectiveDeviceMode);
			onDeviceModeChange(nextMode);
		}
	};

	// Get sandbox dimensions based on focus state
	// When focused, sandbox expands dynamically to fill most of the viewport
	const focusedDimensions = useMemo(() => {
		if (!isFocused || !viewport) return null;
		return getFocusedSandboxDimensions(viewport.width, viewport.height, DEFAULT_CONFIG);
	}, [isFocused, viewport]);

	const sandboxWidth = focusedDimensions?.width ?? DEFAULT_CONFIG.sandboxWidth;
	const sandboxHeight = focusedDimensions?.height ?? DEFAULT_CONFIG.sandboxHeight;

	// Calculate push-away offset for non-focused sandboxes when another is focused
	// This creates a smooth "making room" effect without changing actual positions
	const pushAwayOffset = useMemo(() => {
		// Only apply to non-focused sandboxes when there's a focused one
		if (isFocused || !focusedSandboxPosition) {
			return { x: 0, y: 0 };
		}

		// Calculate direction from focused sandbox to this sandbox
		const dx = sandbox.x - focusedSandboxPosition.x;
		const dy = sandbox.y - focusedSandboxPosition.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		// If sandboxes are at the same position, push in a default direction
		if (distance < 10) {
			return { x: 800, y: 0 };
		}

		// Push all sandboxes far away - the focused sandbox expands to fill most of viewport
		// Use a large fixed distance so all sandboxes are pushed well out of view
		const pushDistance = 1200;
		const normalizedX = dx / distance;
		const normalizedY = dy / distance;

		return {
			x: normalizedX * pushDistance,
			y: normalizedY * pushDistance,
		};
	}, [isFocused, focusedSandboxPosition, sandbox.x, sandbox.y]);

	// Calculate iframe container style for device mode
	// Device mode: set container to device dimensions, scale to fit available space
	const iframeContainerStyle = useMemo((): React.CSSProperties => {
		if (!isDeviceMode) {
			// Auto mode: fill available space (100% of parent)
			return {
				width: '100%',
				height: '100%',
			};
		}

		// Device mode: fixed device size, scaled to fit
		const deviceWidth = preset.width as number;
		const deviceHeight = preset.height as number;

		// Available space is the CONTENT area of sandbox card
		// Use focus-aware dimensions
		const availableWidth = sandboxWidth;
		const availableHeight = sandboxHeight;

		// Scale to fill available space while maintaining aspect ratio
		const scaleX = availableWidth / deviceWidth;
		const scaleY = availableHeight / deviceHeight;
		const scale = Math.min(scaleX, scaleY);

		// Visual size after scaling
		const scaledWidth = deviceWidth * scale;
		const scaledHeight = deviceHeight * scale;

		// Negative margins collapse the layout box from deviceSize to scaledSize
		// This allows flexbox centering to work correctly
		const marginX = (deviceWidth - scaledWidth) / 2;
		const marginY = (deviceHeight - scaledHeight) / 2;

		return {
			width: deviceWidth,
			height: deviceHeight,
			transform: `scale(${scale})`,
			transformOrigin: 'center center',
			margin: `-${marginY}px -${marginX}px`,
		};
	}, [isDeviceMode, preset, sandboxWidth, sandboxHeight]);

	// Check if this sandbox is being pushed away (another sandbox is focused)
	const isPushedAway = !isFocused && focusedSandboxPosition !== null;

	// Handle overlay click - activate component for interaction
	const handleOverlayClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		setIsActivated(true);
		// Also select the component
		onClick();
	}, [onClick]);

	// Build className
	const classNames = ['sandbox-card'];
	if (isSelected) classNames.push('selected');
	if (isFocused) classNames.push('focused');
	if (isPushedAway) classNames.push('pushed-away');
	if (isDragging) classNames.push('dragging');
	if (isOverlapping) classNames.push('overlapping');
	if (isExiting) classNames.push('exiting');
	if (isDeviceMode) classNames.push('device-mode');
	if (hasOverride) classNames.push('device-override');
	if (isActivated) classNames.push('activated');

	// Add build status class for visual feedback
	if (sandbox.buildStatus === 'building') classNames.push('building');
	if (sandbox.buildStatus === 'error') classNames.push('build-error');

	return (
		<div
			className={classNames.join(' ')}
			style={{
				left: sandbox.x,
				top: sandbox.y,
				width: sandboxWidth,
				height: sandboxHeight,
				zIndex: sandbox.zIndex,
				// Combine drag offset with push-away offset for smooth transitions
				transform: dragOffset
					? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`
					: pushAwayOffset.x !== 0 || pushAwayOffset.y !== 0
						? `translate3d(${pushAwayOffset.x}px, ${pushAwayOffset.y}px, 0)`
						: 'none',
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
						{/* Device mode toggle */}
						<button
							className={`device-toggle-btn ${hasOverride ? 'has-override' : ''}`}
							onClick={handleDeviceToggle}
							title={`Device: ${preset.label}${hasOverride ? ' (custom)' : ' (global)'} - click to change`}
						>
							<DeviceIcon preset={effectiveDeviceMode} size={16} />
						</button>
						{/* Code view button */}
						<button onClick={handleShowCodeClick} title="View component source code">
							<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M5 4 L1 8 L5 12" />
								<path d="M11 4 L15 8 L11 12" />
								<path d="M10 2 L6 14" />
							</svg>
						</button>
						{/* Rebuild button */}
						<button onClick={handleRebuildClick} title="Force rebuild component">
							<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M2 8 A6 6 0 1 1 8 14" />
								<path d="M2 4 L2 8 L6 8" />
							</svg>
						</button>
						{/* Screenshot button */}
						<button onClick={handleCaptureClick} title="Capture screenshot to chat">
							<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<rect x="2.5" y="4" width="11" height="8" rx="1.5" />
								<path d="M6 4 L7 2.5 H9 L10 4" />
								<circle cx="8" cy="8" r="2.2" />
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

			{/* Iframe content with device emulation */}
			<div className="card-body">
				{/* Wrapper for flexbox centering */}
				<div className="webview-wrapper">
					{/* Container with device dimensions + scale transform */}
					<div
						className="webview-container"
						style={iframeContainerStyle}
					>
						{/* Interaction overlay - click to activate component, allows canvas zoom to work */}
						{!isActivated && !isFocused && (
							<div
								className="interaction-overlay"
								onClick={handleOverlayClick}
								title="Click to interact with component"
							/>
						)}
						<iframe
							ref={iframeRef}
							// FIX: Use blob URL instead of srcDoc
							// VS Code webviews defer srcDoc updates, blob URLs force navigation
							key={`${sandbox.id}-${sandbox.bundleNonce ?? 0}`}
							data-sandbox-id={sandbox.id}
							src={blobUrl || 'about:blank'}
							sandbox="allow-scripts allow-same-origin"
							title={displayName}
							style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
						/>
					</div>
			</div>
		</div>

		{/* Focus button - only show when NOT focused and on hover */}
		{!isFocused && isHovered && (
			<button
				className="focus-button"
				onClick={(e) => {
					e.stopPropagation();
					onDoubleClick();
				}}
				title="Enter focus mode"
			>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<path d="M8 3h8M3 8v8M21 8v8M8 21h8M3 8l3 3M21 8l-3 3M3 16l3-3M21 16l-3-3" />
				</svg>
			</button>
		)}

		{/* Unfocus button - only show when focused */}
		{isFocused && (
			<button
				className="unfocus-button"
				onClick={(e) => {
					e.stopPropagation();
					onDoubleClick(); // Reuse double-click handler to unfocus
				}}
				title="Exit focus mode (ESC, double-click, or click outside)"
			>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<path d="M4 14h6m0 0v6m0-6l-7 7M20 10h-6m0 0V4m0 6l7-7" />
				</svg>
			</button>
		)}

		{/* Delete confirmation modal */}
			{showDeleteConfirm && (
				<DeleteConfirmModal
					sandboxId={displayName}
					initialDeleteSourceCode={deleteSourceCodePref}
					onDeleteSourceCodeChange={onDeleteSourceCodePrefChange}
					onConfirm={handleConfirmDelete}
					onCancel={handleCancelDelete}
				/>
			)}
		</div>
	);
}
