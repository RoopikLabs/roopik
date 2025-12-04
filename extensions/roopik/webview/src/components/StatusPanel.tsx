/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorPicker } from './ColorPicker';
import '../canvasView/styles/statusPanel.css';

type BackgroundPattern = 'grid' | 'dots' | 'plain';

interface Transform {
	x: number;
	y: number;
	scale: number;
}

interface StatusPanelProps {
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
	onBackgroundColorChange
}: StatusPanelProps) {
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
				{selectedSandboxId && (
					<>
						<span>•</span>
						<span style={{
							color: focusedSandboxId === selectedSandboxId ? '#4fc3f7' : '#7c87f7',
							fontWeight: 600
						}}>
							{focusedSandboxId === selectedSandboxId ? 'Focused' : 'Selected'}: {selectedSandboxId}
						</span>
					</>
				)}
			</div>
			<div className="status-right">
				<ColorPicker
					currentColor={backgroundColor}
					onColorChange={onBackgroundColorChange}
				/>
				<button onClick={onTogglePattern} className="pattern-btn" title="Toggle Pattern">
					{pattern === 'grid' ? '⊞' : pattern === 'dots' ? '⋮' : '▢'}
				</button>
			</div>
		</div>
	);
}
