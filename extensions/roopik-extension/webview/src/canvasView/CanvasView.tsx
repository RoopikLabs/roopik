/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { InfiniteCanvas, FloatingToolbar, StatusPanel } from './components';
import { DeviceSelector, GlobalDeviceToggle } from './components/DeviceToggle';
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
	ComponentInput,
	CanvasState,
	DevicePreset
} from './types';
import { DEVICE_PRESETS, calculateDeviceScale } from './types';

// Get VSCode API (only call once!)
const vscode: VSCodeAPI = acquireVsCodeApi();

/** Debounce delay for auto-save (ms) */
const AUTO_SAVE_DELAY = 1000;

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

	// Fullscreen mode state
	const [fullscreenSandboxId, setFullscreenSandboxId] = useState<string | null>(null);

	// Device emulation state
	const [deviceMode, setDeviceMode] = useState<DevicePreset>('auto');
	const fullscreenContainerRef = useRef<HTMLDivElement>(null);
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

	// Canvas metadata (set when state is loaded from extension)
	const canvasIdRef = useRef<string>('');
	const canvasNameRef = useRef<string>('');
	const canvasCreatedAtRef = useRef<number>(Date.now());

	// Track pending builds to handle responses
	const pendingBuildsRef = useRef<Set<string>>(new Set());

	// Auto-save timer ref
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	/**
	 * Save canvas state to extension (debounced)
	 */
	const saveCanvasState = useCallback(() => {
		// Clear existing timer
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}

		// Debounce the save
		saveTimerRef.current = setTimeout(() => {
			const state: CanvasState = {
				id: canvasIdRef.current,
				name: canvasNameRef.current,
				sandboxes,
				selectedSandboxId,
				viewport: transform,
				createdAt: canvasCreatedAtRef.current,
				updatedAt: Date.now()
			};

			console.log('[CanvasView] 💾 Saving canvas state:', {
				id: state.id,
				name: state.name,
				sandboxCount: state.sandboxes.length
			});

			const message: WebviewMessage = {
				type: 'saveCanvas',
				payload: {
					canvasId: state.id,
					state
				}
			};
			vscode.postMessage(message);
		}, AUTO_SAVE_DELAY);
	}, [sandboxes, selectedSandboxId, transform]);

	// Auto-save when state changes (after initial load)
	useEffect(() => {
		// Only save if we have a canvas ID (meaning state was loaded)
		if (canvasIdRef.current) {
			saveCanvasState();
		}
	}, [sandboxes, selectedSandboxId, transform, saveCanvasState]);

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
					console.log('[CanvasView] 📂 Canvas loaded:', {
						id: state.id,
						name: state.name,
						sandboxCount: state.sandboxes.length
					});

					// Store canvas metadata
					canvasIdRef.current = state.id;
					canvasNameRef.current = state.name;
					canvasCreatedAtRef.current = state.createdAt;

					// Restore UI state
					setSandboxes(state.sandboxes);
					setSelectedSandboxId(state.selectedSandboxId);
					setTransform(state.viewport);
					break;
				}

				case 'themeChanged': {
					// Handle theme change if needed
					break;
				}

				case 'addImportedComponent': {
					// Handle imported component from extension
					const { componentInput, position, replaceExisting, replaceName } = msg.payload;
					console.log('[CanvasView] 📥 addImportedComponent received:', {
						id: componentInput.id,
						framework: componentInput.framework,
						files: Object.keys(componentInput.files),
						position,
						replaceExisting,
						replaceName
					});

					// If replacing, find and remove the existing sandbox first
					let existingPosition: { x: number; y: number } | undefined;
					if (replaceExisting && replaceName) {
						// Find sandbox with matching component name (import-{name}-timestamp pattern)
						const existingSandbox = sandboxes.find(s =>
							s.componentInput?.id.includes(`import-${replaceName}-`)
						);
						if (existingSandbox) {
							// Keep its position for the new one
							existingPosition = { x: existingSandbox.x, y: existingSandbox.y };
							// Remove it
							setSandboxes(prev => prev.filter(s => s.id !== existingSandbox.id));
							pendingBuildsRef.current.delete(existingSandbox.id);
							console.log('[CanvasView] 🔄 Replacing existing sandbox:', existingSandbox.id);
						}
					}

					// Create sandbox at specified position, existing position, or next available slot
					const config = gridManager.getConfig();
					const sandboxPosition = position || existingPosition || gridManager.getNextAvailableSlot(sandboxes);

					const timestamp = Date.now();
					const uniqueId = `${componentInput.id}-${timestamp}`;
					const uniqueInput: ComponentInput = { ...componentInput, id: uniqueId };

					const sandbox: Sandbox = {
						id: uniqueId,
						x: sandboxPosition.x,
						y: sandboxPosition.y,
						width: config.sandboxWidth,
						height: config.sandboxHeight,
						zIndex: sandboxes.length + 1,
						buildStatus: 'building',
						componentInput: uniqueInput
					};

					// Request build from Extension
					pendingBuildsRef.current.add(uniqueId);
					const buildMessage: WebviewMessage = {
						type: 'buildComponent',
						payload: { componentId: uniqueId, input: uniqueInput }
					};
					vscode.postMessage(buildMessage);

					// Add sandbox to canvas
					setSandboxes(prev => {
						const updated = [...prev, sandbox];
						// Fit viewport to show new component (skip if replacing - position stays same)
						if (!replaceExisting) {
							setTimeout(() => {
								const viewport = gridManager.calculateFitViewport(
									updated,
									window.innerWidth,
									window.innerHeight,
									100
								);
								setTransform(viewport);
							}, 100);
						}
						return updated;
					});
					setSelectedSandboxId(uniqueId);
					break;
				}
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [sandboxes]);

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

	// Fullscreen mode handlers
	const handleSandboxExpand = useCallback((id: string) => {
		setFullscreenSandboxId(id);
	}, []);

	const handleExitFullscreen = useCallback(() => {
		setFullscreenSandboxId(null);
	}, []);

	// Device mode change handler
	const handleDeviceModeChange = useCallback((mode: DevicePreset) => {
		setDeviceMode(mode);
	}, []);

	// Track container size for device frame scaling
	useEffect(() => {
		if (!fullscreenSandboxId || !fullscreenContainerRef.current) return;

		const container = fullscreenContainerRef.current;
		const updateSize = () => {
			setContainerSize({
				width: container.clientWidth,
				height: container.clientHeight
			});
		};

		// Initial size
		updateSize();

		// Watch for resize
		const resizeObserver = new ResizeObserver(updateSize);
		resizeObserver.observe(container);

		return () => resizeObserver.disconnect();
	}, [fullscreenSandboxId]);

	// Calculate device frame dimensions and scale
	const deviceFrameStyle = useMemo(() => {
		const preset = DEVICE_PRESETS[deviceMode];

		// Auto mode - fill container
		if (preset.width === 'auto' || preset.height === 'auto') {
			return {
				width: '100%',
				height: '100%',
				transform: 'none'
			};
		}

		// Fixed device dimensions with scaling
		const deviceWidth = preset.width as number;
		const deviceHeight = preset.height as number;
		const padding = 60; // Padding around device frame

		const scale = calculateDeviceScale(
			deviceWidth,
			deviceHeight,
			containerSize.width,
			containerSize.height,
			padding
		);

		return {
			width: `${deviceWidth}px`,
			height: `${deviceHeight}px`,
			transform: scale < 1 ? `scale(${scale})` : 'none'
		};
	}, [deviceMode, containerSize]);

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
				// Exit fullscreen first, then deselect
				if (fullscreenSandboxId) {
					handleExitFullscreen();
				} else {
					setSelectedSandboxId(null);
					setFocusedSandboxId(null);
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [selectedSandboxId, handleSandboxDelete, handleResetView, fullscreenSandboxId, handleExitFullscreen]);

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
					globalDeviceMode={deviceMode}
					onTransformChange={handleTransformChange}
					onSandboxClick={handleSandboxClick}
					onSandboxDoubleClick={handleSandboxDoubleClick}
					onSandboxUpdate={handleSandboxUpdate}
					onSandboxDelete={handleSandboxDelete}
					onCanvasClick={handleCanvasClick}
					onSandboxExpand={handleSandboxExpand}
				/>

				{/* Global Device Mode Toggle - floating top-right */}
				<GlobalDeviceToggle
					deviceMode={deviceMode}
					onDeviceModeChange={handleDeviceModeChange}
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

			{/* Fullscreen Overlay with Device Emulation */}
			{fullscreenSandboxId && (() => {
				const sandbox = sandboxes.find(s => s.id === fullscreenSandboxId);
				if (!sandbox) return null;

				const preset = DEVICE_PRESETS[deviceMode];
				const isAutoMode = preset.width === 'auto';

				return (
					<div className="fullscreen-overlay">
						<div className="fullscreen-header">
							<span className="fullscreen-title">
								{sandbox.componentInput?.id.split('-')[1] || 'Component'}
							</span>
							<div className="fullscreen-header-controls">
								<DeviceSelector
									deviceMode={deviceMode}
									onDeviceModeChange={handleDeviceModeChange}
								/>
								<button
									className="fullscreen-close"
									onClick={handleExitFullscreen}
									title="Exit fullscreen (ESC)"
								>
									<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<path d="M18 6L6 18M6 6l12 12" />
									</svg>
								</button>
							</div>
						</div>
						<div
							ref={fullscreenContainerRef}
							className="fullscreen-device-container"
						>
							<div
								className={`fullscreen-device-frame ${isAutoMode ? 'fullscreen-device-frame--auto' : ''}`}
								style={deviceFrameStyle}
							>
								<iframe
									srcDoc={sandbox.bundledCode ? generateFullscreenHTML(sandbox.bundledCode) : ''}
									sandbox="allow-scripts allow-same-origin"
									title="Fullscreen Preview"
								/>
							</div>
							{/* Device info badge */}
							{!isAutoMode && (
								<div className="fullscreen-device-info">
									<span className="fullscreen-device-info__label">{preset.label}</span>
									<span className="fullscreen-device-info__dimensions">
										{preset.width} × {preset.height}
									</span>
								</div>
							)}
						</div>
					</div>
				);
			})()}
		</>
	);
}

/**
 * Generate HTML for fullscreen iframe
 */
function generateFullscreenHTML(bundledCode: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Fullscreen Preview</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: #ffffff;
			overflow: auto;
		}
		#root {
			min-height: 100vh;
		}
	</style>
</head>
<body>
	<div id="root"></div>
	<script type="module">
${bundledCode}
	</script>
</body>
</html>`;
}
