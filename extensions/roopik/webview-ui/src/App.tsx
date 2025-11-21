/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect } from 'react';
import type { Sandbox } from './types';
import { FloatingToolbar } from './components/FloatingToolbar';
import { InfiniteCanvas } from './components/InfiniteCanvas';
import { StatusBar } from './components/StatusBar';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { BottomActionBar } from './components/BottomActionBar';
import { useFPS } from './hooks/useFPS';
import { SAMPLE_COMPONENTS } from './data/sampleComponents';
import './App.css';

// VS Code API
declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

// Canvas state from extension (injected via window)
declare global {
	interface Window {
		CANVAS_STATE?: {
			sandboxes?: Sandbox[];
			viewport?: { x: number; y: number; scale: number };
		};
		SESSION_PREFERENCES?: {
			backgroundColor?: string;
			backgroundPattern?: string;
		};
	}
}

// Transform matrix for pan/zoom
interface Transform {
	x: number;
	y: number;
	scale: number;
}

// Background pattern types
type BackgroundPattern = 'grid' | 'dots' | 'plain';

function App() {
	const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
	const [pattern, setPattern] = useState<BackgroundPattern>('dots');
	const [backgroundColor, setBackgroundColor] = useState<string>('#1a1a1a');
	const [sandboxes, _setSandboxes] = useState<Sandbox[]>([]);
	const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(null);
	const [focusedSandboxId, setFocusedSandboxId] = useState<string | null>(null);
	const [_sandboxTemplate, setSandboxTemplate] = useState<string | null>(null);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const fps = useFPS();

	// Bottom Action Bar state
	const [isSelectMode, setIsSelectMode] = useState(false);
	const [isInspectMode, setIsInspectMode] = useState(false);
	const [isRectangleMode, setIsRectangleMode] = useState(false);

	// Load initial state from extension on mount
	useEffect(() => {
		try {
			const initialState = window.CANVAS_STATE;
			const preferences = window.SESSION_PREFERENCES;

			if (initialState) {
				console.log('[Canvas] Loading initial state from extension:', initialState);

				// Load sandboxes if present
				if (initialState.sandboxes && initialState.sandboxes.length > 0) {
					console.log('[Canvas] Restoring', initialState.sandboxes.length, 'sandboxes');
					_setSandboxes(initialState.sandboxes);
				}

				// Load viewport transform if present
				if (initialState.viewport) {
					console.log('[Canvas] Restoring viewport:', initialState.viewport);
					setTransform(initialState.viewport);
				}
			} else {
				console.log('[Canvas] No initial state found, starting with empty canvas');
			}

			// Load session preferences (backgroundColor, backgroundPattern)
			if (preferences && typeof preferences === 'object') {
				console.log('[Canvas] Loading session preferences:', preferences);

				// Validate and apply backgroundColor
				if (preferences.backgroundColor && typeof preferences.backgroundColor === 'string') {
					// Basic validation: check if it's a hex color
					if (/^#[0-9A-Fa-f]{6}$/.test(preferences.backgroundColor)) {
						setBackgroundColor(preferences.backgroundColor);
					}
				}

				// Validate and apply backgroundPattern
				if (preferences.backgroundPattern && typeof preferences.backgroundPattern === 'string') {
					const validPatterns: BackgroundPattern[] = ['grid', 'dots', 'plain'];
					if (validPatterns.includes(preferences.backgroundPattern as BackgroundPattern)) {
						setPattern(preferences.backgroundPattern as BackgroundPattern);
					}
				}
			}
		} catch (error) {
			console.error('[Canvas] Failed to load initial state:', error);
			// Gracefully continue with empty state
		}
	}, []); // Run only once on mount

	// Request sandbox template on mount
	useEffect(() => {
		console.log('[Canvas] Requesting sandbox template from extension');
		vscode.postMessage({ type: 'getSandboxTemplate' });

		// Listen for messages from extension
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			console.log('[Canvas] Received message from extension:', message.type);

			switch (message.type) {
				case 'sandboxTemplate':
					console.log('[Canvas] Sandbox template received');
					setSandboxTemplate(message.html);
					break;

				case 'componentReady':
					console.log('[Canvas] Component ready:', message.componentId);

					// Check for duplicate sandbox ID
					const existingSandbox = sandboxes.find(s => s.id === message.componentId);
					if (existingSandbox) {
						console.warn('[Canvas] Sandbox with ID already exists, ignoring:', message.componentId);
						vscode.postMessage({
							type: 'error',
							message: `Sandbox with ID "${message.componentId}" already exists on canvas`
						});
						break;
					}

					// Calculate grid position (4 per row)
					const SANDBOX_WIDTH = 500;
					const SANDBOX_HEIGHT = 500;
					const GRID_COLUMNS = 4;
					const CONTAINER_MARGIN = 20; // CSS margin on container
					const CONTAINER_PADDING_LR = 100; // Left/right padding inside container
					const CONTAINER_PADDING_TB = 20; // Top/bottom padding inside container

					// Total space needed per sandbox (including all margins/paddings)
					const TOTAL_WIDTH = SANDBOX_WIDTH + (CONTAINER_MARGIN * 2) + (CONTAINER_PADDING_LR * 2);
					const TOTAL_HEIGHT = SANDBOX_HEIGHT + (CONTAINER_MARGIN * 2) + (CONTAINER_PADDING_TB * 2);

					const GAP_X = 60; // Extra horizontal gap between sandboxes
					const GAP_Y = 60; // Extra vertical gap between sandboxes
					const START_X = 100;
					const START_Y = 100;

					const index = sandboxes.length;
					const col = index % GRID_COLUMNS;
					const row = Math.floor(index / GRID_COLUMNS);

					// Create new sandbox on canvas with grid layout
					const newSandbox: Sandbox = {
						id: message.componentId,
						x: START_X + (col * (TOTAL_WIDTH + GAP_X)),
						y: START_Y + (row * (TOTAL_HEIGHT + GAP_Y)),
						width: SANDBOX_WIDTH,
						height: SANDBOX_HEIGHT,
						zIndex: sandboxes.length, // Start with index-based z-index
						sandboxMessage: message.sandboxMessage
					};

					_setSandboxes(prev => {
						const updated = [...prev, newSandbox];

						// Auto-zoom to fit all sandboxes after adding
						setTimeout(() => {
							fitAllSandboxes(updated);
						}, 100);

						return updated;
					});
					console.log('[Canvas] Sandbox added to canvas:', newSandbox.id);
					break;

				case 'componentUpdate':
					console.log('[Canvas] Component update:', message.componentId);
					// TODO: Send update message to existing sandbox iframe
					break;
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [sandboxes.length]);

	// Auto-save canvas state when sandboxes or viewport changes
	useEffect(() => {
		// Skip saving on initial mount if state is empty
		if (sandboxes.length === 0 && transform.x === 0 && transform.y === 0 && transform.scale === 1) {
			return;
		}

		const saveTimeout = setTimeout(() => {
			console.log('[Canvas] Auto-saving canvas state');
			vscode.postMessage({
				type: 'saveSandboxes',
				sandboxes: sandboxes,
				viewport: transform
			});
		}, 500); // Debounce 500ms

		return () => clearTimeout(saveTimeout);
	}, [sandboxes, transform]);

	// Auto-zoom to fit all sandboxes
	const fitAllSandboxes = (sandboxList: Sandbox[]) => {
		if (sandboxList.length === 0) {return;}

		// Constants matching the grid calculation
		const CONTAINER_MARGIN = 20;
		const CONTAINER_PADDING_LR = 100;
		const CONTAINER_PADDING_TB = 20;

		// Calculate bounding box of all sandboxes
		let minX = Infinity, minY = Infinity;
		let maxX = -Infinity, maxY = -Infinity;

		sandboxList.forEach(sandbox => {
			const totalWidth = sandbox.width + (CONTAINER_MARGIN * 2) + (CONTAINER_PADDING_LR * 2);
			const totalHeight = sandbox.height + (CONTAINER_MARGIN * 2) + (CONTAINER_PADDING_TB * 2);

			minX = Math.min(minX, sandbox.x);
			minY = Math.min(minY, sandbox.y);
			maxX = Math.max(maxX, sandbox.x + totalWidth);
			maxY = Math.max(maxY, sandbox.y + totalHeight);
		});

		const contentWidth = maxX - minX;
		const contentHeight = maxY - minY;

		// Get viewport size (assume full window)
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight - 100; // Account for toolbar/statusbar

		// Calculate scale to fit with some padding
		const padding = 100;
		const scaleX = (viewportWidth - padding * 2) / contentWidth;
		const scaleY = (viewportHeight - padding * 2) / contentHeight;
		const newScale = Math.min(scaleX, scaleY, 1); // Don't zoom in more than 100%

		// Center the content
		const centerX = (viewportWidth - contentWidth * newScale) / 2 - minX * newScale;
		const centerY = (viewportHeight - contentHeight * newScale) / 2 - minY * newScale;

		setTransform({
			x: centerX,
			y: centerY,
			scale: newScale
		});
	};

	// Toggle focus on a sandbox (double-click to focus/unfocus)
	// When focused: Uses 80% of viewport height (10% margin top/bottom for toolbar and future options bar)
	// When unfocused: Zooms out to show all sandboxes
	const focusSandbox = (sandboxId: string, forceRefocus: boolean = false) => {
		// If already focused and not forcing refocus, unfocus and zoom out to see all
		if (focusedSandboxId === sandboxId && !forceRefocus) {
			console.log('[Canvas] Unfocusing sandbox, zooming out to see all');
			setFocusedSandboxId(null);
			fitAllSandboxes(sandboxes);
			return;
		}

		const sandbox = sandboxes.find(s => s.id === sandboxId);
		if (!sandbox) {return;}

		console.log('[Canvas] Focusing on sandbox:', sandboxId);
		setFocusedSandboxId(sandboxId);

		// Constants matching the container design
		const CONTAINER_MARGIN = 20;
		const CONTAINER_PADDING_LR = 120; // Updated to match user's adjustment
		const CONTAINER_PADDING_TB = 40;  // Updated to match user's adjustment

		// Total visual area of the sandbox (including container padding/margin)
		const totalWidth = sandbox.width + (CONTAINER_MARGIN * 2) + (CONTAINER_PADDING_LR * 2);
		const totalHeight = sandbox.height + (CONTAINER_MARGIN * 2) + (CONTAINER_PADDING_TB * 2);

		// Get viewport size
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		// Use 80% of viewport (10% margin top and bottom)
		const usableHeight = viewportHeight * 0.8;
		const usableWidth = viewportWidth * 0.9; // 90% width for some side breathing room

		// Calculate scale to fit sandbox within 80% of viewport
		const scaleX = usableWidth / totalWidth;
		const scaleY = usableHeight / totalHeight;
		const newScale = Math.min(scaleX, scaleY, 1.2); // Allow up to 120% zoom for small components

		// Calculate center position
		// We want the sandbox's visual center (including container) to be at viewport center
		const sandboxVisualCenterX = sandbox.x + totalWidth / 2;
		const sandboxVisualCenterY = sandbox.y + totalHeight / 2;

		const viewportCenterX = viewportWidth / 2;
		const viewportCenterY = viewportHeight / 2;

		// Transform to center the sandbox
		const centerX = viewportCenterX - sandboxVisualCenterX * newScale;
		const centerY = viewportCenterY - sandboxVisualCenterY * newScale;

		setTransform({
			x: centerX,
			y: centerY,
			scale: newScale
		});
	};

	// Zoom controls
	const handleZoomIn = () => {
		setTransform(prev => ({ ...prev, scale: Math.min(10, prev.scale * 1.2) }));
	};

	const handleZoomOut = () => {
		setTransform(prev => ({ ...prev, scale: Math.max(0.1, prev.scale / 1.2) }));
	};

	const handleResetView = () => {
		if (sandboxes.length === 0) {
			// No sandboxes: reset to origin
			setTransform({ x: 0, y: 0, scale: 1 });
		} else {
			// Has sandboxes: reorganize to grid and fit view
			reorganizeToGrid();
		}
	};

	// Reorganize all sandboxes to proper grid layout
	const reorganizeToGrid = (sandboxList?: Sandbox[]) => {
		// Use provided list or current sandboxes state
		const currentSandboxes = sandboxList || sandboxes;

		const SANDBOX_WIDTH = 500;
		const SANDBOX_HEIGHT = 500;
		const GRID_COLUMNS = 4;
		const CONTAINER_MARGIN = 20;
		const CONTAINER_PADDING_LR = 120;
		const CONTAINER_PADDING_TB = 40;
		const TOTAL_WIDTH = SANDBOX_WIDTH + (CONTAINER_MARGIN * 2) + (CONTAINER_PADDING_LR * 2);
		const TOTAL_HEIGHT = SANDBOX_HEIGHT + (CONTAINER_MARGIN * 2) + (CONTAINER_PADDING_TB * 2);
		const GAP_X = 60;
		const GAP_Y = 60;
		const START_X = 100;
		const START_Y = 100;

		// Reorganize sandboxes to grid positions
		const reorganized = currentSandboxes.map((sandbox, index) => {
			const col = index % GRID_COLUMNS;
			const row = Math.floor(index / GRID_COLUMNS);
			return {
				...sandbox,
				x: START_X + (col * (TOTAL_WIDTH + GAP_X)),
				y: START_Y + (row * (TOTAL_HEIGHT + GAP_Y)),
			};
		});

		_setSandboxes(reorganized);

		// Fit view to show all sandboxes after reorganization
		setTimeout(() => {
			fitAllSandboxes(reorganized);
		}, 100);
	};

	// Pattern toggle
	const handleTogglePattern = () => {
		const patterns: BackgroundPattern[] = ['grid', 'dots', 'plain'];
		const currentIndex = patterns.indexOf(pattern);
		const nextIndex = (currentIndex + 1) % patterns.length;
		const newPattern = patterns[nextIndex];
		setPattern(newPattern);

		// Save preference to session
		vscode.postMessage({
			type: 'savePreferences',
			preferences: {
				backgroundColor,
				backgroundPattern: newPattern
			}
		});
	};

	// Background color change handler
	const handleBackgroundColorChange = (color: string) => {
		setBackgroundColor(color);

		// Save preference to session
		vscode.postMessage({
			type: 'savePreferences',
			preferences: {
				backgroundColor: color,
				backgroundPattern: pattern
			}
		});
	};

	// Load sample component
	const handleLoadSample = (sampleIndex: number) => {
		const sample = SAMPLE_COMPONENTS[sampleIndex];
		if (!sample) {
			console.error('[Canvas] Sample not found:', sampleIndex);
			return;
		}

		console.log('[Canvas] Loading sample component:', sample.name);

		// Send component to extension for processing
		vscode.postMessage({
			type: 'loadComponent',
			component: {
				id: sample.id,
				code: sample.code,
				dependencies: sample.dependencies
			}
		});
	};

	// Component selection
	const handleSandboxClick = (sandboxId: string) => {
		setSelectedSandboxId(sandboxId);
		console.log('[Canvas] Sandbox selected:', sandboxId);

		// Keep focus persisted - only remove focus on double-click unfocus or Escape key

		// Bring clicked sandbox to front
		_setSandboxes(prev => {
			const maxZIndex = Math.max(...prev.map(s => s.zIndex));
			return prev.map(s =>
				s.id === sandboxId
					? { ...s, zIndex: maxZIndex + 1 }
					: s
			);
		});
	};

	// Component deletion - show modal
	const handleDeleteSelected = () => {
		if (!selectedSandboxId) {return;}
		setShowDeleteModal(true);
	};

	// Handle delete button click from sandbox
	const handleSandboxDelete = (sandboxId: string) => {
		setSelectedSandboxId(sandboxId);
		setShowDeleteModal(true);
	};

	// Confirm deletion
	const confirmDelete = () => {
		if (!selectedSandboxId) {return;}

		console.log('[Canvas] Deleting sandbox:', selectedSandboxId);
		const updatedSandboxes = sandboxes.filter(s => s.id !== selectedSandboxId);
		setSelectedSandboxId(null);
		setShowDeleteModal(false);

		// Auto-reorganize remaining sandboxes to fill the gap
		if (updatedSandboxes.length > 0) {
			setTimeout(() => {
				reorganizeToGrid(updatedSandboxes);
			}, 50);
		} else {
			// No sandboxes left, just clear the state
			_setSandboxes([]);
		}
	};

	// Cancel deletion
	const cancelDelete = () => {
		setShowDeleteModal(false);
	};

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Delete: Remove selected sandbox
			if (e.key === 'Delete' && selectedSandboxId) {
				handleDeleteSelected();
			}
			// Escape: Deselect and unfocus
			if (e.key === 'Escape') {
				setSelectedSandboxId(null);
				setFocusedSandboxId(null);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [selectedSandboxId]);

	// Window resize handler - re-focus sandbox if one is focused
	useEffect(() => {
		const handleResize = () => {
			if (focusedSandboxId) {
				console.log('[Canvas] Window resized, re-focusing sandbox:', focusedSandboxId);
				// Use setTimeout to debounce and ensure DOM is updated
				setTimeout(() => {
					focusSandbox(focusedSandboxId, true); // Force refocus, don't toggle
				}, 100);
			}
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, [focusedSandboxId, sandboxes]);

	// Bottom Action Bar handlers
	const handleSelectMode = () => {
		setIsSelectMode(!isSelectMode);
		setIsInspectMode(false);
		setIsRectangleMode(false);
		console.log('[BottomActionBar] Select mode:', !isSelectMode);
	};

	const handleInspectMode = () => {
		setIsInspectMode(!isInspectMode);
		setIsSelectMode(false);
		setIsRectangleMode(false);
		console.log('[BottomActionBar] Inspect mode:', !isInspectMode);
	};

	const handleRectangleSelection = () => {
		setIsRectangleMode(!isRectangleMode);
		setIsSelectMode(false);
		setIsInspectMode(false);
		console.log('[BottomActionBar] Rectangle mode:', !isRectangleMode);
	};

	const handleAIChat = () => {
		console.log('[BottomActionBar] AI Chat toggled');
	};

	const handleActionsPanel = () => {
		console.log('[BottomActionBar] Actions Panel toggled');
	};

	return (
		<div className="app">
			<FloatingToolbar tabName="Canvas" onLoadSample={handleLoadSample} />

			<InfiniteCanvas
				sandboxes={sandboxes}
				selectedSandboxId={selectedSandboxId}
				focusedSandboxId={focusedSandboxId}
				transform={transform}
				pattern={pattern}
				backgroundColor={backgroundColor}
				onTransformChange={setTransform}
				onSandboxClick={handleSandboxClick}
				onSandboxDoubleClick={focusSandbox}
				onSandboxUpdate={(id, updates) => {
					_setSandboxes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
				}}
				onSandboxDelete={handleSandboxDelete}
			/>

			<StatusBar
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
				onActionsPanel={handleActionsPanel}
				isSelectMode={isSelectMode}
				isInspectMode={isInspectMode}
				isRectangleMode={isRectangleMode}
				selectedElementType={null} // TODO: Will be determined based on selection
			/>

			{/* Delete confirmation modal */}
			{showDeleteModal && selectedSandboxId && (
				<DeleteConfirmModal
					sandboxId={selectedSandboxId}
					onConfirm={confirmDelete}
					onCancel={cancelDelete}
				/>
			)}
		</div>
	);
}

export default App;
