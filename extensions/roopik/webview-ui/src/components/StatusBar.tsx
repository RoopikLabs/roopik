/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type BackgroundPattern = 'grid' | 'dots' | 'plain';

interface Transform {
	x: number;
	y: number;
	scale: number;
}

interface StatusBarProps {
	transform: Transform;
	fps: number;
	sandboxCount: number;
	pattern: BackgroundPattern;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onResetView: () => void;
	onTogglePattern: () => void;
}

export function StatusBar({
	transform,
	fps,
	sandboxCount,
	pattern,
	onZoomIn,
	onZoomOut,
	onResetView,
	onTogglePattern
}: StatusBarProps) {
	return (
		<div className="status-bar">
			<div className="status-left">
				<span onClick={onZoomOut} className="zoom-btn" title="Zoom Out">−</span>
				<span className="zoom-level">{Math.round(transform.scale * 100)}%</span>
				<span onClick={onZoomIn} className="zoom-btn" title="Zoom In">+</span>
				<span onClick={onResetView} className="zoom-btn" title="Reset View">⟲</span>
				<span>•</span>
				<span>{transform.scale.toFixed(2)}x</span>
				<span>•</span>
				<span>{fps} FPS</span>
				<span>•</span>
				<span>X: {Math.round(transform.x)}, Y: {Math.round(transform.y)}</span>
				<span>•</span>
				<span>Sandboxes: {sandboxCount}</span>
			</div>
			<div className="status-right">
				<button onClick={onTogglePattern} className="pattern-btn" title="Toggle Pattern">
					{pattern === 'grid' ? '⊞' : pattern === 'dots' ? '⋮' : '▢'}
				</button>
			</div>
		</div>
	);
}
