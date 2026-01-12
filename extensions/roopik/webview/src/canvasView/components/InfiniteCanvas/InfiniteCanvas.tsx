/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useRef } from 'react';
import type { Sandbox, Transform, BackgroundPattern, DevicePreset, SnapMode } from '../../types';
import { SandboxCard } from '../SandboxCard';
import { useCanvasZoom } from './useCanvasZoom';
import { useCanvasDrag } from './useCanvasDrag';
import { getBackgroundStyle } from './backgroundPatterns';
import '../../styles/infiniteCanvas.css';

// ============================================================
// Types
// ============================================================

export interface InfiniteCanvasProps {
	sandboxes: Sandbox[];
	selectedSandboxId: string | null;
	focusedSandboxId: string | null;
	transform: Transform;
	pattern: BackgroundPattern;
	backgroundColor: string;
	globalDeviceMode: DevicePreset;
	/** Grid positioning mode: 'free' allows overlap, 'grid' snaps to nearest available slot */
	snapMode?: SnapMode;
	/** Viewport dimensions for dynamic focused sandbox sizing */
	viewport?: { width: number; height: number };
	/** Whether inspect mode is enabled globally */
	isInspectMode?: boolean;
	/** Whether inspect mode should auto-capture screenshots */
	captureOnInspectSelect?: boolean;
	onTransformChange: (transform: Transform) => void;
	onSandboxClick: (id: string) => void;
	onSandboxDoubleClick: (id: string) => void;
	onSandboxUpdate: (id: string, updates: Partial<Sandbox>) => void;
	onSandboxDelete: (id: string, deleteSourceCode?: boolean) => void;
	/** Called when user clicks code icon to view sandbox code */
	onSandboxShowCode: (id: string) => void;
	/** Called when user clicks reload icon to force rebuild */
	onSandboxRebuild: (id: string) => void;
	/** Called when clicking on canvas background (not on a sandbox) */
	onCanvasBackgroundClick?: () => void;
	/** Delete source code preference from parent */
	deleteSourceCodePref?: boolean;
	/** Callback when delete source code preference changes */
	onDeleteSourceCodePrefChange?: (value: boolean) => void;
}

// ============================================================
// Sub-components
// ============================================================

interface SandboxLayerProps {
	sandboxes: Sandbox[];
	selectedSandboxId: string | null;
	focusedSandboxId: string | null;
	draggingSandboxId: string | null;
	dragOffset: { x: number; y: number };
	globalDeviceMode: DevicePreset;
	/** Viewport dimensions for dynamic focused sandbox sizing */
	viewport?: { width: number; height: number };
	/** Whether inspect mode is enabled globally */
	isInspectMode?: boolean;
	/** Whether inspect mode should auto-capture screenshots */
	captureOnInspectSelect?: boolean;
	onSandboxDragStart: (e: React.MouseEvent, sandboxId: string) => void;
	onSandboxClick: (id: string) => void;
	onSandboxDoubleClick: (id: string) => void;
	onSandboxDelete: (id: string, deleteSourceCode?: boolean) => void;
	onSandboxShowCode: (id: string) => void;
	onSandboxRebuild: (id: string) => void;
	onSandboxUpdate: (id: string, updates: Partial<Sandbox>) => void;
	deleteSourceCodePref?: boolean;
	onDeleteSourceCodePrefChange?: (value: boolean) => void;
}

/**
 * Renders all sandbox cards within the canvas content layer.
 */
