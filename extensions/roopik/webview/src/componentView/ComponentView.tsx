/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback, useRef } from "react";
import type {
	Sandbox,
	Transform,
	BackgroundPattern,
	DevicePreset,
	ExtensionMessage,
	WebviewMessage,
	SnapMode,
	SandboxPositions,
} from "../canvasView/types";
import { InfiniteCanvas } from "../canvasView/components/InfiniteCanvas";
import { StatusPanel } from "../canvasView/components/StatusPanel";
import { GlobalDeviceToggle } from "../canvasView/components/DeviceToggle";
import { BottomActionBar } from "../canvasView/components/Toolbar/BottomActionBar";
import { DeleteConfirmModal } from "../canvasView/components/Toolbar/DeleteConfirmModal";
import {
	reorganizeSandboxes,
	calculateFitAllTransform,
	calculateFocusTransform,
	getNextAvailableGridPosition,
	DEFAULT_CONFIG,
	getFocusedSandboxDimensions,
} from "../canvasView/services/gridManager";
import { useFPS } from "../hooks/useFPS";
import "./ComponentView.css";

// VS Code API
declare const acquireVsCodeApi: () => {
	postMessage: (msg: WebviewMessage) => void;
};
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
	const [transform, setTransform] = useState<Transform>({
		x: 0,
		y: 0,
		scale: 1,
	});
	const [pattern, setPattern] = useState<BackgroundPattern>("dots");
	const [backgroundColor, setBackgroundColor] = useState<string>("#1a1a1a");
	const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
	const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(
		null
	);
	const [focusedSandboxId, setFocusedSandboxId] = useState<string | null>(null);

	// Viewport dimensions for dynamic focused sandbox sizing
	const [viewport, setViewport] = useState({
		width: window.innerWidth,
		height: window.innerHeight,
	});

	// Device mode state
	const [globalDeviceMode, setGlobalDeviceMode] =
		useState<DevicePreset>("auto");

	// Bottom Action Bar state
	const [isSelectMode, setIsSelectMode] = useState(false);
	const [isInspectMode, setIsInspectMode] = useState(false);
	const [isRectangleMode, setIsRectangleMode] = useState(false);

	// Grid positioning mode state
	const [snapMode, setSnapMode] = useState<SnapMode>("free");

	// Drag-drop state
	const [isDragOver, setIsDragOver] = useState(false);

	// Delete confirmation state (for keyboard Delete key)
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

	// FPS counter
	const fps = useFPS();

	// Track pending builds
	const pendingBuildsRef = useRef<Set<string>>(new Set());

	// Track previous sandbox count for auto-fit on new additions
	const prevSandboxCountRef = useRef<number>(0);

	// Store loaded sandbox positions from extension (for restoring sandbox positions)
	const loadedPositionsRef = useRef<SandboxPositions>({});

	// Track focused state for auto-fit logic
	const focusedSandboxIdRef = useRef<string | null>(null);

	// Track if we're in initial loading state (disable auto-fit during bulk load)
	const isInitialLoadingRef = useRef<boolean>(false);

	// Ref to store fitAllSandboxes (defined later, used in message handler)
	const fitAllSandboxesRef = useRef<((sandboxList: Sandbox[]) => void) | null>(
		null
	);

	// Update ref when focused state changes
	useEffect(() => {
		focusedSandboxIdRef.current = focusedSandboxId;
	}, [focusedSandboxId]);

	// Load initial state from extension on mount
	useEffect(() => {
		try {
			const initialState = window.CANVAS_STATE;

			if (initialState) {
				console.log(
					"[Canvas] Loading initial state from extension:",
					initialState
				);

				if (initialState.sandboxes && initialState.sandboxes.length > 0) {
					console.log(
						"[Canvas] Restoring",
						initialState.sandboxes.length,
						"sandboxes"
					);
					setSandboxes(initialState.sandboxes);
					// Sync ref to avoid auto-fit on initial load
					prevSandboxCountRef.current = initialState.sandboxes.length;
				}

				if (initialState.viewport) {
					console.log("[Canvas] Restoring viewport:", initialState.viewport);
					setTransform(initialState.viewport);
				}

				// Restore background preferences
				if (
					initialState.backgroundColor &&
					/^#[0-9A-Fa-f]{6}$/.test(initialState.backgroundColor)
				) {
					console.log(
						"[Canvas] Restoring background color:",
						initialState.backgroundColor
					);
					setBackgroundColor(initialState.backgroundColor);
				}

				if (initialState.backgroundPattern) {
					const validPatterns: BackgroundPattern[] = ["grid", "dots", "plain"];
					if (validPatterns.includes(initialState.backgroundPattern)) {
						console.log(
							"[Canvas] Restoring background pattern:",
							initialState.backgroundPattern
						);
						setPattern(initialState.backgroundPattern);
					}
				}
			} else {
				console.log(
					"[Canvas] No initial state found, starting with empty canvas"
				);
			}
		} catch (error) {
			console.error("[Canvas] Failed to load initial state:", error);
		}
	}, []);

	// Handle messages from Extension (Core pipeline responses)
	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const msg = event.data;
			console.log("[Canvas] Received message from extension:", msg.type);

			switch (msg.type) {
				case "canvasLoadingStarted": {
					// Turn off auto-fit flag during initial loading
					const { componentCount } = msg.payload as { componentCount: number };
					console.log(
						"[Canvas] Initial loading started:",
						componentCount,
						"components"
					);
					isInitialLoadingRef.current = true;
					break;
				}

				case "canvasLoadingComplete": {
					// Turn on auto-fit flag and call fitAllSandboxes
					const { componentCount } = msg.payload as { componentCount: number };
					console.log(
						"[Canvas] Initial loading complete:",
						componentCount,
						"components"
					);

					isInitialLoadingRef.current = false;

					// Call fitAllSandboxes after a short delay to ensure DOM is ready
					setTimeout(() => {
						if (sandboxes.length > 0 && fitAllSandboxesRef.current) {
							console.log("[Canvas] Fitting all sandboxes after initial load");
							fitAllSandboxesRef.current(sandboxes);
						}
					}, 200);
					break;
				}

				case "componentCreated": {
					// Component created - create sandbox with 'building' status (loading spinner)
					const { componentId, canvasId, name } = msg.payload;
					console.log("[Canvas] componentCreated received:", {
						componentId,
						canvasId,
						name,
					});

					// Check if sandbox already exists (e.g., from addImportedComponent)
					setSandboxes((prev) => {
						const existingSandbox = prev.find((s) => s.id === componentId);
						if (existingSandbox) {
							console.log(
								"[Canvas] Sandbox already exists, updating to building status"
							);
							return prev.map((sandbox) =>
								sandbox.id === componentId
									? { ...sandbox, buildStatus: "building" as const }
									: sandbox
							);
						} else {
							// Check if we have a saved position for this component
							const savedPosition = loadedPositionsRef.current[componentId];
							let position: { x: number; y: number };
							let zIndex: number;

							if (savedPosition) {
								// Use saved position from storage
								console.log(
									"[Canvas] Using saved position for component:",
									componentId,
									savedPosition
								);
								position = { x: savedPosition.x, y: savedPosition.y };
								zIndex = savedPosition.zIndex;
							} else {
								// Calculate new position
								console.log(
									"[Canvas] Creating new sandbox with building status"
								);
								const gridPos = getNextAvailableGridPosition(
									prev,
									DEFAULT_CONFIG
								);
								position = { x: gridPos.x, y: gridPos.y };
								zIndex = prev.length + 1;
							}

							const newSandbox: Sandbox = {
								id: componentId,
								x: position.x,
								y: position.y,
								zIndex,
								buildStatus: "building",
								componentInput: {
									id: componentId,
									name,
									source: "import",
									files: {},
								},
							};
							const updated = [...prev, newSandbox];

							// Trigger auto-fit after state update (only if not in initial loading)
							if (!isInitialLoadingRef.current) {
								setTimeout(() => {
									if (
										!focusedSandboxIdRef.current &&
										fitAllSandboxesRef.current
									) {
										fitAllSandboxesRef.current(updated);
									}
								}, 350);
							}

							return updated;
						}
					});
					break;
				}

				case "componentBuilt": {
					// Component built successfully - update sandbox
					const { componentId, result } = msg.payload;
					pendingBuildsRef.current.delete(componentId);

					console.log("[Canvas] componentBuilt received:", {
						componentId,
						framework: result.framework,
						bundledCodeLength: result.bundledCode?.length || 0,
						cdnUrls: result.cdnUrls,
					});

					setSandboxes((prev) =>
						prev.map((sandbox) => {
							if (sandbox.id === componentId) {
								return {
									...sandbox,
									buildStatus: "ready" as const,
									bundledCode: result.bundledCode,
									cdnUrls: result.cdnUrls,
									buildError: undefined,
								};
							}
							return sandbox;
						})
					);
					break;
				}

				case "componentError": {
					// Build failed - update sandbox with error
					const { componentId, error, errorInfo } = msg.payload;
					pendingBuildsRef.current.delete(componentId);

					console.error("[Canvas] componentError received:", {
						componentId,
						error,
						errorInfo,
					});

					setSandboxes((prev) =>
						prev.map((sandbox) => {
							if (sandbox.id === componentId) {
								return {
									...sandbox,
									buildStatus: "error" as const,
									buildError: error,
									buildErrorInfo: errorInfo,
									bundledCode: undefined,
								};
							}
							return sandbox;
						})
					);
					break;
				}

				case "canvasLoaded": {
					// Restore canvas state
					const { state } = msg.payload;
					console.log("[Canvas] Canvas loaded:", {
						id: state.id,
						name: state.name,
						sandboxCount: state.sandboxes.length,
						backgroundColor: state.backgroundColor,
						backgroundPattern: state.backgroundPattern,
					});

					setSandboxes(state.sandboxes);
					// Sync ref to avoid auto-fit on canvas load
					prevSandboxCountRef.current = state.sandboxes.length;
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

				case "themeChanged": {
					// Handle theme change if needed
					break;
				}

				case "addImportedComponent": {
					// Import component from file
					const { componentInput, position } = msg.payload;
					console.log("[Canvas] Importing component:", {
						id: componentInput.id,
						framework: componentInput.framework,
						files: Object.keys(componentInput.files),
					});

					setSandboxes((prev) => {
						// Priority: 1. Provided position, 2. Saved position, 3. Next available grid slot
						let finalPosition: { x: number; y: number };
						let zIndex: number;

						if (position) {
							finalPosition = position;
							zIndex = Date.now();
						} else {
							const savedPosition =
								loadedPositionsRef.current[componentInput.id];
							if (savedPosition) {
								console.log(
									"[Canvas] Using saved position for imported component:",
									componentInput.id,
									savedPosition
								);
								finalPosition = { x: savedPosition.x, y: savedPosition.y };
								zIndex = savedPosition.zIndex;
							} else {
								const gridPos = getNextAvailableGridPosition(
									prev,
									DEFAULT_CONFIG
								);
								finalPosition = { x: gridPos.x, y: gridPos.y };
								zIndex = Date.now();
							}
						}

						const newSandbox: Sandbox = {
							id: componentInput.id,
							x: finalPosition.x,
							y: finalPosition.y,
							zIndex,
							buildStatus: "pending",
							componentInput,
						};

						const updated = [...prev, newSandbox];

						// Request build for the imported component
						vscode.postMessage({
							type: "buildComponent",
							payload: {
								componentId: newSandbox.id,
								input: componentInput,
							},
						});

						setSelectedSandboxId(newSandbox.id);

						// Trigger auto-fit after state update
						setTimeout(() => {
							if (!focusedSandboxIdRef.current && fitAllSandboxesRef.current) {
								fitAllSandboxesRef.current(updated);
							}
						}, 350);

						return updated;
					});
					break;
				}

				case "canvasPreferencesLoaded": {
					// Preferences and sandbox positions loaded from file by extension
					const { preferences, sandboxPositions } = msg.payload;
					console.log("[Canvas] 🎨 Preferences loaded from file:", preferences);

					if (preferences.backgroundColor) {
						setBackgroundColor(preferences.backgroundColor);
					}
					if (preferences.backgroundPattern) {
						setPattern(preferences.backgroundPattern);
					}
					if (preferences.viewport) {
						setTransform(preferences.viewport);
					}

					// Store sandbox positions for use when sandboxes are created
					if (sandboxPositions) {
						loadedPositionsRef.current = sandboxPositions;
						console.log(
							"[Canvas] Loaded positions for",
							Object.keys(sandboxPositions).length,
							"sandboxes"
						);
					}
					break;
				}
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [sandboxes]);

	// Handle messages from sandbox iframes (element inspection, errors, etc.)
	useEffect(() => {
		const handleIframeMessage = (event: MessageEvent) => {
			const data = event.data;
			if (!data || typeof data !== "object") return;

			// Handle element selection from inspect mode
			if (data.type === 'roopik-element-selected') {
				const { componentId, element } = data;
				console.log('[Canvas] Element selected in sandbox:', componentId, element);

				// Check if we have source location info
				if (element?.sourceLocation) {
					const { file, startLine } = element.sourceLocation;
					console.log('[Canvas] Source location:', file, 'line', startLine);

					// Store the pending selection
					pendingElementSelectionRef.current = {
						componentId,
						sourceLocation: element.sourceLocation
					};

					// Request files from extension - will receive componentFilesLoaded message
					vscode.postMessage({
						type: "loadComponentFiles",
						payload: { componentId },
					});
				} else {
					console.log('[Canvas] ⚠️ No source location for element');
				}
			}

			// Handle inspect mode ready notification
			if (data.type === "roopik-inspect-ready") {
				console.log(
					"[Canvas] ✓ Inspect mode ready for sandbox:",
					data.componentId
				);
			}

			// Handle component runtime errors
			if (data.type === "roopik-component-error") {
				console.log(
					"[Canvas] Runtime error in sandbox:",
					data.componentId,
					data.error
				);
			}
		};

		window.addEventListener("message", handleIframeMessage);
		return () => window.removeEventListener("message", handleIframeMessage);
	}, []);

	// Notify extension that webview is ready
	useEffect(() => {
		vscode.postMessage({ type: "ready" });
	}, []);

	// Auto-save canvas state when sandboxes or viewport changes
	useEffect(() => {
		if (
			sandboxes.length === 0 &&
			transform.x === 0 &&
			transform.y === 0 &&
			transform.scale === 1
		) {
			return;
		}

		const saveTimeout = setTimeout(() => {
			console.log("[Canvas] Auto-saving canvas state");
			vscode.postMessage({
				type: "saveCanvas",
				payload: {
					canvasId: "default",
					state: {
						id: "default",
						name: "Canvas",
						sandboxes,
						selectedSandboxId,
						viewport: transform,
						backgroundColor,
						backgroundPattern: pattern,
						createdAt: Date.now(),
						updatedAt: Date.now(),
					},
				},
			});
		}, 500);

		return () => clearTimeout(saveTimeout);
	}, [sandboxes, transform, selectedSandboxId, backgroundColor, pattern]);

	// Auto-zoom to fit all sandboxes
	const fitAllSandboxes = useCallback((sandboxList: Sandbox[]) => {
		if (sandboxList.length === 0) return;

		// Use requestAnimationFrame to ensure DOM is updated
		requestAnimationFrame(() => {
			const viewport = {
				width: window.innerWidth,
				height: window.innerHeight - 100,
			};
			const newTransform = calculateFitAllTransform(
				sandboxList,
				viewport,
				DEFAULT_CONFIG,
				{
					padding: 40, // Reduced padding to use more space (was 100)
					toolbarHeight: 100, // Space for bottom toolbar
					maxScale: 1.8, // Allow zooming in up to 180% for larger previews (was 1.0)
				}
			);
			if (newTransform) {
				console.log("[Canvas] Auto-fitting to viewport:", {
					sandboxCount: sandboxList.length,
					transform: newTransform,
				});
				setTransform(newTransform);
			}
		});
	}, []);

	// Update ref when fitAllSandboxes is defined (for message handler access)
	useEffect(() => {
		fitAllSandboxesRef.current = fitAllSandboxes;
	}, [fitAllSandboxes]);

	// Auto-fit when sandbox count changes (additions or deletions)
	const sandboxCount = sandboxes.length;
	useEffect(() => {
		const prevCount = prevSandboxCountRef.current;

		// Always update ref for next comparison
		prevSandboxCountRef.current = sandboxCount;

		// Skip on initial mount (prevCount is 0 and we're loading from storage)
		// or if count didn't change
		if (sandboxCount === prevCount) {
			return;
		}

		// Skip if no sandboxes (all deleted)
		if (sandboxCount === 0) {
			return;
		}

		// === DISABLE CONDITIONS (easily extendable) ===
		const shouldSkipAutoFit =
			isInitialLoadingRef.current || // Initial canvas loading - fit once after complete
			focusedSandboxId !== null; // User focused on a sandbox
		// Future: || isEditingComponent || isUserDragging etc.

		if (shouldSkipAutoFit) {
			console.log(
				"[Canvas] Skipping auto-fit",
				isInitialLoadingRef.current
					? "(initial loading)"
					: "(user interaction mode)"
			);
			return;
		}

		// Use longer delay to ensure DOM is fully updated
		// Also use requestAnimationFrame for smoother animation
		const timer = setTimeout(() => {
			console.log(
				"[Canvas] Auto-fitting after count change:",
				prevCount,
				"->",
				sandboxCount
			);
			fitAllSandboxes(sandboxes);
		}, 300);

		return () => clearTimeout(timer);
	}, [sandboxCount, sandboxes, focusedSandboxId, fitAllSandboxes]);

	// Focus on a single sandbox (double-click)
	// When focused, sandbox expands dynamically to fill most of the viewport
	const focusSandbox = useCallback(
		(sandboxId: string) => {
			if (focusedSandboxId === sandboxId) {
				// Unfocus - zoom out to see all
				setFocusedSandboxId(null);
				fitAllSandboxes(sandboxes);
				return;
			}

			const sandbox = sandboxes.find((s) => s.id === sandboxId);
			if (!sandbox) return;

			console.log("[Canvas] Focusing on sandbox:", sandboxId);
			setFocusedSandboxId(sandboxId);

			const viewport = { width: window.innerWidth, height: window.innerHeight };
			// Calculate dynamic focused dimensions based on viewport
			const focusedDimensions = getFocusedSandboxDimensions(
				viewport.width,
				viewport.height,
				DEFAULT_CONFIG
			);
			// Use expanded dimensions for focus transform calculation
			const newTransform = calculateFocusTransform(
				sandbox,
				viewport,
				DEFAULT_CONFIG,
				{
					sandboxWidth: focusedDimensions.width,
					sandboxHeight: focusedDimensions.height,
				}
			);
			setTransform(newTransform);
		},
		[focusedSandboxId, sandboxes, fitAllSandboxes]
	);

	// Reorganize all sandboxes to grid
	const reorganizeToGrid = useCallback(
		(sandboxList?: Sandbox[]) => {
			const current = sandboxList || sandboxes;
			const reorganized = reorganizeSandboxes(current, DEFAULT_CONFIG);
			setSandboxes(reorganized);

			setTimeout(() => {
				fitAllSandboxes(reorganized);
			}, 100);
		},
		[sandboxes, fitAllSandboxes]
	);

	// Zoom controls
	const handleZoomIn = useCallback(() => {
		setTransform((prev) => ({
			...prev,
			scale: Math.min(10, prev.scale * 1.2),
		}));
	}, []);

	const handleZoomOut = useCallback(() => {
		setTransform((prev) => ({
			...prev,
			scale: Math.max(0.1, prev.scale / 1.2),
		}));
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
		const patterns: BackgroundPattern[] = ["grid", "dots", "plain"];
		setPattern((prev) => {
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
		console.log("[Canvas] Sandbox selected:", sandboxId);

		// Bring clicked sandbox to front
		setSandboxes((prev) => {
			const maxZIndex = Math.max(...prev.map((s) => s.zIndex));
			return prev.map((s) =>
				s.id === sandboxId ? { ...s, zIndex: maxZIndex + 1 } : s
			);
		});
	}, []);

	// Sandbox delete handler
	const handleSandboxDelete = useCallback(
		(sandboxId: string) => {
			console.log("[Canvas] Deleting sandbox:", sandboxId);
			pendingBuildsRef.current.delete(sandboxId);

			if (selectedSandboxId === sandboxId) setSelectedSandboxId(null);
			if (focusedSandboxId === sandboxId) setFocusedSandboxId(null);

			// Notify extension to delete component from storage (Core)
			vscode.postMessage({
				type: "deleteComponent",
				payload: { componentId: sandboxId },
			});

			setSandboxes((prev) => {
				const remaining = prev.filter((s) => s.id !== sandboxId);
				if (remaining.length > 0) {
					// Reorganize and auto-fit after deletion
					setTimeout(() => {
						if (!focusedSandboxIdRef.current) {
							reorganizeToGrid(remaining);
						} else {
							// Just fit without reorganizing if user is focused
							fitAllSandboxes(remaining);
						}
					}, 100);
				} else {
					// All deleted - reset view
					setTimeout(() => {
						setTransform({ x: 0, y: 0, scale: 1 });
					}, 100);
				}
				return remaining;
			});
		},
		[selectedSandboxId, focusedSandboxId, reorganizeToGrid, fitAllSandboxes]
	);

	// Sandbox rebuild handler (force rebuild bypassing cache)
	const handleSandboxRebuild = useCallback((sandboxId: string) => {
		console.log("[Canvas] Force rebuild sandbox:", sandboxId);

		// Update sandbox to building state
		setSandboxes((prev) =>
			prev.map((s) =>
				s.id === sandboxId
					? { ...s, buildStatus: "building" as const, buildError: undefined }
					: s
			)
		);

		// Send rebuild request to extension
		vscode.postMessage({
			type: "rebuildComponent",
			payload: { componentId: sandboxId },
		});
	}, []);

	// Open component source files in VS Code editor
	const handleSandboxShowCode = useCallback((sandboxId: string) => {
		console.log("[Canvas] Opening component in editor:", sandboxId);

		// Find the sandbox to get its component metadata
		const sandbox = sandboxes.find((s) => s.id === sandboxId);
		if (!sandbox) {
			console.error("[Canvas] Sandbox not found:", sandboxId);
			return;
		}

		// Call VS Code command to open component files in editor
		vscode.postMessage({
			type: "command",
			command: "roopik.component.openInEditor",
			args: {
				componentId: sandboxId,
				canvasId: CANVAS_CONFIG.canvasId,
				entryFile: sandbox.componentInput?.entryFile,
			},
		});
	}, [sandboxes]);

	// Sandbox update handler
	const handleSandboxUpdate = useCallback(
		(id: string, updates: Partial<Sandbox>) => {
			setSandboxes((prev) =>
				prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
			);
		},
		[]
	);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.key === "Delete" || e.key === "Backspace") && selectedSandboxId) {
				// Show delete confirmation modal instead of deleting directly
				e.preventDefault();
				setPendingDeleteId(selectedSandboxId);
			}
			if (e.key === "Escape") {
				// First priority: close delete confirmation modal
				if (pendingDeleteId) {
					setPendingDeleteId(null);
					return;
				}
				if (focusedSandboxId) {
					// Exit focused mode
					console.log("[Canvas] ESC: Exiting focused mode");
					setFocusedSandboxId(null);
					fitAllSandboxes(sandboxes);
				} else {
					// Deselect when not focused
					setSelectedSandboxId(null);
				}
			}
			if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				handleResetView();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		selectedSandboxId,
		focusedSandboxId,
		sandboxes,
		pendingDeleteId,
		handleResetView,
		fitAllSandboxes,
	]);

	// Window resize handler - update viewport and refocus if needed
	useEffect(() => {
		const handleResize = () => {
			// Update viewport dimensions for dynamic focused sizing
			setViewport({
				width: window.innerWidth,
				height: window.innerHeight,
			});

			if (focusedSandboxId) {
				setTimeout(() => {
					focusSandbox(focusedSandboxId);
				}, 100);
			}
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [focusedSandboxId, focusSandbox]);

	// Snap mode change handler - auto-reorganize when switching to grid mode
	const handleSnapModeChange = useCallback(
		(mode: SnapMode) => {
			setSnapMode(mode);
			if (mode === "grid" && sandboxes.length > 0) {
				console.log(
					"[StatusPanel] Switching to Grid mode - reorganizing sandboxes"
				);
				reorganizeToGrid();
			}
		},
		[sandboxes.length, reorganizeToGrid]
	);

	// Bottom Action Bar handlers - Mutually exclusive modes
	const handleSelectMode = useCallback(() => {
		const newState = !isSelectMode;
		setIsSelectMode(newState);
		if (newState) {
			setIsInspectMode(false);
			setIsRectangleMode(false);
		}
		console.log("[BottomActionBar] Select mode:", newState);
	}, [isSelectMode]);

	const handleInspectMode = useCallback(() => {
		const newState = !isInspectMode;
		setIsInspectMode(newState);
		if (newState) {
			setIsSelectMode(false);
			setIsRectangleMode(false);
		}
		console.log(
			"[ComponentView] Inspect mode toggled to:",
			newState,
			"- sandboxes count:",
			sandboxes.length
		);
	}, [isInspectMode, sandboxes.length]);

	const handleRectangleSelection = useCallback(() => {
		const newState = !isRectangleMode;
		setIsRectangleMode(newState);
		if (newState) {
			setIsSelectMode(false);
			setIsInspectMode(false);
		}
		console.log("[BottomActionBar] Rectangle mode:", newState);
	}, [isRectangleMode]);

	const handleAIChat = useCallback(() => {
		console.log("[BottomActionBar] AI Chat toggled");
	}, []);

	// ========================================================================
	// Drag-and-Drop Handlers (for importing components from OS file manager)
	// ========================================================================

	// Supported file extensions for component import
	const SUPPORTED_EXTENSIONS = [
		".tsx",
		".jsx",
		".ts",
		".js",
		".vue",
		".svelte",
	];

	// Timeout ref for auto-closing drag overlay (safety net)
	const dragTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Reset drag timeout - called on every drag event to keep overlay open
	const resetDragTimeout = useCallback(() => {
		if (dragTimeoutRef.current) {
			clearTimeout(dragTimeoutRef.current);
		}
		// Auto-close after 500ms of no drag activity (safety net)
		dragTimeoutRef.current = setTimeout(() => {
			setIsDragOver(false);
		}, 500);
	}, []);

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (dragTimeoutRef.current) {
				clearTimeout(dragTimeoutRef.current);
			}
		};
	}, []);

	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();

			// Check if it's a file drag (from OS file manager)
			if (e.dataTransfer.types.includes("Files")) {
				e.dataTransfer.dropEffect = "copy";
				setIsDragOver(true);
				resetDragTimeout(); // Keep alive while dragging
			}
		},
		[resetDragTimeout]
	);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();

		// Only hide overlay if leaving the container (not entering a child)
		const rect = e.currentTarget.getBoundingClientRect();
		const x = e.clientX;
		const y = e.clientY;
		if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
			setIsDragOver(false);
			if (dragTimeoutRef.current) {
				clearTimeout(dragTimeoutRef.current);
				dragTimeoutRef.current = null;
			}
		}
	}, []);

	// Handle dragend - fires when drag operation ends (drop or cancel)
	const handleDragEnd = useCallback(() => {
		setIsDragOver(false);
		if (dragTimeoutRef.current) {
			clearTimeout(dragTimeoutRef.current);
			dragTimeoutRef.current = null;
		}
	}, []);

	const handleDrop = useCallback(async (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);

		// Clear the safety timeout
		if (dragTimeoutRef.current) {
			clearTimeout(dragTimeoutRef.current);
			dragTimeoutRef.current = null;
		}

		const files = e.dataTransfer.files;
		if (files.length === 0) {
			console.log(
				"[DragDrop] No files in drop - might be from VSCode Explorer (not supported)"
			);
			return;
		}

		// Process each dropped file
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const fileName = file.name;
			const ext = "." + fileName.split(".").pop()?.toLowerCase();

			// Check if file type is supported
			if (!SUPPORTED_EXTENSIONS.includes(ext)) {
				console.log(`[DragDrop] Skipping unsupported file: ${fileName}`);
				vscode.postMessage({
					type: "showNotification",
					payload: {
						level: "warning",
						message: `Skipping unsupported file: ${fileName}`,
					},
				});
				continue;
			}

			try {
				// Read file content
				const content = await file.text();
				const componentName = fileName.replace(/\.[^/.]+$/, ""); // Remove extension

				console.log(
					`[DragDrop] Importing component: ${componentName} (${fileName})`
				);

				// Send to extension for import
				// Extension will add canvasId and forward to Core
				vscode.postMessage({
					type: "dropComponent",
					payload: {
						fileName,
						content,
						componentName,
					},
				});
			} catch (err) {
				console.error(`[DragDrop] Failed to read file: ${fileName}`, err);
			}
		}
	}, []);

	return (
		<div
			className="app"
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDragEnd={handleDragEnd}
			onDrop={handleDrop}
		>
			{/* Drop zone overlay */}
			{isDragOver && (
				<div className="drop-zone-overlay">
					<div className="drop-zone-content">
						<div className="drop-zone-icon">📦</div>
						<div className="drop-zone-text">Drop component file here</div>
						<div className="drop-zone-hint">
							.tsx, .jsx, .ts, .js, .vue, .svelte
						</div>
					</div>
				</div>
			)}

			<div className="canvas-container">
				<InfiniteCanvas
					sandboxes={sandboxes}
					selectedSandboxId={selectedSandboxId}
					focusedSandboxId={focusedSandboxId}
					transform={transform}
					pattern={pattern}
					backgroundColor={backgroundColor}
					globalDeviceMode={globalDeviceMode}
					snapMode={snapMode}
					viewport={viewport}
					isInspectMode={isInspectMode}
					onTransformChange={setTransform}
					onSandboxClick={handleSandboxClick}
					onSandboxDoubleClick={focusSandbox}
					onSandboxUpdate={handleSandboxUpdate}
					onSandboxDelete={handleSandboxDelete}
					onSandboxShowCode={handleSandboxShowCode}
					onSandboxRebuild={handleSandboxRebuild}
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
				snapMode={snapMode}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onResetView={handleResetView}
				onTogglePattern={handleTogglePattern}
				onBackgroundColorChange={handleBackgroundColorChange}
				onSnapModeChange={handleSnapModeChange}
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

			{/* Delete confirmation modal (triggered by Delete key) */}
			{pendingDeleteId && (
				<DeleteConfirmModal
					sandboxId={pendingDeleteId}
					onConfirm={() => {
						handleSandboxDelete(pendingDeleteId);
						setPendingDeleteId(null);
					}}
					onCancel={() => setPendingDeleteId(null)}
				/>
			)}
		</div>
	);
}

export default App;
