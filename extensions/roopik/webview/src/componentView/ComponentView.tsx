/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
	Sandbox,
	Transform,
	BackgroundPattern,
	DevicePreset,
	ComponentInput,
	ExtensionMessage,
	WebviewMessage
} from '../canvasView/types';
import { InfiniteCanvas } from '../canvasView/components/InfiniteCanvas';
import { StatusPanel } from '../canvasView/components/StatusPanel';
import { GlobalDeviceToggle } from '../canvasView/components/DeviceToggle';
import { FloatingToolbar } from '../canvasView/components/Toolbar';
import { FullscreenOverlay } from '../canvasView/components/FullscreenOverlay';
import { BottomActionBar } from '../canvasView/components/Toolbar/BottomActionBar';
import { SAMPLE_COMPONENTS, type SampleComponent } from '../canvasView/data/sampleComponents';
import {
	getGridPosition,
	reorganizeSandboxes,
	calculateFitAllTransform,
	calculateFocusTransform,
	DEFAULT_CONFIG
} from '../canvasView/services/gridManager';
import { useFPS } from '../hooks/useFPS';
import './ComponentView.css';

// VS Code API
declare const acquireVsCodeApi: () => { postMessage: (msg: WebviewMessage) => void };
const vscode = acquireVsCodeApi();

// Canvas state from extension (injected via window)
declare global {
	interface Window {
		CANVAS_STATE?: {
			sandboxes?: Sandbox[];
			viewport?: Transform;
			backgroundColor?: string;
			backgroundPattern?: BackgroundPattern;
		};
	}
}