function SandboxLayer({
	sandboxes,
	selectedSandboxId,
	focusedSandboxId,
	draggingSandboxId,
	dragOffset,
	globalDeviceMode,
	viewport,
	isInspectMode,
	captureOnInspectSelect,
	onSandboxDragStart,
	onSandboxClick,
	onSandboxDoubleClick,
	onSandboxDelete,
	onSandboxShowCode,
	onSandboxRebuild,
	onSandboxUpdate,
	deleteSourceCodePref,
	onDeleteSourceCodePrefChange
}: SandboxLayerProps) {
	// Debug log for inspect mode


	// Find the focused sandbox position for push-away effect
	const focusedSandbox = focusedSandboxId
		? sandboxes.find(s => s.id === focusedSandboxId)
		: null;
	const focusedSandboxPosition = focusedSandbox
		? { x: focusedSandbox.x, y: focusedSandbox.y }
		: null;

	return (
		<>
			{sandboxes.map((sandbox) => {
				const isDragging = draggingSandboxId === sandbox.id;
				return (
					<SandboxCard
						key={sandbox.id}
						sandbox={sandbox}
						isSelected={sandbox.id === selectedSandboxId}
						isFocused={sandbox.id === focusedSandboxId}
						isDragging={isDragging}
						dragOffset={isDragging ? dragOffset : undefined}
						globalDeviceMode={globalDeviceMode}
						viewport={viewport}
						focusedSandboxPosition={focusedSandboxPosition}
						isInspectMode={isInspectMode}
						captureOnInspectSelect={captureOnInspectSelect}
						onMouseDown={(e) => onSandboxDragStart(e, sandbox.id)}
						onClick={() => onSandboxClick(sandbox.id)}
						onDoubleClick={() => onSandboxDoubleClick(sandbox.id)}
						onDelete={(deleteSourceCode) => onSandboxDelete(sandbox.id, deleteSourceCode)}
						onShowCode={() => onSandboxShowCode(sandbox.id)}
						onRebuild={() => onSandboxRebuild(sandbox.id)}
						onDeviceModeChange={(mode) => onSandboxUpdate(sandbox.id, { deviceMode: mode })}
						deleteSourceCodePref={deleteSourceCodePref}
						onDeleteSourceCodePrefChange={onDeleteSourceCodePrefChange}
					/>
				);
			})}
		</>
	);
}

// ============================================================
// Main Component
// ============================================================

/**
 * Infinite canvas with zoom, pan, and sandbox card management.
 *
 * Features:
 * - Mouse wheel / touchpad zoom (centered on cursor)
 * - Two-finger scroll pan on touchpad
 * - Click and drag to pan
 * - Drag sandbox cards to reposition
 * - Configurable background patterns (grid, dots, plain)
 */
export function InfiniteCanvas({
	sandboxes,
	selectedSandboxId,
	focusedSandboxId,
	transform,
	pattern,
	backgroundColor,
	globalDeviceMode,
	snapMode = 'free',
	viewport,
	isInspectMode,
	captureOnInspectSelect,
	onTransformChange,
	onSandboxClick,
	onSandboxDoubleClick,
	onSandboxUpdate,
	onSandboxDelete,
	onSandboxShowCode,
	onSandboxRebuild,
	onCanvasBackgroundClick,
	deleteSourceCodePref,
	onDeleteSourceCodePrefChange,
}: InfiniteCanvasProps) {
	const canvasRef = useRef<HTMLDivElement>(null);

	// Zoom and pan via mouse wheel / touchpad
	useCanvasZoom({
		canvasRef,
		transform,
		onTransformChange,
	});

	// Drag handling for canvas pan and sandbox repositioning
	const {
		isPanning,
		draggingSandboxId,
		dragOffset,
		handleCanvasMouseDown,
		handleCanvasMouseMove,
		handleCanvasMouseUp,
		handleSandboxDragStart,
	} = useCanvasDrag({
		transform,
		sandboxes,
		snapMode,
		onTransformChange,
		onSandboxUpdate,
		onSandboxClick,
		onCanvasBackgroundClick,
	});

	// Generate background pattern style
	const backgroundStyle = getBackgroundStyle(pattern, transform, backgroundColor);

	return (
		<div
			ref={canvasRef}
			className={`canvas ${isPanning ? 'panning' : ''}`}
			onMouseDown={handleCanvasMouseDown}
			onMouseMove={handleCanvasMouseMove}
			onMouseUp={handleCanvasMouseUp}
			onMouseLeave={handleCanvasMouseUp}
			style={{
				...backgroundStyle,
				backgroundColor,
			}}
		>
			{/* Transformed content layer */}
			<div
				className="canvas-content"
				style={{
					transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
					transformOrigin: '0 0',
				}}
			>
				<SandboxLayer
					sandboxes={sandboxes}
					selectedSandboxId={selectedSandboxId}
					focusedSandboxId={focusedSandboxId}
					draggingSandboxId={draggingSandboxId}
					dragOffset={dragOffset}
					globalDeviceMode={globalDeviceMode}
					viewport={viewport}
					isInspectMode={isInspectMode}
					captureOnInspectSelect={captureOnInspectSelect}
					onSandboxDragStart={handleSandboxDragStart}
					onSandboxClick={onSandboxClick}
					onSandboxDoubleClick={onSandboxDoubleClick}
					onSandboxDelete={onSandboxDelete}
					onSandboxShowCode={onSandboxShowCode}
					onSandboxRebuild={onSandboxRebuild}
					onSandboxUpdate={onSandboxUpdate}
					deleteSourceCodePref={deleteSourceCodePref}
					onDeleteSourceCodePrefChange={onDeleteSourceCodePrefChange}
				/>
			</div>
		</div>
	);
}
