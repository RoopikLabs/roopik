/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useRef } from 'react';
import type { Sandbox, Transform, BackgroundPattern, DevicePreset } from '../../types';
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
	onTransformChange: (transform: Transform) => void;
	onSandboxClick: (id: string) => void;
	onSandboxDoubleClick: (id: string) => void;
	onSandboxUpdate: (id: string, updates: Partial<Sandbox>) => void;
	onSandboxDelete: (id: string) => void;
	onSandboxExpand: (id: string) => void;
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
	onSandboxDragStart: (e: React.MouseEvent, sandboxId: string) => void;
	onSandboxClick: (id: string) => void;
	onSandboxDoubleClick: (id: string) => void;
	onSandboxDelete: (id: string) => void;
	onSandboxExpand: (id: string) => void;
	onSandboxUpdate: (id: string, updates: Partial<Sandbox>) => void;
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
	onSandboxDragStart,
	onSandboxClick,
	onSandboxDoubleClick,
	onSandboxDelete,
	onSandboxExpand,
	onSandboxUpdate,
}: SandboxLayerProps) {
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
						onMouseDown={(e) => onSandboxDragStart(e, sandbox.id)}
						onClick={() => onSandboxClick(sandbox.id)}
						onDoubleClick={() => onSandboxDoubleClick(sandbox.id)}
						onDelete={() => onSandboxDelete(sandbox.id)}
						onExpand={() => onSandboxExpand(sandbox.id)}
						onDeviceModeChange={(mode) => onSandboxUpdate(sandbox.id, { deviceMode: mode })}
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
	onTransformChange,
	onSandboxClick,
	onSandboxDoubleClick,
	onSandboxUpdate,
	onSandboxDelete,
	onSandboxExpand,
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
		onTransformChange,
		onSandboxUpdate,
		onSandboxClick,
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
					onSandboxDragStart={handleSandboxDragStart}
					onSandboxClick={onSandboxClick}
					onSandboxDoubleClick={onSandboxDoubleClick}
					onSandboxDelete={onSandboxDelete}
					onSandboxExpand={onSandboxExpand}
					onSandboxUpdate={onSandboxUpdate}
				/>
			</div>
		</div>
	);
}
