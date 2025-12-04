/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { Transform, SnapMode, BackgroundPattern } from '../../types';

interface StatusPanelProps {
	transform: Transform;
	sandboxCount: number;
	snapMode: SnapMode;
	pattern: BackgroundPattern;
	selectedSandboxId: string | null;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onResetView: () => void;
	onSnapModeChange: (mode: SnapMode) => void;
	onPatternChange: () => void;
}

/**
 * Get display label for snap mode
 */
function getSnapModeLabel(mode: SnapMode): string {
	return mode === 'grid' ? 'Grid' : 'Free';
}

/**
 * Get next snap mode (toggle between grid and free)
 */
function getNextSnapMode(mode: SnapMode): SnapMode {
	return mode === 'grid' ? 'free' : 'grid';
}

/**
 * StatusPanel - Bottom status bar with zoom, snap mode, and info
 * Clean, lean design - single button toggles between grid and free modes
 */
export function StatusPanel({
	transform,
	sandboxCount,
	snapMode,
	pattern,
	selectedSandboxId,
	onZoomIn,
	onZoomOut,
	onResetView,
	onSnapModeChange,
	onPatternChange
}: StatusPanelProps) {
	const handleSnapModeToggle = () => {
		onSnapModeChange(getNextSnapMode(snapMode));
	};

	return (
		<div className="status-panel">
			{/* Left side: Zoom controls and info */}
			<div className="status-left">
				{/* Zoom controls */}
				<div className="status-group zoom-controls">
					<button onClick={onZoomOut} title="Zoom Out">−</button>
					<span style={{ minWidth: '40px', textAlign: 'center' }}>
						{Math.round(transform.scale * 100)}%
					</span>
					<button onClick={onZoomIn} title="Zoom In">+</button>
					<button onClick={onResetView} title="Reset View">⟲</button>
				</div>

				<div className="separator" />

				{/* Snap Mode Toggle Button (Grid / Free) */}
				<button
					className="snap-toggle"
					onClick={handleSnapModeToggle}
					title={`Snap Mode: ${getSnapModeLabel(snapMode)} (click to toggle)`}
				>
					{snapMode === 'grid' ? '⊞' : '◇'} {getSnapModeLabel(snapMode)}
				</button>

				<div className="separator" />

				{/* Coordinates */}
				<span style={{ opacity: 0.8 }}>
					{Math.round(-transform.x / transform.scale)}, {Math.round(-transform.y / transform.scale)}
				</span>

				<div className="separator" />

				{/* Sandbox count */}
				<span>
					{sandboxCount} component{sandboxCount !== 1 ? 's' : ''}
				</span>

				{/* Selected sandbox */}
				{selectedSandboxId && (
					<>
						<div className="separator" />
						<span style={{ color: 'var(--vscode-textLink-foreground)', fontWeight: 500 }}>
							{selectedSandboxId}
						</span>
					</>
				)}
			</div>

			{/* Right side: Pattern toggle */}
			<div className="status-right">
				<button
					className="pattern-toggle"
					onClick={onPatternChange}
					title="Toggle background pattern"
				>
					{pattern === 'grid' ? '⊞' : pattern === 'dots' ? '⋮⋮' : '▢'}
				</button>
			</div>
		</div>
	);
}
