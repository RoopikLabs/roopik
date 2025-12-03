/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback, useRef } from 'react';
import { InfiniteCanvas, FloatingToolbar, StatusPanel } from './components';
import { gridManager } from './services/GridManager';
import { SAMPLE_COMPONENTS, type SampleComponent } from './data/sampleComponents';
import type {
	Sandbox,
	Transform,
	SnapMode,
	BackgroundPattern,
	ExtensionMessage,
	WebviewMessage,
	VSCodeAPI,
	ComponentInput
} from './types';

// Get VSCode API (only call once!)
const vscode: VSCodeAPI = acquireVsCodeApi();

/**
 * Default sample ComponentInput for "Add" button
 */
const DEFAULT_COMPONENT_INPUT: ComponentInput = {
	id: 'new-component',
	source: 'user',
	framework: 'react',
	files: {
		'new-component.jsx': `import React, { useState } from 'react';

export default function NewComponent() {
  const [count, setCount] = useState(0);
  return (
    <div style={{
      padding: '40px',
      fontFamily: 'system-ui, sans-serif',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <button
        onClick={() => setCount(c => c + 1)}
        style={{
          padding: '16px 32px',
          fontSize: '18px',
          background: 'white',
          color: '#333',
          border: 'none',
          borderRadius: '12px',
          cursor: 'pointer',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
        }}
      >
        Clicked {count} times
      </button>
    </div>
  );
}`
	},
	dependencies: {
		'react': '18.2.0',
		'react-dom': '18.2.0'
	}
};

/**
 * CanvasView - Main orchestrator component
 *
 * Manages:
 * - Sandboxes (components)
 * - Transform (pan/zoom)
 * - Snap mode (Free | Grid)
 * - Sample component loading
 * - Communication with Extension via postMessage
 *
 * Flow:
 * 1. Create sandbox with ComponentInput (buildStatus: 'pending')
 * 2. Send buildComponent message to Extension
 * 3. Receive componentBuilt/componentError response
 * 4. Update sandbox with bundledCode or error
 */
