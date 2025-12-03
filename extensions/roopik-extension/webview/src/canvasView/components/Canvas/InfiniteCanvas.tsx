/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useState, useEffect, useCallback } from 'react';
import type { Sandbox, Transform, BackgroundPattern, Point, SnapMode } from '../../types';
import { SandboxCard } from '../SandboxCard';
import { gridManager } from '../../services/GridManager';
import { isLightColor } from '../../utils';

interface InfiniteCanvasProps {
	sandboxes: Sandbox[];
	selectedSandboxId: string | null;
	focusedSandboxId: string | null;
	transform: Transform;
	pattern: BackgroundPattern;
	backgroundColor: string;
	snapMode: SnapMode;
	onTransformChange: (transform: Transform) => void;
	onSandboxClick: (id: string) => void;
	onSandboxDoubleClick: (id: string) => void;
	onSandboxUpdate: (id: string, updates: Partial<Sandbox>) => void;
	onSandboxDelete: (id: string) => void;
	onCanvasClick: () => void;
}

export function InfiniteCanvas({
	sandboxes,
	selectedSandboxId,
	focusedSandboxId,
	transform,
	pattern,
	backgroundColor,
	snapMode,
	onTransformChange,
	onSandboxClick,
	onSandboxDoubleClick,
	onSandboxUpdate,
	onSandboxDelete,
	onCanvasClick
}: InfiniteCanvasProps) {
	const canvasRef = useRef<HTMLDivElement>(null);
	const [isPanning, setIsPanning] = useState(false);
	const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
	const [draggingSandbox, setDraggingSandbox] = useState<string | null>(null);
	const [sandboxDragStart, setSandboxDragStart] = useState<Point>({ x: 0, y: 0 });
	const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
	const [isOverlapping, setIsOverlapping] = useState(false);

	// Keep gridManager in sync with snapMode prop
	useEffect(() => {
		gridManager.setMode(snapMode);
	}, [snapMode]);

	// Refs for smooth touchpad zoom
	const accumulatedDeltaRef = useRef(0);
	const lastZoomTimeRef = useRef(0);
	const scrollAnimationFrameRef = useRef<number | null>(null);
	const pendingScrollDeltaRef = useRef<Point>({ x: 0, y: 0 });

	// Native wheel handler for smooth zoom/pan
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const handleWheel = (e: WheelEvent) => {
			const isPinch = e.ctrlKey;
			const hasHorizontalDelta = Math.abs(e.deltaX) > 0;
			const isTouchpadScroll = hasHorizontalDelta || (Math.abs(e.deltaY) > 0 && Math.abs(e.deltaY) < 50);

			// Touchpad scroll (pan)
			if (!isPinch && isTouchpadScroll) {
				e.preventDefault();
				pendingScrollDeltaRef.current.x += e.deltaX;
				pendingScrollDeltaRef.current.y += e.deltaY;

				if (scrollAnimationFrameRef.current !== null) {
					cancelAnimationFrame(scrollAnimationFrameRef.current);
				}

				scrollAnimationFrameRef.current = requestAnimationFrame(() => {
					const newX = transform.x - pendingScrollDeltaRef.current.x;
					const newY = transform.y - pendingScrollDeltaRef.current.y;
					pendingScrollDeltaRef.current = { x: 0, y: 0 };
					scrollAnimationFrameRef.current = null;
					onTransformChange({ ...transform, x: newX, y: newY });
				});
				return;
			}

			// Mouse wheel zoom (no ctrlKey)
			if (!isPinch) {
				e.preventDefault();
				const rect = canvas.getBoundingClientRect();
				const mouseX = e.clientX - rect.left;
				const mouseY = e.clientY - rect.top;

				let delta = -e.deltaY;
				if (e.deltaMode === 1) delta *= 33;
				else if (e.deltaMode === 2) delta *= 100;

				const zoomIntensity = 0.001;
				const scaleChange = delta * zoomIntensity;
				const newScale = Math.max(0.1, Math.min(10, transform.scale + scaleChange));
				const scaleRatio = newScale / transform.scale;
				const newX = mouseX - (mouseX - transform.x) * scaleRatio;
				const newY = mouseY - (mouseY - transform.y) * scaleRatio;

				onTransformChange({ x: newX, y: newY, scale: newScale });
				return;
			}

			// Touchpad pinch zoom
			e.preventDefault();
			const rect = canvas.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			let delta = -e.deltaY;
			if (e.deltaMode === 1) delta *= 33;
			else if (e.deltaMode === 2) delta *= 100;

			const now = Date.now();
			const timeSinceLastZoom = now - lastZoomTimeRef.current;
			accumulatedDeltaRef.current += delta;

			const threshold = 80;
			const steps = Math.floor(Math.abs(accumulatedDeltaRef.current) / threshold);

			if (steps > 0 || timeSinceLastZoom > 100) {
				const direction = accumulatedDeltaRef.current > 0 ? 1 : -1;
				const scaleStep = 0.1;
				const scaleChange = direction * scaleStep * (steps > 0 ? steps : 1);

				const newScale = Math.max(0.1, Math.min(10, transform.scale + scaleChange));
				const scaleRatio = newScale / transform.scale;
				const newX = mouseX - (mouseX - transform.x) * scaleRatio;
				const newY = mouseY - (mouseY - transform.y) * scaleRatio;

				onTransformChange({ x: newX, y: newY, scale: newScale });

				if (steps > 0) {
					accumulatedDeltaRef.current = accumulatedDeltaRef.current % threshold;
				}
				lastZoomTimeRef.current = now;
			}
		};

		canvas.addEventListener('wheel', handleWheel, { passive: false });

		return () => {
			canvas.removeEventListener('wheel', handleWheel);
			if (scrollAnimationFrameRef.current !== null) {
				cancelAnimationFrame(scrollAnimationFrameRef.current);
			}
		};
	}, [transform, onTransformChange]);

	// Start panning
	const handleMouseDown = (e: React.MouseEvent) => {
		if (e.button === 0 || e.button === 1) {
			setIsPanning(true);
			setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
			e.preventDefault();
		}
	};

	// Pan canvas or drag sandbox
	const handleMouseMove = useCallback((e: React.MouseEvent) => {
		if (draggingSandbox) {
			// Dragging a sandbox - calculate offset (FREE movement during drag!)
			const deltaX = (e.clientX - sandboxDragStart.x) / transform.scale;
			const deltaY = (e.clientY - sandboxDragStart.y) / transform.scale;

			// Get current sandbox
			const sandbox = sandboxes.find(s => s.id === draggingSandbox);
			if (!sandbox) return;

			// Calculate new position - FREE movement, no snap during drag
			const newX = sandbox.x + deltaX;
			const newY = sandbox.y + deltaY;

			// Set drag offset directly (free movement)
			setDragOffset({ x: deltaX, y: deltaY });

			// Check for overlap (visual indicator only)
			const overlapInfo = gridManager.detectOverlap(newX, newY, draggingSandbox, sandboxes);
			setIsOverlapping(overlapInfo.isOverlapping);
		} else if (isPanning) {
			// Panning canvas
			const newX = e.clientX - dragStart.x;
			const newY = e.clientY - dragStart.y;
			onTransformChange({ ...transform, x: newX, y: newY });
		}
	}, [draggingSandbox, sandboxDragStart, transform, sandboxes, isPanning, dragStart, onTransformChange]);

	// End drag - apply snap to grid on release
	const handleMouseUp = useCallback(() => {
		if (draggingSandbox && (dragOffset.x !== 0 || dragOffset.y !== 0)) {
			const sandbox = sandboxes.find(s => s.id === draggingSandbox);
			if (sandbox) {
				// Calculate the free position where user dropped
				const freeX = sandbox.x + dragOffset.x;
				const freeY = sandbox.y + dragOffset.y;

				// Apply snap to nearest grid slot on release
				const snapped = gridManager.snapToGrid(freeX, freeY, sandboxes, draggingSandbox);

				// Commit the snapped position
				onSandboxUpdate(draggingSandbox, {
					x: snapped.x,
					y: snapped.y
				});
			}
		}
		setIsPanning(false);
		setDraggingSandbox(null);
		setDragOffset({ x: 0, y: 0 });
		setIsOverlapping(false);
	}, [draggingSandbox, dragOffset, sandboxes, onSandboxUpdate]);

	// Start dragging a sandbox
	const handleSandboxMouseDown = (e: React.MouseEvent, sandboxId: string) => {
		e.stopPropagation();
		setDraggingSandbox(sandboxId);
		setSandboxDragStart({ x: e.clientX, y: e.clientY });
		onSandboxClick(sandboxId);
	};

	// Generate background pattern
	const getBackgroundStyle = (): React.CSSProperties => {
		const gridSize = 20 * transform.scale;
		const offsetX = transform.x % gridSize;
		const offsetY = transform.y % gridSize;

		const isLight = isLightColor(backgroundColor);
		const patternColor = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.05)';
		const dotColor = isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)';

		if (pattern === 'grid') {
			return {
				backgroundImage: `
					linear-gradient(${patternColor} 1px, transparent 1px),
					linear-gradient(90deg, ${patternColor} 1px, transparent 1px)
				`,
				backgroundSize: `${gridSize}px ${gridSize}px`,
				backgroundPosition: `${offsetX}px ${offsetY}px`,
			};
		} else if (pattern === 'dots') {
			return {
				backgroundImage: `radial-gradient(circle, ${dotColor} 1px, transparent 1px)`,
				backgroundSize: `${gridSize}px ${gridSize}px`,
				backgroundPosition: `${offsetX}px ${offsetY}px`,
			};
		}
		return {};
	};

	return (
		<div
			ref={canvasRef}
			className={`canvas ${isPanning ? 'panning' : ''}`}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
			onClick={(e) => {
				if (e.target === e.currentTarget) onCanvasClick();
			}}
			style={{
				...getBackgroundStyle(),
				backgroundColor: backgroundColor,
			}}
		>
			{/* Canvas content with transform */}
			<div
				className="canvas-content"
				style={{
					transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
				}}
			>
				{/* Render sandboxes */}
				{sandboxes.map((sandbox) => {
					const isDragging = draggingSandbox === sandbox.id;
					return (
						<SandboxCard
							key={sandbox.id}
							sandbox={sandbox}
							isSelected={sandbox.id === selectedSandboxId}
							isFocused={sandbox.id === focusedSandboxId}
							isDragging={isDragging}
							dragOffset={isDragging ? dragOffset : undefined}
							isOverlapping={isDragging && isOverlapping}
							onMouseDown={(e) => handleSandboxMouseDown(e, sandbox.id)}
							onClick={() => onSandboxClick(sandbox.id)}
							onDoubleClick={() => onSandboxDoubleClick(sandbox.id)}
							onDelete={() => onSandboxDelete(sandbox.id)}
						/>
					);
				})}
			</div>

			{/* Empty state */}
			{sandboxes.length === 0 && (
				<div className="empty-state">
					<h2>Roopik Canvas</h2>
					<p>Click "+ Add Component" to get started</p>
				</div>
			)}
		</div>
	);
}
