/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState } from 'react';
import type { Sandbox, Transform, SnapMode } from '../../types';
import { findNearestAvailableSlot, DEFAULT_CONFIG } from '../../services/gridManager';

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
	handleCanvasMouseUp: (e: React.MouseEvent) => void;
	handleSandboxDragStart: (e: React.MouseEvent, sandboxId: string) => void;
}

interface UseCanvasDragProps {
	transform: Transform;
	sandboxes: Sandbox[];
	snapMode: SnapMode;
	onTransformChange: (transform: Transform) => void;
	onSandboxUpdate: (id: string, updates: Partial<Sandbox>) => void;
	onSandboxClick: (id: string) => void;
	onCanvasBackgroundClick?: () => void;
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
	snapMode,
	onTransformChange,
	onSandboxUpdate,
	onSandboxClick,
	onCanvasBackgroundClick,
}: UseCanvasDragProps): UseCanvasDragReturn {
	const [isPanning, setIsPanning] = useState(false);
	const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
	const [mouseDownPos, setMouseDownPos] = useState<Point>({ x: 0, y: 0 });

	const [draggingSandboxId, setDraggingSandboxId] = useState<string | null>(null);
	const [sandboxDragStart, setSandboxDragStart] = useState<Point>({ x: 0, y: 0 });
	const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
	const [mouseDownTarget, setMouseDownTarget] = useState<EventTarget | null>(null);

	// Start panning canvas
	const handleCanvasMouseDown = (e: React.MouseEvent) => {
		if (e.button === 0 || e.button === 1) {
			setIsPanning(true);
			setPanStart({
				x: e.clientX - transform.x,
				y: e.clientY - transform.y,
			});
			// Track mouse down position and target to detect clicks vs drags
			setMouseDownPos({ x: e.clientX, y: e.clientY });
			setMouseDownTarget(e.target);
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
	const handleCanvasMouseUp = (e: React.MouseEvent) => {
		// Commit sandbox position if dragged
		if (draggingSandboxId && (dragOffset.x !== 0 || dragOffset.y !== 0)) {
			const sandbox = sandboxes.find(s => s.id === draggingSandboxId);
			if (sandbox) {
				const newX = sandbox.x + dragOffset.x;
				const newY = sandbox.y + dragOffset.y;

				if (snapMode === 'grid') {
					// Grid mode: snap to nearest available grid slot
					const snappedPosition = findNearestAvailableSlot(
						newX,
						newY,
						sandboxes,
						draggingSandboxId,
						DEFAULT_CONFIG
					);
					onSandboxUpdate(draggingSandboxId, {
						x: snappedPosition.x,
						y: snappedPosition.y,
					});
				} else {
					// Free mode: allow any position
					onSandboxUpdate(draggingSandboxId, {
						x: newX,
						y: newY,
					});
				}
			}
		}

		// Detect click on canvas background (no significant movement)
		const wasDraggingSandbox = draggingSandboxId !== null;
		const clickThreshold = 5; // pixels
		const deltaX = Math.abs(e.clientX - mouseDownPos.x);
		const deltaY = Math.abs(e.clientY - mouseDownPos.y);
		const wasClick = deltaX < clickThreshold && deltaY < clickThreshold;

		// Check if mousedown started OUTSIDE all sandbox cards (truly on canvas background)
		// We need to check if the target is inside any .sandbox-card element
		const targetElement = mouseDownTarget as HTMLElement;
		const clickedInsideSandbox = targetElement?.closest?.('.sandbox-card') !== null;

		// If it was a click (not a drag) and clicked outside ALL sandboxes, unfocus
		if (wasClick && !wasDraggingSandbox && !clickedInsideSandbox && onCanvasBackgroundClick) {
			onCanvasBackgroundClick();
		}

		// Reset all drag state
		setIsPanning(false);
		setDraggingSandboxId(null);
		setDragOffset({ x: 0, y: 0 });
		setMouseDownTarget(null);
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
