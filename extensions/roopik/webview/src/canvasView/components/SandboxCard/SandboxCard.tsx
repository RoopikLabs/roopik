/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useEffect } from 'react';
import type { Sandbox } from '../../types';
import { SANDBOX_TEMPLATE } from './sandboxTemplate';
import { DragIcon, ExpandIcon, CloseIcon } from './icons';
import '../../styles/sandboxPreview.css';

// ============================================================
// Types
// ============================================================

export interface SandboxCardProps {
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

// ============================================================
// Hooks
// ============================================================

/**
 * Hook to handle iframe message communication
 */
function useIframeMessaging(
	iframeRef: React.RefObject<HTMLIFrameElement | null>,
	sandboxId: string,
	sandboxMessage: Sandbox['sandboxMessage']
) {
	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) return;

		const handleLoad = () => {
			// Wait for sandbox template to initialize before sending message
			setTimeout(() => {
				iframe.contentWindow?.postMessage(sandboxMessage, '*');
			}, 100);
		};

		iframe.addEventListener('load', handleLoad);
		return () => iframe.removeEventListener('load', handleLoad);
	}, [sandboxId, sandboxMessage]);
}

// ============================================================
// Sub-components
// ============================================================

interface HeaderProps {
	title: string;
	onDragStart: (e: React.MouseEvent) => void;
	onExpand: () => void;
	onDelete: () => void;
}

function Header({ title, onDragStart, onExpand, onDelete }: HeaderProps) {
	return (
		<div className="sandbox-header">
			<div className="sandbox-label" onMouseDown={onDragStart}>
				<DragIcon className="drag-icon" />
				<span className="title">{title}</span>
			</div>

			<div className="sandbox-actions">
				<button
					onClick={(e) => { e.stopPropagation(); onExpand(); }}
					title="Expand to fullscreen (Coming soon)"
				>
					<ExpandIcon />
				</button>

				<button
					className="delete"
					onClick={(e) => { e.stopPropagation(); onDelete(); }}
					title="Delete sandbox"
				>
					<CloseIcon />
				</button>
			</div>
		</div>
	);
}

// ============================================================
// Main Component
// ============================================================

export function SandboxCard({
	sandbox,
	isSelected,
	isFocused,
	isDragging = false,
	dragOffset,
	onMouseDown,
	onClick,
	onDoubleClick,
	onDelete,
}: SandboxCardProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);

	// Handle iframe communication
	useIframeMessaging(iframeRef, sandbox.id, sandbox.sandboxMessage);

	// Build dynamic class names
	const className = [
		'sandbox-preview',
		isSelected && 'selected',
		isFocused && 'focused',
		isDragging && 'dragging',
	].filter(Boolean).join(' ');

	// Build dynamic styles (position only - visual styles in CSS)
	const style: React.CSSProperties = {
		left: sandbox.x,
		top: sandbox.y,
		width: sandbox.width,
		height: sandbox.height,
		zIndex: sandbox.zIndex,
		transform: dragOffset ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` : undefined,
	};

	// Event handlers
	const handleClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget) onClick();
	};

	const handleDoubleClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget) onDoubleClick();
	};

	const handleDragStart = (e: React.MouseEvent) => {
		e.stopPropagation();
		onMouseDown(e);
	};

	const handleExpand = () => {
		// TODO: Implement fullscreen mode
		console.log('[SandboxCard] Expand clicked:', sandbox.id);
	};

	return (
		<div
			className={className}
			style={style}
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
		>
			<Header
				title={sandbox.id}
				onDragStart={handleDragStart}
				onExpand={handleExpand}
				onDelete={onDelete}
			/>

			<div className="sandbox-content">
				<iframe
					ref={iframeRef}
					srcDoc={SANDBOX_TEMPLATE}
					sandbox="allow-scripts allow-same-origin"
					title={sandbox.id}
				/>
			</div>
		</div>
	);
}
