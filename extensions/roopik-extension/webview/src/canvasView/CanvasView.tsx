/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback } from 'react';
import { InfiniteCanvas, FloatingToolbar, StatusPanel } from './components';
import { gridManager } from './services/GridManager';
import type {
	Sandbox,
	Transform,
	SnapMode,
	BackgroundPattern,
	ExtensionMessage,
	WebviewMessage,
	VSCodeAPI
} from './types';

// Get VSCode API (only call once!)
const vscode: VSCodeAPI = acquireVsCodeApi();

/**
 * Sample component code for new sandboxes
 */
const SAMPLE_CODE = `const Component = () => {
  const [count, setCount] = React.useState(0);
  return (
    <button
      onClick={() => setCount(c => c + 1)}
      style={{
        padding: '12px 24px',
        fontSize: '16px',
        background: '#3b82f6',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer'
      }}
    >
      Clicked {count} times
    </button>
  );
};`;

/**
 * CanvasView - Main orchestrator component
 *
 * Manages:
 * - Sandboxes (components)
 * - Transform (pan/zoom)
 * - Snap mode (Free | Grid | Smart)
 * - Communication with Extension via postMessage
 */
export function CanvasView() {
	// State
	const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
	const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(null);
	const [focusedSandboxId, setFocusedSandboxId] = useState<string | null>(null);
	const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
	const [snapMode, setSnapMode] = useState<SnapMode>('grid'); // Default to grid mode
	const [pattern, setPattern] = useState<BackgroundPattern>('dots');
	const [backgroundColor] = useState('#1e1e1e');

	// Sync snap mode with GridManager
	useEffect(() => {
		gridManager.setMode(snapMode);
	}, [snapMode]);

	// Handle messages from Extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const msg = event.data;

			switch (msg.type) {
				case 'canvasLoaded': {
					// Restore canvas state
					const { state } = msg.payload;
					setSandboxes(state.sandboxes);
					setSelectedSandboxId(state.selectedSandboxId);
					setTransform(state.viewport);
					break;
				}
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	// Notify extension that webview is ready
	useEffect(() => {
		const message: WebviewMessage = { type: 'ready' };
		vscode.postMessage(message);
	}, []);

	// Add component handler - uses GridManager to find next available slot
	const handleAddComponent = useCallback(() => {
		// Get sandbox dimensions from GridManager config
		const config = gridManager.getConfig();
		const position = gridManager.getNextAvailableSlot(sandboxes);

		const newSandbox: Sandbox = {
			id: `component-${Date.now()}`,
			x: position.x,
			y: position.y,
			width: config.sandboxWidth,
			height: config.sandboxHeight,
			zIndex: sandboxes.length + 1,
			sandboxMessage: {
				type: 'init',
				code: SAMPLE_CODE,
				cdnUrls: [
					'https://unpkg.com/react@18/umd/react.development.js',
					'https://unpkg.com/react-dom@18/umd/react-dom.development.js'
				]
			}
		};

		setSandboxes(prev => [...prev, newSandbox]);
		setSelectedSandboxId(newSandbox.id);
	}, [sandboxes]);

	// Sandbox handlers
	const handleSandboxClick = useCallback((id: string) => {
		setSelectedSandboxId(id);
		// Bring clicked sandbox to top (highest z-index)
		setSandboxes(prev => {
			const maxZ = Math.max(...prev.map(s => s.zIndex));
			return prev.map(s => s.id === id ? { ...s, zIndex: maxZ + 1 } : s);
		});
	}, []);

	// Double click - enter/exit focus mode with zoom to sandbox
	const handleSandboxDoubleClick = useCallback((id: string) => {
		const isExitingFocus = focusedSandboxId === id;

		if (isExitingFocus) {
			// Exit focus mode - reset view
			setFocusedSandboxId(null);
			// Reset to fit all sandboxes or default view
			const viewport = gridManager.calculateResetViewport(
				sandboxes,
				window.innerWidth,
				window.innerHeight
			);
			setTransform(viewport);
		} else {
			// Enter focus mode - zoom to this sandbox
			setFocusedSandboxId(id);
			const sandbox = sandboxes.find(s => s.id === id);
			if (sandbox) {
				// Calculate viewport to center and zoom on this sandbox
				const viewport = gridManager.calculateFocusViewport(
					sandbox,
					window.innerWidth,
					window.innerHeight
				);
				setTransform(viewport);
			}
			// Also bring to top
			setSandboxes(prev => {
				const maxZ = Math.max(...prev.map(s => s.zIndex));
				return prev.map(s => s.id === id ? { ...s, zIndex: maxZ + 1 } : s);
			});
		}
	}, [focusedSandboxId, sandboxes]);

	const handleSandboxUpdate = useCallback((id: string, updates: Partial<Sandbox>) => {
		setSandboxes(prev =>
			prev.map(s => s.id === id ? { ...s, ...updates } : s)
		);
	}, []);

	const handleSandboxDelete = useCallback((id: string) => {
		setSandboxes(prev => prev.filter(s => s.id !== id));
		if (selectedSandboxId === id) setSelectedSandboxId(null);
		if (focusedSandboxId === id) setFocusedSandboxId(null);
	}, [selectedSandboxId, focusedSandboxId]);

	const handleCanvasClick = useCallback(() => {
		setSelectedSandboxId(null);
	}, []);

	// Transform handlers
	const handleTransformChange = useCallback((newTransform: Transform) => {
		setTransform(newTransform);
	}, []);

	const handleZoomIn = useCallback(() => {
		setTransform(prev => ({
			...prev,
			scale: Math.min(10, prev.scale * 1.2)
		}));
	}, []);

	const handleZoomOut = useCallback(() => {
		setTransform(prev => ({
			...prev,
			scale: Math.max(0.1, prev.scale / 1.2)
		}));
	}, []);

	const handleResetView = useCallback(() => {
		setTransform({ x: 0, y: 0, scale: 1 });
	}, []);

	// Tidy Up - reorganize all sandboxes to fill grid slots sequentially (no gaps) + reset view
	const handleTidyUp = useCallback(() => {
		if (sandboxes.length === 0) return;

		// Get new positions from GridManager's tidyUp
		const newPositions = gridManager.tidyUp(sandboxes);

		// Update all sandboxes with their new positions
		const updatedSandboxes = sandboxes.map(sandbox => {
			const newPos = newPositions.get(sandbox.id);
			if (newPos) {
				return { ...sandbox, x: newPos.x, y: newPos.y };
			}
			return sandbox;
		});

		setSandboxes(updatedSandboxes);

		// Reset view to show all tidied sandboxes nicely
		const viewport = gridManager.calculateResetViewport(
			updatedSandboxes,
			window.innerWidth,
			window.innerHeight
		);
		setTransform(viewport);

		// Clear any selection/focus state for clean view
		setSelectedSandboxId(null);
		setFocusedSandboxId(null);
	}, [sandboxes]);

	// Snap mode handler
	const handleSnapModeChange = useCallback((mode: SnapMode) => {
		setSnapMode(mode);
	}, []);

	// Pattern toggle
	const handlePatternChange = useCallback(() => {
		setPattern(prev => {
			if (prev === 'dots') return 'grid';
			if (prev === 'grid') return 'plain';
			return 'dots';
		});
	}, []);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Delete selected sandbox
			if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSandboxId) {
				handleSandboxDelete(selectedSandboxId);
			}
			// Reset zoom
			if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				handleResetView();
			}
			// Escape to deselect
			if (e.key === 'Escape') {
				setSelectedSandboxId(null);
				setFocusedSandboxId(null);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [selectedSandboxId, handleSandboxDelete, handleResetView]);

	return (
		<>
			{/* Floating Toolbar (top) */}
			<FloatingToolbar
				tabName="Canvas"
				onAddComponent={handleAddComponent}
				onTidyUp={handleTidyUp}
			/>

			{/* Infinite Canvas (main area) */}
			<div className="canvas-container">
				<InfiniteCanvas
					sandboxes={sandboxes}
					selectedSandboxId={selectedSandboxId}
					focusedSandboxId={focusedSandboxId}
					transform={transform}
					pattern={pattern}
					backgroundColor={backgroundColor}
					snapMode={snapMode}
					onTransformChange={handleTransformChange}
					onSandboxClick={handleSandboxClick}
					onSandboxDoubleClick={handleSandboxDoubleClick}
					onSandboxUpdate={handleSandboxUpdate}
					onSandboxDelete={handleSandboxDelete}
					onCanvasClick={handleCanvasClick}
				/>
			</div>

			{/* Status Panel (bottom) */}
			<StatusPanel
				transform={transform}
				sandboxCount={sandboxes.length}
				snapMode={snapMode}
				pattern={pattern}
				selectedSandboxId={selectedSandboxId}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onResetView={handleResetView}
				onSnapModeChange={handleSnapModeChange}
				onPatternChange={handlePatternChange}
			/>
		</>
	);
}
