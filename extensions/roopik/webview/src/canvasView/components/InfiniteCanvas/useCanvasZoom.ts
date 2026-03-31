/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useEffect } from 'react';
import type { Transform } from '../../types';

// ============================================================
// Constants
// ============================================================

const ZOOM_INTENSITY = 0.001;
const TOUCHPAD_ZOOM_THRESHOLD = 80;
const TOUCHPAD_ZOOM_STEP = 0.1;
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const TOUCHPAD_SCROLL_THRESHOLD = 50;

// ============================================================
// Hook
// ============================================================

interface UseCanvasZoomProps {
	canvasRef: React.RefObject<HTMLDivElement | null>;
	transform: Transform;
	onTransformChange: (transform: Transform) => void;
}

/**
 * Hook to handle canvas zoom/pan via mouse wheel and touchpad gestures.
 * Supports:
 * - Mouse wheel zoom (centered on cursor)
 * - Touchpad pinch zoom (centered on cursor)
 * - Touchpad two-finger scroll (pan)
 */
export function useCanvasZoom({
	canvasRef,
	transform,
	onTransformChange,
}: UseCanvasZoomProps) {
	// Refs for smooth touchpad handling
	const accumulatedDeltaRef = useRef(0);
	const lastZoomTimeRef = useRef(0);
	const scrollAnimationFrameRef = useRef<number | null>(null);
	const pendingScrollDeltaRef = useRef({ x: 0, y: 0 });

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const handleWheel = (e: WheelEvent) => {
			const isPinch = e.ctrlKey;
			const hasHorizontalDelta = Math.abs(e.deltaX) > 0;
			const isTouchpadScroll = hasHorizontalDelta ||
				(Math.abs(e.deltaY) > 0 && Math.abs(e.deltaY) < TOUCHPAD_SCROLL_THRESHOLD);

			// Touchpad scroll (pan)
			if (!isPinch && isTouchpadScroll) {
				e.preventDefault();
				handleTouchpadPan(e.deltaX, e.deltaY);
				return;
			}

			// Mouse wheel zoom
			if (!isPinch) {
				e.preventDefault();
				handleMouseWheelZoom(e);
				return;
			}

			// Touchpad pinch zoom
			e.preventDefault();
			handlePinchZoom(e);
		};

		const handleTouchpadPan = (deltaX: number, deltaY: number) => {
			pendingScrollDeltaRef.current.x += deltaX;
			pendingScrollDeltaRef.current.y += deltaY;

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
		};

		const handleMouseWheelZoom = (e: WheelEvent) => {
			const rect = canvas.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			let delta = -e.deltaY;
			if (e.deltaMode === 1) delta *= 33;
			else if (e.deltaMode === 2) delta *= 100;

			const scaleChange = delta * ZOOM_INTENSITY;
			const newScale = clampScale(transform.scale + scaleChange);
			const { x: newX, y: newY } = zoomToPoint(transform, newScale, mouseX, mouseY);

			onTransformChange({ x: newX, y: newY, scale: newScale });
		};

		const handlePinchZoom = (e: WheelEvent) => {
			const rect = canvas.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			let delta = -e.deltaY;
			if (e.deltaMode === 1) delta *= 33;
			else if (e.deltaMode === 2) delta *= 100;

			const now = Date.now();
			const timeSinceLastZoom = now - lastZoomTimeRef.current;
			accumulatedDeltaRef.current += delta;

			const steps = Math.floor(Math.abs(accumulatedDeltaRef.current) / TOUCHPAD_ZOOM_THRESHOLD);

			if (steps > 0 || timeSinceLastZoom > 100) {
				const direction = accumulatedDeltaRef.current > 0 ? 1 : -1;
				const scaleChange = direction * TOUCHPAD_ZOOM_STEP * (steps > 0 ? steps : 1);
				const newScale = clampScale(transform.scale + scaleChange);
				const { x: newX, y: newY } = zoomToPoint(transform, newScale, mouseX, mouseY);

				onTransformChange({ x: newX, y: newY, scale: newScale });

				if (steps > 0) {
					accumulatedDeltaRef.current = accumulatedDeltaRef.current % TOUCHPAD_ZOOM_THRESHOLD;
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
}

// ============================================================
// Helpers
// ============================================================

function clampScale(scale: number): number {
	return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

function zoomToPoint(
	transform: Transform,
	newScale: number,
	pointX: number,
	pointY: number
): { x: number; y: number } {
	const scaleRatio = newScale / transform.scale;
	return {
		x: pointX - (pointX - transform.x) * scaleRatio,
		y: pointY - (pointY - transform.y) * scaleRatio,
	};
}
