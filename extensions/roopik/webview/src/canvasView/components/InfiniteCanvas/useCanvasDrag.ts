/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState } from 'react';
import type { Sandbox, Transform } from '../../types';

// ============================================================
// Types
// ============================================================

interface Point {
	x: number;
	y: number;
}

interface UseCanvasDragReturn {
	isPanning: boolean;
	draggingSandboxId: string | null;
	dragOffset: Point;
	handleCanvasMouseDown: (e: React.MouseEvent) => void;
	handleCanvasMouseMove: (e: React.MouseEvent) => void;
	handleCanvasMouseUp: () => void;
	handleSandboxDragStart: (e: React.MouseEvent, sandboxId: string) => void;
}

interface UseCanvasDragProps {
	transform: Transform;
	sandboxes: Sandbox[];
	onTransformChange: (transform: Transform) => void;
	onSandboxUpdate: (id: string, updates: Partial<Sandbox>) => void;
	onSandboxClick: (id: string) => void;
}

// ============================================================
// Hook
// ============================================================

/**
 * Hook to handle canvas panning and sandbox dragging.
 */
export function useCanvasDrag({
	transform,
	sandboxes,
	onTransformChange,
	onSandboxUpdate,
	onSandboxClick,
}: UseCanvasDragProps): UseCanvasDragReturn {
	const [isPanning, setIsPanning] = useState(false);
	const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

	const [draggingSandboxId, setDraggingSandboxId] = useState<string | null>(null);
	const [sandboxDragStart, setSandboxDragStart] = useState<Point>({ x: 0, y: 0 });
	const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });

	// Start panning canvas
	const handleCanvasMouseDown = (e: React.MouseEvent) => {
		if (e.button === 0 || e.button === 1) {
			setIsPanning(true);
			setPanStart({
				x: e.clientX - transform.x,
				y: e.clientY - transform.y,
			});
			e.preventDefault();
		}
	};

	// Handle mouse move for both panning and sandbox dragging
	const handleCanvasMouseMove = (e: React.MouseEvent) => {
		if (draggingSandboxId) {
			// Dragging sandbox - calculate offset in canvas space
			const deltaX = (e.clientX - sandboxDragStart.x) / transform.scale;
			const deltaY = (e.clientY - sandboxDragStart.y) / transform.scale;
			setDragOffset({ x: deltaX, y: deltaY });
		} else if (isPanning) {
			// Panning canvas
			const newX = e.clientX - panStart.x;
			const newY = e.clientY - panStart.y;
			onTransformChange({ ...transform, x: newX, y: newY });
		}
	};

	// End panning or dragging
	const handleCanvasMouseUp = () => {
		// Commit sandbox position if dragged
		if (draggingSandboxId && (dragOffset.x !== 0 || dragOffset.y !== 0)) {
			const sandbox = sandboxes.find(s => s.id === draggingSandboxId);
			if (sandbox) {
				onSandboxUpdate(draggingSandboxId, {
					x: sandbox.x + dragOffset.x,
					y: sandbox.y + dragOffset.y,
				});
			}
		}

		// Reset all drag state
		setIsPanning(false);
		setDraggingSandboxId(null);
		setDragOffset({ x: 0, y: 0 });
	};

	// Start dragging a sandbox
	const handleSandboxDragStart = (e: React.MouseEvent, sandboxId: string) => {
		e.stopPropagation(); // Prevent canvas panning
		setDraggingSandboxId(sandboxId);
		setSandboxDragStart({ x: e.clientX, y: e.clientY });
		onSandboxClick(sandboxId); // Select the sandbox
	};

	return {
		isPanning,
		draggingSandboxId,
		dragOffset,
		handleCanvasMouseDown,
		handleCanvasMouseMove,
		handleCanvasMouseUp,
		handleSandboxDragStart,
	};
}
