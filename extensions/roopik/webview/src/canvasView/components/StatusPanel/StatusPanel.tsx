/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { Transform, BackgroundPattern } from '../../types';
import { ColorPicker } from './ColorPicker';
import '../../styles/statusPanel.css';

// ============================================================
// Types
// ============================================================

export interface StatusPanelProps {
	transform: Transform;
	fps: number;
	sandboxCount: number;
	pattern: BackgroundPattern;
	backgroundColor: string;
	selectedSandboxId: string | null;
	focusedSandboxId: string | null;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onResetView: () => void;
	onTogglePattern: () => void;
	onBackgroundColorChange: (color: string) => void;
}

// ============================================================
// Constants
// ============================================================

const PATTERN_ICONS: Record<BackgroundPattern, string> = {
	grid: '⊞',
	dots: '⋮',
	plain: '▢',
};

// ============================================================
// Sub-components
// ============================================================

interface ZoomControlsProps {
	scale: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onResetView: () => void;
}

function ZoomControls({ scale, onZoomIn, onZoomOut, onResetView }: ZoomControlsProps) {
	return (
		<>
			<span onClick={onZoomOut} className="zoom-btn" title="Zoom Out">−</span>
			<span className="zoom-level">{Math.round(scale * 100)}%</span>
			<span onClick={onZoomIn} className="zoom-btn" title="Zoom In">+</span>
			<span onClick={onResetView} className="zoom-btn" title="Reset View">⟲</span>
		</>
	);
}

interface StatusInfoProps {
	transform: Transform;
	fps: number;
	sandboxCount: number;
}

function StatusInfo({ transform, fps, sandboxCount }: StatusInfoProps) {
	return (
		<>
			<span>•</span>
			<span>{transform.scale.toFixed(2)}x</span>
			<span>•</span>
			<span>{fps} FPS</span>
			<span>•</span>
			<span>X: {Math.round(transform.x)}, Y: {Math.round(transform.y)}</span>
			<span>•</span>
			<span>Sandboxes: {sandboxCount}</span>
		</>
	);
}

interface SelectionStatusProps {
	selectedId: string | null;
	focusedId: string | null;
}

function SelectionStatus({ selectedId, focusedId }: SelectionStatusProps) {
	if (!selectedId) return null;

	const isFocused = focusedId === selectedId;
	const statusColor = isFocused ? '#4fc3f7' : '#7c87f7';

	return (
		<>
			<span>•</span>
			<span style={{ color: statusColor, fontWeight: 600 }}>
				[ {selectedId} ]
			</span>
		</>
	);
}

// ============================================================
// Main Component
// ============================================================

export function StatusPanel({
	transform,
	fps,
	sandboxCount,
	pattern,
	backgroundColor,
	selectedSandboxId,
	focusedSandboxId,
	onZoomIn,
	onZoomOut,
	onResetView,
	onTogglePattern,
	onBackgroundColorChange,
}: StatusPanelProps) {
	return (
		<div className="status-bar">
			{/* Left side - Zoom & Status Info */}
			<div className="status-left">
				<ZoomControls
					scale={transform.scale}
					onZoomIn={onZoomIn}
					onZoomOut={onZoomOut}
					onResetView={onResetView}
				/>
				<StatusInfo
					transform={transform}
					fps={fps}
					sandboxCount={sandboxCount}
				/>
				<SelectionStatus
					selectedId={selectedSandboxId}
					focusedId={focusedSandboxId}
				/>
			</div>

			{/* Right side - Background Controls */}
			<div className="status-right">
				<ColorPicker
					currentColor={backgroundColor}
					onColorChange={onBackgroundColorChange}
				/>
				<button
					onClick={onTogglePattern}
					className="pattern-btn"
					title="Toggle Pattern"
				>
					{PATTERN_ICONS[pattern]}
				</button>
			</div>
		</div>
	);
}
