/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useState, useEffect } from 'react';
import type { Sandbox } from '../types';
import { SandboxPreview } from './SandboxPreview';
import { isLightColor } from '../utils/colors';
import '../canvasView/styles/infiniteCanvas.css';

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
	backgroundColor: string;
	onTransformChange: (transform: Transform) => void;
	onSandboxClick: (id: string) => void;
	onSandboxDoubleClick: (id: string) => void;
	onSandboxUpdate: (id: string, updates: Partial<Sandbox>) => void;
	onSandboxDelete: (id: string) => void;
}

export function InfiniteCanvas({
	sandboxes,
	selectedSandboxId,
	focusedSandboxId,
	transform,
	pattern,
	backgroundColor,
	onTransformChange,
	onSandboxClick,
	onSandboxDoubleClick,
	onSandboxUpdate,
	onSandboxDelete
}: InfiniteCanvasProps) {
	const canvasRef = useRef<HTMLDivElement>(null);
	const [isPanning, setIsPanning] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [draggingSandbox, setDraggingSandbox] = useState<string | null>(null);
	const [sandboxDragStart, setSandboxDragStart] = useState({ x: 0, y: 0 });
	const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

	// For smooth touchpad zoom with accumulation
	const accumulatedDeltaRef = useRef(0);
	const lastZoomTimeRef = useRef(0);
	const zoomCursorPosRef = useRef({ x: 0, y: 0 });
	const scrollAnimationFrameRef = useRef<number | null>(null);
	const pendingScrollDeltaRef = useRef({ x: 0, y: 0 });

	// Add native wheel event listener to prevent passive event listener warning
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const handleNativeWheel = (e: WheelEvent) => {
			// Detect if this is a pinch gesture (zoom) or scroll gesture (pan)
			const isPinch = e.ctrlKey;

			// Detect touchpad scroll vs mouse wheel:
			// - Touchpad scroll: has horizontal delta (e.deltaX > 0) OR small fractional deltas
			// - Mouse wheel: only vertical delta with larger discrete values (typically 100)
			const hasHorizontalDelta = Math.abs(e.deltaX) > 0;
			const isTouchpadScroll = hasHorizontalDelta || (Math.abs(e.deltaY) > 0 && Math.abs(e.deltaY) < 50);

			// Only treat as pan if it's NOT a pinch and IS a touchpad scroll gesture
			if (!isPinch && isTouchpadScroll) {
				// Touchpad scroll (two/three finger swipe) - accumulate and apply via RAF
				e.preventDefault();

				// Accumulate scroll deltas
				pendingScrollDeltaRef.current.x += e.deltaX;
				pendingScrollDeltaRef.current.y += e.deltaY;

				// Cancel existing animation frame if any
				if (scrollAnimationFrameRef.current !== null) {
					cancelAnimationFrame(scrollAnimationFrameRef.current);
				}

				// Apply scroll on next animation frame
				scrollAnimationFrameRef.current = requestAnimationFrame(() => {
					const newX = transform.x - pendingScrollDeltaRef.current.x;
					const newY = transform.y - pendingScrollDeltaRef.current.y;

					// Reset pending deltas
					pendingScrollDeltaRef.current = { x: 0, y: 0 };
					scrollAnimationFrameRef.current = null;

					onTransformChange({ ...transform, x: newX, y: newY });
				});
				return;
			}

			if (!isPinch) {
				// Regular mouse wheel zoom (no ctrlKey, no horizontal scroll)
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

			zoomCursorPosRef.current = { x: mouseX, y: mouseY };

			let delta = -e.deltaY;

			// Normalize delta
			if (e.deltaMode === 1) delta *= 33;
			else if (e.deltaMode === 2) delta *= 100;

			if (isPinch) {
				// Accumulate for touchpad
				const now = Date.now();
				const timeSinceLastZoom = now - lastZoomTimeRef.current;
				accumulatedDeltaRef.current += delta;

				const threshold = 80; // Lower threshold for smoother response
				const steps = Math.floor(Math.abs(accumulatedDeltaRef.current) / threshold);

				if (steps > 0 || timeSinceLastZoom > 100) {
					const direction = accumulatedDeltaRef.current > 0 ? 1 : -1;
					const scaleStep = 0.1; // Back to 10% steps to match mouse wheel
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
			}
		};

		// Add with { passive: false } to allow preventDefault
		canvas.addEventListener('wheel', handleNativeWheel, { passive: false });

		return () => {
			canvas.removeEventListener('wheel', handleNativeWheel);
			// Clean up pending animation frame
			if (scrollAnimationFrameRef.current !== null) {
				cancelAnimationFrame(scrollAnimationFrameRef.current);
			}
		};
	}, [transform, onTransformChange]);

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
			// Dragging a sandbox - only update offset, not actual position
			const deltaX = (e.clientX - sandboxDragStart.x) / transform.scale;
			const deltaY = (e.clientY - sandboxDragStart.y) / transform.scale;

			setDragOffset({ x: deltaX, y: deltaY });
		} else if (isPanning) {
			// Panning canvas
			const newX = e.clientX - dragStart.x;
			const newY = e.clientY - dragStart.y;
			onTransformChange({ ...transform, x: newX, y: newY });
		}
	};

	// Mouse up - stop panning or dragging
	const handleMouseUp = () => {
		if (draggingSandbox && (dragOffset.x !== 0 || dragOffset.y !== 0)) {
			// Commit the final position
			const sandbox = sandboxes.find(s => s.id === draggingSandbox);
			if (sandbox) {
				onSandboxUpdate(draggingSandbox, {
					x: sandbox.x + dragOffset.x,
					y: sandbox.y + dragOffset.y
				});
			}
		}
		setIsPanning(false);
		setDraggingSandbox(null);
		setDragOffset({ x: 0, y: 0 });
	};

	// Handle sandbox mouse down (for dragging)
	const handleSandboxMouseDown = (e: React.MouseEvent, sandboxId: string) => {
		e.stopPropagation(); // Prevent canvas panning
		setDraggingSandbox(sandboxId);
		setSandboxDragStart({ x: e.clientX, y: e.clientY });
		onSandboxClick(sandboxId); // Also select it
	};

	// Generate background pattern based on type
	const getBackgroundStyle = (): React.CSSProperties => {
		const gridSize = 20 * transform.scale;
		const offsetX = transform.x % gridSize;
		const offsetY = transform.y % gridSize;

		// Use dark pattern for light backgrounds, light pattern for dark backgrounds
		const isLight = isLightColor(backgroundColor);
		const patternColor = isLight
			? 'rgba(0, 0, 0, 0.1)' // Dark pattern for light backgrounds
			: 'rgba(255, 255, 255, 0.05)'; // Light pattern for dark backgrounds
		const dotColor = isLight
			? 'rgba(0, 0, 0, 0.15)' // Dark dots for light backgrounds
			: 'rgba(255, 255, 255, 0.15)'; // Light dots for dark backgrounds

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
					transformOrigin: '0 0',
				}}
			>
				{/* Render sandboxes as iframes */}
				{sandboxes.map((sandbox) => {
					const isDragging = draggingSandbox === sandbox.id;
					return (
						<SandboxPreview
							key={sandbox.id}
							sandbox={sandbox}
							isSelected={sandbox.id === selectedSandboxId}
							isFocused={sandbox.id === focusedSandboxId}
							isDragging={isDragging}
							dragOffset={isDragging ? dragOffset : undefined}
							onMouseDown={(e) => handleSandboxMouseDown(e, sandbox.id)}
							onClick={() => onSandboxClick(sandbox.id)}
							onDoubleClick={() => onSandboxDoubleClick(sandbox.id)}
							onDelete={() => onSandboxDelete(sandbox.id)}
						/>
					);
				})}
			</div>
		</div>
	);
}
