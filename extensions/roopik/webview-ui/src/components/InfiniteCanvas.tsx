/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useState } from 'react';
import type { Sandbox } from '../types';
import { SandboxPreview } from './SandboxPreview';

type BackgroundPattern = 'grid' | 'dots' | 'plain';

interface Transform {
	x: number;
	y: number;
	scale: number;
}

interface InfiniteCanvasProps {
	sandboxes: Sandbox[];
	selectedSandboxId: string | null;
	focusedSandboxId: string | null;
	transform: Transform;
	pattern: BackgroundPattern;
	onTransformChange: (transform: Transform) => void;
	onSandboxClick: (id: string) => void;
	onSandboxDoubleClick: (id: string) => void;
	onSandboxUpdate: (id: string, updates: Partial<Sandbox>) => void;
}

export function InfiniteCanvas({
	sandboxes,
	selectedSandboxId,
	focusedSandboxId,
	transform,
	pattern,
	onTransformChange,
	onSandboxClick,
	onSandboxDoubleClick,
	onSandboxUpdate
}: InfiniteCanvasProps) {
	const canvasRef = useRef<HTMLDivElement>(null);
	const [isPanning, setIsPanning] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [draggingSandbox, setDraggingSandbox] = useState<string | null>(null);
	const [sandboxDragStart, setSandboxDragStart] = useState({ x: 0, y: 0 });

	// Mouse down - start panning
	const handleMouseDown = (e: React.MouseEvent) => {
		if (e.button === 0 || e.button === 1) {
			setIsPanning(true);
			setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
			e.preventDefault();
		}
	};

	// Mouse move - pan canvas or drag sandbox
	const handleMouseMove = (e: React.MouseEvent) => {
		if (draggingSandbox) {
			// Dragging a sandbox
			const deltaX = (e.clientX - sandboxDragStart.x) / transform.scale;
			const deltaY = (e.clientY - sandboxDragStart.y) / transform.scale;

			const sandbox = sandboxes.find(s => s.id === draggingSandbox);
			if (sandbox) {
				onSandboxUpdate(draggingSandbox, {
					x: sandbox.x + deltaX,
					y: sandbox.y + deltaY
				});
			}
			setSandboxDragStart({ x: e.clientX, y: e.clientY });
		} else if (isPanning) {
			// Panning canvas
			const newX = e.clientX - dragStart.x;
			const newY = e.clientY - dragStart.y;
			onTransformChange({ ...transform, x: newX, y: newY });
		}
	};

	// Mouse up - stop panning or dragging
	const handleMouseUp = () => {
		setIsPanning(false);
		setDraggingSandbox(null);
	};

	// Handle sandbox mouse down (for dragging)
	const handleSandboxMouseDown = (e: React.MouseEvent, sandboxId: string) => {
		e.stopPropagation(); // Prevent canvas panning
		setDraggingSandbox(sandboxId);
		setSandboxDragStart({ x: e.clientX, y: e.clientY });
		onSandboxClick(sandboxId); // Also select it
	};

	// Wheel - zoom in/out
	const handleWheel = (e: React.WheelEvent) => {
		e.preventDefault();

		const delta = -e.deltaY;
		const zoomIntensity = 0.001;
		const newScale = Math.max(0.1, Math.min(10, transform.scale + delta * zoomIntensity));

		// Zoom towards mouse cursor
		const rect = canvasRef.current?.getBoundingClientRect();
		if (rect) {
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			const scaleRatio = newScale / transform.scale;
			const newX = mouseX - (mouseX - transform.x) * scaleRatio;
			const newY = mouseY - (mouseY - transform.y) * scaleRatio;

			onTransformChange({ x: newX, y: newY, scale: newScale });
		}
	};

	// Generate background pattern based on type
	const getBackgroundStyle = (): React.CSSProperties => {
		const gridSize = 20 * transform.scale;
		const offsetX = transform.x % gridSize;
		const offsetY = transform.y % gridSize;

		if (pattern === 'grid') {
			return {
				backgroundImage: `
					linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
					linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)
				`,
				backgroundSize: `${gridSize}px ${gridSize}px`,
				backgroundPosition: `${offsetX}px ${offsetY}px`,
			};
		} else if (pattern === 'dots') {
			return {
				backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.15) 1px, transparent 1px)`,
				backgroundSize: `${gridSize}px ${gridSize}px`,
				backgroundPosition: `${offsetX}px ${offsetY}px`,
			};
		} else {
			return {};
		}
	};

	return (
		<div
			ref={canvasRef}
			className={`canvas ${isPanning ? 'panning' : ''}`}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
			onWheel={handleWheel}
			style={getBackgroundStyle()}
		>
			{/* Canvas content with transform */}
			<div
				className="canvas-content"
				style={{
					transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
					transformOrigin: '0 0',
				}}
			>
				{/* Render sandboxes as iframes */}
				{sandboxes.map((sandbox) => (
					<SandboxPreview
						key={sandbox.id}
						sandbox={sandbox}
						isSelected={sandbox.id === selectedSandboxId}
						isFocused={sandbox.id === focusedSandboxId}
						onMouseDown={(e) => handleSandboxMouseDown(e, sandbox.id)}
						onClick={() => onSandboxClick(sandbox.id)}
						onDoubleClick={() => onSandboxDoubleClick(sandbox.id)}
					/>
				))}
			</div>
		</div>
	);
}
