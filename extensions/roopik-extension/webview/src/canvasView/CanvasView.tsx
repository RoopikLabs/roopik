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
	const [snapMode, setSnapMode] = useState<SnapMode>('smart');
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

	// Add component handler
	const handleAddComponent = useCallback(() => {
		const n = sandboxes.length;
		const x = 100 + (n % 3) * 600;
		const y = 100 + Math.floor(n / 3) * 500;

		const newSandbox: Sandbox = {
			id: `component-${Date.now()}`,
			x,
			y,
			width: 400,
			height: 350,
			zIndex: n + 1,
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
	}, [sandboxes.length]);

	// Sandbox handlers
	const handleSandboxClick = useCallback((id: string) => {
		setSelectedSandboxId(id);
	}, []);

	const handleSandboxDoubleClick = useCallback((id: string) => {
		setFocusedSandboxId(prev => prev === id ? null : id);
	}, []);

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
				onResetView={handleResetView}
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