function App() {
	// Canvas state
	const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
	const [pattern, setPattern] = useState<BackgroundPattern>('dots');
	const [backgroundColor, setBackgroundColor] = useState<string>('#1a1a1a');
	const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
	const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(null);
	const [focusedSandboxId, setFocusedSandboxId] = useState<string | null>(null);

	// Device mode state
	const [globalDeviceMode, setGlobalDeviceMode] = useState<DevicePreset>('auto');

	// Fullscreen mode state
	const [fullscreenSandboxId, setFullscreenSandboxId] = useState<string | null>(null);

	// Bottom Action Bar state
	const [isSelectMode, setIsSelectMode] = useState(false);
	const [isInspectMode, setIsInspectMode] = useState(false);
	const [isRectangleMode, setIsRectangleMode] = useState(false);

	// FPS counter
	const fps = useFPS();

	// Track pending builds
	const pendingBuildsRef = useRef<Set<string>>(new Set());

	// Load initial state from extension on mount
	useEffect(() => {
		try {
			const initialState = window.CANVAS_STATE;

			if (initialState) {
				console.log('[Canvas] Loading initial state from extension:', initialState);

				if (initialState.sandboxes && initialState.sandboxes.length > 0) {
					console.log('[Canvas] Restoring', initialState.sandboxes.length, 'sandboxes');
					setSandboxes(initialState.sandboxes);
				}

				if (initialState.viewport) {
					console.log('[Canvas] Restoring viewport:', initialState.viewport);
					setTransform(initialState.viewport);
				}

				// Restore background preferences
				if (initialState.backgroundColor && /^#[0-9A-Fa-f]{6}$/.test(initialState.backgroundColor)) {
					console.log('[Canvas] Restoring background color:', initialState.backgroundColor);
					setBackgroundColor(initialState.backgroundColor);
				}

				if (initialState.backgroundPattern) {
					const validPatterns: BackgroundPattern[] = ['grid', 'dots', 'plain'];
					if (validPatterns.includes(initialState.backgroundPattern)) {
						console.log('[Canvas] Restoring background pattern:', initialState.backgroundPattern);
						setPattern(initialState.backgroundPattern);
					}
				}
			} else {
				console.log('[Canvas] No initial state found, starting with empty canvas');
			}
		} catch (error) {
			console.error('[Canvas] Failed to load initial state:', error);
		}
	}, []);

	// Handle messages from Extension (Core pipeline responses)
	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const msg = event.data;
			console.log('[Canvas] Received message from extension:', msg.type);

			switch (msg.type) {
				case 'componentCreated': {
					// Component created - create sandbox with 'building' status (loading spinner)
					const { componentId, canvasId } = msg.payload;
					console.log('[Canvas] 🆕 componentCreated received:', { componentId, canvasId });

					// Check if sandbox already exists (e.g., from addImportedComponent)
					const existingSandbox = sandboxes.find(s => s.id === componentId);
					if (existingSandbox) {
						console.log('[Canvas] Sandbox already exists, updating to building status');
						setSandboxes(prev => prev.map(sandbox => {
							if (sandbox.id === componentId) {
								return { ...sandbox, buildStatus: 'building' as const };
							}
							return sandbox;
						}));
					} else {
						// Create new sandbox with building status
						console.log('[Canvas] Creating new sandbox with building status');
						const position = getGridPosition(sandboxes.length, DEFAULT_CONFIG);
						const newSandbox: Sandbox = {
							id: componentId,
							x: position.x,
							y: position.y,
							width: DEFAULT_CONFIG.sandboxWidth,
							height: DEFAULT_CONFIG.sandboxHeight,
							zIndex: sandboxes.length + 1,
							buildStatus: 'building',
							componentInput: {
								id: componentId,
								source: 'import',
								files: {}
							}
						};
						setSandboxes(prev => [...prev, newSandbox]);
					}
					break;
				}

				case 'componentBuilt': {
					// Component built successfully - update sandbox
					const { componentId, result } = msg.payload;
					pendingBuildsRef.current.delete(componentId);

					console.log('[Canvas] ✅ componentBuilt received:', {
						componentId,
						framework: result.framework,
						bundledCodeLength: result.bundledCode?.length || 0,
						cdnUrls: result.cdnUrls
					});

					setSandboxes(prev => prev.map(sandbox => {
						if (sandbox.id === componentId) {
							return {
								...sandbox,
								buildStatus: 'ready' as const,
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

					console.error('[Canvas] ❌ componentError received:', {
						componentId,
						error
					});

					setSandboxes(prev => prev.map(sandbox => {
						if (sandbox.id === componentId) {
							return {
								...sandbox,
								buildStatus: 'error' as const,
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
					console.log('[Canvas] 📂 Canvas loaded:', {
						id: state.id,
						name: state.name,
						sandboxCount: state.sandboxes.length,
						backgroundColor: state.backgroundColor,
						backgroundPattern: state.backgroundPattern
					});

					setSandboxes(state.sandboxes);
					setSelectedSandboxId(state.selectedSandboxId);
					setTransform(state.viewport);
					// Restore background preferences
					if (state.backgroundColor) {
						setBackgroundColor(state.backgroundColor);
					}
					if (state.backgroundPattern) {
						setPattern(state.backgroundPattern);
					}
					break;
				}

				case 'themeChanged': {
					// Handle theme change if needed
					break;
				}

				case 'addImportedComponent': {
					// Import component from file
					const { componentInput, position } = msg.payload;
					console.log('[Canvas] 📥 Importing component:', {
						id: componentInput.id,
						framework: componentInput.framework,
						files: Object.keys(componentInput.files)
					});

					// Create a new sandbox for the imported component
					const newSandbox: Sandbox = {
						id: componentInput.id,
						x: position?.x ?? 100,
						y: position?.y ?? 100,
						width: DEFAULT_CONFIG.sandboxWidth,
						height: DEFAULT_CONFIG.sandboxHeight,
						zIndex: Date.now(),
						buildStatus: 'pending',
						componentInput
					};

					setSandboxes(prev => {
						// Calculate position if not provided
						if (!position) {
							const gridPos = getGridPosition(prev.length, DEFAULT_CONFIG);
							newSandbox.x = gridPos.x;
							newSandbox.y = gridPos.y;
						}
						return [...prev, newSandbox];
					});
					setSelectedSandboxId(newSandbox.id);

					// Request build for the imported component
					vscode.postMessage({
						type: 'buildComponent',
						payload: {
							componentId: newSandbox.id,
							input: componentInput
						}
					});
					break;
				}

				case 'canvasPreferencesLoaded': {
					// Preferences loaded from file by extension
					const { preferences } = msg.payload;
					console.log('[Canvas] 🎨 Preferences loaded from file:', preferences);

					if (preferences.backgroundColor) {
						setBackgroundColor(preferences.backgroundColor);
					}
					if (preferences.backgroundPattern) {
						setPattern(preferences.backgroundPattern);
					}
					if (preferences.viewport) {
						setTransform(preferences.viewport);
					}
					break;
				}
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	// Notify extension that webview is ready
	useEffect(() => {
		vscode.postMessage({ type: 'ready' });
	}, []);

	// Auto-save canvas state when sandboxes or viewport changes
	useEffect(() => {
		if (sandboxes.length === 0 && transform.x === 0 && transform.y === 0 && transform.scale === 1) {
			return;
		}

		const saveTimeout = setTimeout(() => {
			console.log('[Canvas] Auto-saving canvas state');
			vscode.postMessage({
				type: 'saveCanvas',
				payload: {
					canvasId: 'default',
					state: {
						id: 'default',
						name: 'Canvas',
						sandboxes,
						selectedSandboxId,
						viewport: transform,
						backgroundColor,
						backgroundPattern: pattern,
						createdAt: Date.now(),
						updatedAt: Date.now()
					}
				}
			});
		}, 500);

		return () => clearTimeout(saveTimeout);
	}, [sandboxes, transform, selectedSandboxId, backgroundColor, pattern]);

	/**
	 * Request component build from Extension (via Core pipeline)
	 */
	const requestBuild = useCallback((componentId: string, input: ComponentInput) => {
		pendingBuildsRef.current.add(componentId);

		console.log('[Canvas] 📤 Sending buildComponent request:', {
			componentId,
			inputId: input.id,
			files: Object.keys(input.files),
			framework: input.framework
		});

		vscode.postMessage({
			type: 'buildComponent',
			payload: { componentId, input }
		});
	}, []);

	/**
	 * Create a new sandbox with ComponentInput
	 * Starts in 'building' state and requests build from Extension
	 */
	const createSandbox = useCallback((input: ComponentInput): Sandbox => {
		const position = getGridPosition(sandboxes.length, DEFAULT_CONFIG);
		const timestamp = Date.now();
		const uniqueId = `${input.id}-${timestamp}`;

		const uniqueInput: ComponentInput = { ...input, id: uniqueId };

		const sandbox: Sandbox = {
			id: uniqueId,
			x: position.x,
			y: position.y,
			width: DEFAULT_CONFIG.sandboxWidth,
			height: DEFAULT_CONFIG.sandboxHeight,
			zIndex: sandboxes.length + 1,
			buildStatus: 'building',
			componentInput: uniqueInput
		};

		// Request build from Extension
		requestBuild(uniqueId, uniqueInput);

		return sandbox;
	}, [sandboxes.length, requestBuild]);

	// Auto-zoom to fit all sandboxes
	const fitAllSandboxes = useCallback((sandboxList: Sandbox[]) => {
		if (sandboxList.length === 0) return;

		const viewport = { width: window.innerWidth, height: window.innerHeight - 100 };
		const newTransform = calculateFitAllTransform(sandboxList, viewport, DEFAULT_CONFIG);
		if (newTransform) {
			setTransform(newTransform);
		}
	}, []);

	// Focus on a single sandbox (double-click)
	const focusSandbox = useCallback((sandboxId: string) => {
		if (focusedSandboxId === sandboxId) {
			// Unfocus - zoom out to see all
			setFocusedSandboxId(null);
			fitAllSandboxes(sandboxes);
			return;
		}

		const sandbox = sandboxes.find(s => s.id === sandboxId);
		if (!sandbox) return;

		console.log('[Canvas] Focusing on sandbox:', sandboxId);
		setFocusedSandboxId(sandboxId);

		const viewport = { width: window.innerWidth, height: window.innerHeight };
		const newTransform = calculateFocusTransform(sandbox, viewport, DEFAULT_CONFIG);
		setTransform(newTransform);
	}, [focusedSandboxId, sandboxes, fitAllSandboxes]);

	// Reorganize all sandboxes to grid
	const reorganizeToGrid = useCallback((sandboxList?: Sandbox[]) => {
		const current = sandboxList || sandboxes;
		const reorganized = reorganizeSandboxes(current, DEFAULT_CONFIG);
		setSandboxes(reorganized);

		setTimeout(() => {
			fitAllSandboxes(reorganized);
		}, 100);
	}, [sandboxes, fitAllSandboxes]);

	// Zoom controls
	const handleZoomIn = useCallback(() => {
		setTransform(prev => ({ ...prev, scale: Math.min(10, prev.scale * 1.2) }));
	}, []);

	const handleZoomOut = useCallback(() => {
		setTransform(prev => ({ ...prev, scale: Math.max(0.1, prev.scale / 1.2) }));
	}, []);

	const handleResetView = useCallback(() => {
		if (sandboxes.length === 0) {
			setTransform({ x: 0, y: 0, scale: 1 });
		} else {
			reorganizeToGrid();
		}
	}, [sandboxes.length, reorganizeToGrid]);

	// Pattern toggle
	const handleTogglePattern = useCallback(() => {
		const patterns: BackgroundPattern[] = ['grid', 'dots', 'plain'];
		setPattern(prev => {
			const currentIndex = patterns.indexOf(prev);
			const nextIndex = (currentIndex + 1) % patterns.length;
			return patterns[nextIndex];
		});
	}, []);

	// Background color change
	const handleBackgroundColorChange = useCallback((color: string) => {
		setBackgroundColor(color);
	}, []);

	// Sandbox click handler
	const handleSandboxClick = useCallback((sandboxId: string) => {
		setSelectedSandboxId(sandboxId);
		console.log('[Canvas] Sandbox selected:', sandboxId);

		// Bring clicked sandbox to front
		setSandboxes(prev => {
			const maxZIndex = Math.max(...prev.map(s => s.zIndex));
			return prev.map(s =>
				s.id === sandboxId
					? { ...s, zIndex: maxZIndex + 1 }
					: s
			);
		});
	}, []);

	// Sandbox delete handler
	const handleSandboxDelete = useCallback((sandboxId: string) => {
		console.log('[Canvas] Deleting sandbox:', sandboxId);
		pendingBuildsRef.current.delete(sandboxId);

		if (selectedSandboxId === sandboxId) setSelectedSandboxId(null);
		if (focusedSandboxId === sandboxId) setFocusedSandboxId(null);

		setSandboxes(prev => {
			const remaining = prev.filter(s => s.id !== sandboxId);
			if (remaining.length > 0) {
				setTimeout(() => {
					reorganizeToGrid(remaining);
				}, 50);
			}
			return remaining;
		});
	}, [selectedSandboxId, focusedSandboxId, reorganizeToGrid]);

	// Sandbox expand (fullscreen) handler
	const handleSandboxExpand = useCallback((sandboxId: string) => {
		console.log('[Canvas] Expand sandbox to fullscreen:', sandboxId);
		setFullscreenSandboxId(sandboxId);
	}, []);

	// Exit fullscreen handler
	const handleExitFullscreen = useCallback(() => {
		setFullscreenSandboxId(null);
	}, []);

	// Sandbox update handler
	const handleSandboxUpdate = useCallback((id: string, updates: Partial<Sandbox>) => {
		setSandboxes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
	}, []);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSandboxId) {
				handleSandboxDelete(selectedSandboxId);
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
			if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				handleResetView();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [selectedSandboxId, handleSandboxDelete, handleResetView, fullscreenSandboxId, handleExitFullscreen]);

	// Window resize handler
	useEffect(() => {
		const handleResize = () => {
			if (focusedSandboxId) {
				setTimeout(() => {
					focusSandbox(focusedSandboxId);
				}, 100);
			}
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, [focusedSandboxId, focusSandbox]);

	// FloatingToolbar handlers
	const handleLoadSample = useCallback((sample: SampleComponent) => {
		console.log('[FloatingToolbar] Loading sample:', sample.name);

		// Check if already loaded
		const existingSandbox = sandboxes.find(s =>
			s.componentInput?.id.startsWith(sample.id + '-') ||
			s.id.startsWith(sample.id + '-')
		);

		if (existingSandbox) {
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
			setTimeout(() => fitAllSandboxes(updated), 100);
			return updated;
		});
		setSelectedSandboxId(newSandbox.id);
	}, [sandboxes, createSandbox, fitAllSandboxes]);

	const handleLoadAll = useCallback(() => {
		console.log('[FloatingToolbar] Loading all samples');
		const newSandboxes: Sandbox[] = [];

		SAMPLE_COMPONENTS.forEach((sample, idx) => {
			const alreadyLoaded = sandboxes.some(s =>
				s.componentInput?.id.startsWith(sample.id + '-') ||
				s.id.startsWith(sample.id + '-')
			);
			if (alreadyLoaded) return;

			const position = getGridPosition(sandboxes.length + newSandboxes.length, DEFAULT_CONFIG);
			const timestamp = Date.now();
			const uniqueId = `${sample.id}-${timestamp}-${idx}`;
			const uniqueInput: ComponentInput = { ...sample.input, id: uniqueId };

			const sandbox: Sandbox = {
				id: uniqueId,
				x: position.x,
				y: position.y,
				width: DEFAULT_CONFIG.sandboxWidth,
				height: DEFAULT_CONFIG.sandboxHeight,
				zIndex: sandboxes.length + newSandboxes.length + 1,
				buildStatus: 'building',
				componentInput: uniqueInput
			};

			requestBuild(uniqueId, uniqueInput);
			newSandboxes.push(sandbox);
		});

		if (newSandboxes.length > 0) {
			setSandboxes(prev => {
				const updated = [...prev, ...newSandboxes];
				setTimeout(() => fitAllSandboxes(updated), 100);
				return updated;
			});
		}
	}, [sandboxes, requestBuild, fitAllSandboxes]);

	const handleClearAll = useCallback(() => {
		console.log('[FloatingToolbar] Clearing all sandboxes');
		setSandboxes([]);
		setSelectedSandboxId(null);
		setFocusedSandboxId(null);
		pendingBuildsRef.current.clear();
		setTransform({ x: 0, y: 0, scale: 1 });
	}, []);

	const handleTidyUp = useCallback(() => {
		console.log('[FloatingToolbar] Tidy up - reorganizing to grid');
		reorganizeToGrid();
	}, [reorganizeToGrid]);

	// Bottom Action Bar handlers - Mutually exclusive modes
	const handleSelectMode = useCallback(() => {
		const newState = !isSelectMode;
		setIsSelectMode(newState);
		if (newState) {
			setIsInspectMode(false);
			setIsRectangleMode(false);
		}
		console.log('[BottomActionBar] Select mode:', newState);
	}, [isSelectMode]);

	const handleInspectMode = useCallback(() => {
		const newState = !isInspectMode;
		setIsInspectMode(newState);
		if (newState) {
			setIsSelectMode(false);
			setIsRectangleMode(false);
		}
		console.log('[BottomActionBar] Inspect mode:', newState);
	}, [isInspectMode]);

	const handleRectangleSelection = useCallback(() => {
		const newState = !isRectangleMode;
		setIsRectangleMode(newState);
		if (newState) {
			setIsSelectMode(false);
			setIsInspectMode(false);
		}
		console.log('[BottomActionBar] Rectangle mode:', newState);
	}, [isRectangleMode]);

	const handleAIChat = useCallback(() => {
		console.log('[BottomActionBar] AI Chat toggled');
	}, []);

	return (
		<div className="app">
			<FloatingToolbar
				tabName="Canvas"
				onLoadSample={handleLoadSample}
				onLoadAll={handleLoadAll}
				onClearAll={handleClearAll}
				onTidyUp={handleTidyUp}
				sandboxCount={sandboxes.length}
			/>

			<div className="canvas-container">
				<InfiniteCanvas
					sandboxes={sandboxes}
					selectedSandboxId={selectedSandboxId}
					focusedSandboxId={focusedSandboxId}
					transform={transform}
					pattern={pattern}
					backgroundColor={backgroundColor}
					globalDeviceMode={globalDeviceMode}
					onTransformChange={setTransform}
					onSandboxClick={handleSandboxClick}
					onSandboxDoubleClick={focusSandbox}
					onSandboxUpdate={handleSandboxUpdate}
					onSandboxDelete={handleSandboxDelete}
					onSandboxExpand={handleSandboxExpand}
					onCanvasBackgroundClick={() => setSelectedSandboxId(null)}
				/>

				<GlobalDeviceToggle
					deviceMode={globalDeviceMode}
					onDeviceModeChange={setGlobalDeviceMode}
				/>
			</div>

			<StatusPanel
				transform={transform}
				fps={fps}
				sandboxCount={sandboxes.length}
				pattern={pattern}
				backgroundColor={backgroundColor}
				selectedSandboxId={selectedSandboxId}
				focusedSandboxId={focusedSandboxId}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onResetView={handleResetView}
				onTogglePattern={handleTogglePattern}
				onBackgroundColorChange={handleBackgroundColorChange}
			/>

			{/* Bottom Action Bar - Professional toolbar for element selection and actions */}
			<BottomActionBar
				onSelectMode={handleSelectMode}
				onInspectMode={handleInspectMode}
				onRectangleSelection={handleRectangleSelection}
				onAIChat={handleAIChat}
				isSelectMode={isSelectMode}
				isInspectMode={isInspectMode}
				isRectangleMode={isRectangleMode}
			/>

			{/* Fullscreen Overlay */}
			{fullscreenSandboxId && (() => {
				const sandbox = sandboxes.find(s => s.id === fullscreenSandboxId);
				if (!sandbox) return null;

				return (
					<FullscreenOverlay
						sandbox={sandbox}
						deviceMode={globalDeviceMode}
						onDeviceModeChange={setGlobalDeviceMode}
						onClose={handleExitFullscreen}
					/>
				);
			})()}
		</div>
	);
}

export default App;