export function CanvasView() {
	// State
	const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
	const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(null);
	const [focusedSandboxId, setFocusedSandboxId] = useState<string | null>(null);
	const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
	const [snapMode, setSnapMode] = useState<SnapMode>('grid');
	const [pattern, setPattern] = useState<BackgroundPattern>('dots');
	const [backgroundColor] = useState('#1e1e1e');
	const [exitingSandboxIds, setExitingSandboxIds] = useState<Set<string>>(new Set());

	// Track pending builds to handle responses
	const pendingBuildsRef = useRef<Set<string>>(new Set());

	// Sync snap mode with GridManager
	useEffect(() => {
		gridManager.setMode(snapMode);
	}, [snapMode]);

	// Handle messages from Extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const msg = event.data;

			switch (msg.type) {
				case 'componentBuilt': {
					// Component built successfully - update sandbox
					const { componentId, result } = msg.payload;
					pendingBuildsRef.current.delete(componentId);

					console.log('[CanvasView] ✅ componentBuilt received:', {
						componentId,
						framework: result.framework,
						bundledCodeLength: result.bundledCode?.length || 0,
						cdnUrls: result.cdnUrls,
						metadata: result.metadata
					});

					// Log first 500 chars of bundled code for debugging
					if (result.bundledCode) {
						console.log('[CanvasView] 📦 Bundled code preview (first 500 chars):', result.bundledCode);
					}

					setSandboxes(prev => prev.map(sandbox => {
						if (sandbox.id === componentId) {
							return {
								...sandbox,
								buildStatus: 'ready',
								bundledCode: result.bundledCode,
								cdnUrls: result.cdnUrls,
								buildError: undefined
							};
						}
						return sandbox;
					}));
					break;
				}

				case 'componentError': {
					// Build failed - update sandbox with error
					const { componentId, error } = msg.payload;
					pendingBuildsRef.current.delete(componentId);

					console.error('[CanvasView] ❌ componentError received:', {
						componentId,
						error
					});

					setSandboxes(prev => prev.map(sandbox => {
						if (sandbox.id === componentId) {
							return {
								...sandbox,
								buildStatus: 'error',
								buildError: error,
								bundledCode: undefined
							};
						}
						return sandbox;
					}));
					break;
				}

				case 'canvasLoaded': {
					// Restore canvas state
					const { state } = msg.payload;
					setSandboxes(state.sandboxes);
					setSelectedSandboxId(state.selectedSandboxId);
					setTransform(state.viewport);
					break;
				}

				case 'themeChanged': {
					// Handle theme change if needed
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

	/**
	 * Request component build from Extension (via Core pipeline)
	 */
	const requestBuild = useCallback((componentId: string, input: ComponentInput) => {
		pendingBuildsRef.current.add(componentId);

		console.log('[CanvasView] 📤 Sending buildComponent request:', {
			componentId,
			inputId: input.id,
			files: Object.keys(input.files),
			framework: input.framework,
			dependencies: input.dependencies
		});

		const message: WebviewMessage = {
			type: 'buildComponent',
			payload: { componentId, input }
		};
		vscode.postMessage(message);
	}, []);

	/**
	 * Create a new sandbox with ComponentInput
	 * Starts in 'building' state and requests build from Extension
	 */
	const createSandbox = useCallback((input: ComponentInput): Sandbox => {
		const config = gridManager.getConfig();
		const position = gridManager.getNextAvailableSlot(sandboxes);

		// Generate unique ID
		const timestamp = Date.now();
		const uniqueId = `${input.id}-${timestamp}`;

		// Update input with unique ID
		const uniqueInput: ComponentInput = { ...input, id: uniqueId };

		const sandbox: Sandbox = {
			id: uniqueId,
			x: position.x,
			y: position.y,
			width: config.sandboxWidth,
			height: config.sandboxHeight,
			zIndex: sandboxes.length + 1,
			buildStatus: 'building',
			componentInput: uniqueInput
		};

		// Request build from Extension
		requestBuild(uniqueId, uniqueInput);

		return sandbox;
	}, [sandboxes, requestBuild]);

	/**
	 * Auto-fit viewport to show all sandboxes
	 */
	const fitAllSandboxes = useCallback((sandboxList: Sandbox[]) => {
		if (sandboxList.length === 0) return;

		setTimeout(() => {
			const viewport = gridManager.calculateFitViewport(
				sandboxList,
				window.innerWidth,
				window.innerHeight,
				100
			);
			setTransform(viewport);
		}, 100);
	}, []);

	// Add component handler
	const handleAddComponent = useCallback(() => {
		const uniqueInput = {
			...DEFAULT_COMPONENT_INPUT,
			id: `component-${Date.now()}`
		};
		const newSandbox = createSandbox(uniqueInput);
		setSandboxes(prev => {
			const updated = [...prev, newSandbox];
			fitAllSandboxes(updated);
			return updated;
		});
		setSelectedSandboxId(newSandbox.id);
	}, [createSandbox, fitAllSandboxes]);

	// Load a specific sample component
	const handleLoadSample = useCallback((sample: SampleComponent) => {
		// Check if already loaded (by original sample ID prefix)
		const existingSandbox = sandboxes.find(s =>
			s.componentInput?.id.startsWith(sample.id + '-') ||
			s.id.startsWith(sample.id + '-')
		);

		if (existingSandbox) {
			// Select existing instead of creating duplicate
			setSelectedSandboxId(existingSandbox.id);
			setSandboxes(prev => {
				const maxZ = Math.max(...prev.map(s => s.zIndex));
				return prev.map(s => s.id === existingSandbox.id ? { ...s, zIndex: maxZ + 1 } : s);
			});
			return;
		}

		const newSandbox = createSandbox(sample.input);
		setSandboxes(prev => {
			const updated = [...prev, newSandbox];
			fitAllSandboxes(updated);
			return updated;
		});
		setSelectedSandboxId(newSandbox.id);
	}, [sandboxes, createSandbox, fitAllSandboxes]);

	// Load all sample components
	const handleLoadAll = useCallback(() => {
		const newSandboxes: Sandbox[] = [];

		SAMPLE_COMPONENTS.forEach(sample => {
			// Skip if already loaded
			const alreadyLoaded = sandboxes.some(s =>
				s.componentInput?.id.startsWith(sample.id + '-') ||
				s.id.startsWith(sample.id + '-')
			);
			if (alreadyLoaded) return;

			const config = gridManager.getConfig();
			const existingCount = sandboxes.length + newSandboxes.length;
			const position = gridManager.getNextAvailableSlot([...sandboxes, ...newSandboxes]);

			const timestamp = Date.now();
			const uniqueId = `${sample.id}-${timestamp}-${newSandboxes.length}`;
			const uniqueInput: ComponentInput = { ...sample.input, id: uniqueId };

			const sandbox: Sandbox = {
				id: uniqueId,
				x: position.x,
				y: position.y,
				width: config.sandboxWidth,
				height: config.sandboxHeight,
				zIndex: existingCount + 1,
				buildStatus: 'building',
				componentInput: uniqueInput
			};

			// Request build
			requestBuild(uniqueId, uniqueInput);
			newSandboxes.push(sandbox);
		});

		if (newSandboxes.length > 0) {
			setSandboxes(prev => {
				const updated = [...prev, ...newSandboxes];
				fitAllSandboxes(updated);
				return updated;
			});
		}
	}, [sandboxes, requestBuild, fitAllSandboxes]);

	// Clear all sandboxes
	const handleClearAll = useCallback(() => {
		if (sandboxes.length === 0) return;
		setSandboxes([]);
		setSelectedSandboxId(null);
		setFocusedSandboxId(null);
		setTransform({ x: 0, y: 0, scale: 1 });
		pendingBuildsRef.current.clear();
	}, [sandboxes]);

	// Sandbox handlers
	const handleSandboxClick = useCallback((id: string) => {
		setSelectedSandboxId(id);
		setSandboxes(prev => {
			const maxZ = Math.max(...prev.map(s => s.zIndex));
			return prev.map(s => s.id === id ? { ...s, zIndex: maxZ + 1 } : s);
		});
	}, []);

	const handleSandboxDoubleClick = useCallback((id: string) => {
		const isExitingFocus = focusedSandboxId === id;

		if (isExitingFocus) {
			setFocusedSandboxId(null);
			const viewport = gridManager.calculateResetViewport(
				sandboxes,
				window.innerWidth,
				window.innerHeight
			);
			setTransform(viewport);
		} else {
			setFocusedSandboxId(id);
			const sandbox = sandboxes.find(s => s.id === id);
			if (sandbox) {
				const viewport = gridManager.calculateFocusViewport(
					sandbox,
					window.innerWidth,
					window.innerHeight
				);
				setTransform(viewport);
			}
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
		setExitingSandboxIds(prev => new Set(prev).add(id));

		if (selectedSandboxId === id) setSelectedSandboxId(null);
		if (focusedSandboxId === id) setFocusedSandboxId(null);
		pendingBuildsRef.current.delete(id);

		setTimeout(() => {
			setSandboxes(prev => {
				const remaining = prev.filter(s => s.id !== id);
				if (remaining.length > 0) {
					fitAllSandboxes(remaining);
				}
				return remaining;
			});
			setExitingSandboxIds(prev => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		}, 300);
	}, [selectedSandboxId, focusedSandboxId, fitAllSandboxes]);

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
		if (sandboxes.length > 0) {
			fitAllSandboxes(sandboxes);
		} else {
			setTransform({ x: 0, y: 0, scale: 1 });
		}
	}, [sandboxes, fitAllSandboxes]);

	// Tidy Up
	const handleTidyUp = useCallback(() => {
		if (sandboxes.length === 0) return;

		const newPositions = gridManager.tidyUp(sandboxes);
		const updatedSandboxes = sandboxes.map(sandbox => {
			const newPos = newPositions.get(sandbox.id);
			if (newPos) {
				return { ...sandbox, x: newPos.x, y: newPos.y };
			}
			return sandbox;
		});

		setSandboxes(updatedSandboxes);
		fitAllSandboxes(updatedSandboxes);
		setSelectedSandboxId(null);
		setFocusedSandboxId(null);
	}, [sandboxes, fitAllSandboxes]);

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
			if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSandboxId) {
				handleSandboxDelete(selectedSandboxId);
			}
			if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				handleResetView();
			}
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
				onLoadSample={handleLoadSample}
				onLoadAll={handleLoadAll}
				onClearAll={handleClearAll}
				onTidyUp={handleTidyUp}
				sandboxCount={sandboxes.length}
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
					exitingSandboxIds={exitingSandboxIds}
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
