/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback, useRef } from "react";
import html2canvas from "html2canvas";
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
import { Toast } from "../canvasView/components/Toast";
import {
	reorganizeSandboxes,
	calculateFitAllTransform,
	calculateFocusTransform,
	getNextAvailableGridPosition,
	DEFAULT_CONFIG,
	getFocusedSandboxDimensions,
} from "../canvasView/services/gridManager";
import { DEVICE_PRESETS } from "../canvasView/types";
import { useFPS } from "../hooks/useFPS";

// ============================================================================
// Canvas Behavior Configuration
// ============================================================================
// These constants control auto-fit and reorganize behaviors.
// TODO: Move to user settings when settings UI is implemented

/**
 * Auto-fit canvas after deleting a component
 * - true: Automatically zoom to fit all remaining components after deletion
 * - false: Maintain current zoom level after deletion
 */
const AUTO_FIT_ON_DELETE = false;

/**
 * Auto-reorganize to grid after deleting a component
 * - true: Automatically reorganize remaining components to grid layout
 * - false: Keep components in their current positions
 */
const AUTO_REORGANIZE_ON_DELETE = true;

/**
 * Auto-attach screenshots when selecting elements in inspect mode.
 * Keep false until we expose a user setting.
 */
const AUTO_ATTACH_SCREENSHOT_ON_INSPECT = false;
const CHAT_SCREENSHOT_TOGGLE_KEY = "roopik.canvas.chatScreenshotEnabled";

// ============================================================================

import { createLogger } from "../utils/logger";
import "./ComponentView.css";

const logger = createLogger('Canvas');

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
		CANVAS_CONFIG?: {
			canvasId: string;
			canvasName?: string;
		};
		__roopikRequestScreenshot?: (payload: {
			componentId: string;
			element: HTMLElement | null;
			target?: string;
			requestId?: string;
			intent?: string;
		}) => void;
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

	// Toast notification state
	const [toastMessage, setToastMessage] = useState<string | null>(null);

	// Bottom Action Bar state
	const [isSelectMode, setIsSelectMode] = useState(false);
	const [isInspectMode, setIsInspectMode] = useState(false);
	const [aiChatAnchor, setAiChatAnchor] = useState<{ x: number; y: number; top: number; bottom: number; nonce: number } | null>(null);
	const [isChatScreenshotEnabled, setIsChatScreenshotEnabled] = useState(false);

	// Grid positioning mode state
	const [snapMode, setSnapMode] = useState<SnapMode>("free");

	// Drag-drop state
	const [isDragOver, setIsDragOver] = useState(false);

	// Delete confirmation state (for keyboard Delete key)
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

	// Delete source code preference (in-memory, persists during session)
	const [deleteSourceCodePref, setDeleteSourceCodePref] = useState(false);

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

	// Track pending element selection for inspect mode
	const pendingElementSelectionRef = useRef<{
		componentId: string;
		sourceLocation: { file: string; startLine: number };
	} | null>(null);
	const pendingScreenshotRef = useRef<{
		componentId: string;
		imageData: string;
		metadata?: {
			deviceMode: string;
			deviceViewport: { width: number; height: number };
		};
	} | null>(null);
	const pendingScreenshotRequestIdRef = useRef<string | null>(null);

	// Update ref when focused state changes
	useEffect(() => {
		focusedSandboxIdRef.current = focusedSandboxId;
	}, [focusedSandboxId]);

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(CHAT_SCREENSHOT_TOGGLE_KEY);
			if (stored === "true") {
				setIsChatScreenshotEnabled(true);
			}
		} catch {
			// Ignore storage errors and fall back to default.
		}
	}, []);

	useEffect(() => {
		try {
			window.localStorage.setItem(
				CHAT_SCREENSHOT_TOGGLE_KEY,
				isChatScreenshotEnabled ? "true" : "false",
			);
		} catch {
			// Ignore storage errors and keep in-memory state only.
		}
	}, [isChatScreenshotEnabled]);

	// Load initial state from extension on mount
	useEffect(() => {
		try {
			const initialState = window.CANVAS_STATE;

			if (initialState) {
				if (initialState.sandboxes && initialState.sandboxes.length > 0) {
					setSandboxes(initialState.sandboxes);
					// Sync ref to avoid auto-fit on initial load
					prevSandboxCountRef.current = initialState.sandboxes.length;
				}

				if (initialState.viewport) {
					setTransform(initialState.viewport);
				}

				// Restore background preferences
				if (
					initialState.backgroundColor &&
					/^#[0-9A-Fa-f]{6}$/.test(initialState.backgroundColor)
				) {
					setBackgroundColor(initialState.backgroundColor);
				}

				if (initialState.backgroundPattern) {
					const validPatterns: BackgroundPattern[] = ["grid", "dots", "plain"];
					if (validPatterns.includes(initialState.backgroundPattern)) {
						setPattern(initialState.backgroundPattern);
					}
				}
			}
		} catch (error) {
			console.error("[Canvas] Failed to load initial state:", error);
		}
	}, []);

	// Handle messages from Extension (Core pipeline responses)
	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const msg = event.data;

			switch (msg.type) {
				case "canvasLoadingStarted": {
					// Turn off auto-fit flag during initial loading
					isInitialLoadingRef.current = true;
					break;
				}

				case "canvasLoadingComplete": {
					// Turn on auto-fit flag and call fitAllSandboxes
					isInitialLoadingRef.current = false;
					// Call fitAllSandboxes after a short delay to ensure DOM is ready
					setTimeout(() => {
						if (sandboxes.length > 0 && fitAllSandboxesRef.current) {
							fitAllSandboxesRef.current(sandboxes);
						}
					}, 200);
					break;
				}

				case "componentCreated": {
					// Component created - create sandbox with 'building' status (loading spinner)
					// const { componentId, canvasId, name } = msg.payload;
					const { componentId, name } = msg.payload;
					// Check if sandbox already exists (e.g., from addImportedComponent)
					setSandboxes((prev) => {
						const existingSandbox = prev.find((s) => s.id === componentId);
						if (existingSandbox) {
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
								position = { x: savedPosition.x, y: savedPosition.y };
								zIndex = savedPosition.zIndex;
							} else {
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
									folderPath: msg.payload.folderPath,
									entryFile: msg.payload.entryFile
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
					const { componentId, result } = msg.payload;
					pendingBuildsRef.current.delete(componentId);

					setSandboxes((prev) =>
						prev.map((sandbox) => {
							if (sandbox.id === componentId) {
								return {
									...sandbox,
									buildStatus: "ready" as const,
									bundledCode: result.bundledCode,
									cdnUrls: result.cdnUrls,
									styling: result.styling,
									buildError: undefined,
									// Ensure iframe remounts by updating a monotonic nonce
									bundleNonce: Date.now(),
								};
							}
							return sandbox;
						})
					);

					// FIX: Force a repaint after state update to ensure iframes render
					// Chromium sometimes defers iframe rendering until a repaint is triggered
					requestAnimationFrame(() => {
						// Force layout recalculation by reading a layout property
						document.body.offsetHeight;
						// Double RAF ensures we run after the React render cycle
						requestAnimationFrame(() => {
							document.body.offsetHeight;
						});
					});
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
					const { preferences, sandboxPositions } = msg.payload;

					if (preferences.backgroundColor) {
						setBackgroundColor(preferences.backgroundColor);
					}
					if (preferences.backgroundPattern) {
						setPattern(preferences.backgroundPattern);
					}
					if (preferences.viewport) {
						setTransform(preferences.viewport);
					}

					if (sandboxPositions) {
						loadedPositionsRef.current = sandboxPositions;
					}
					break;
				}
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [sandboxes]);

	const buildCanvasContext = useCallback((options?: {
		selectedComponentId?: string;
		includePendingElement?: boolean;
	}) => {
		const includePendingElement = options?.includePendingElement !== false;
		const canvasConfig = window.CANVAS_CONFIG;
		const pendingElement = includePendingElement
			? pendingElementSelectionRef.current
			: null;
		const targetComponentId =
			options?.selectedComponentId || selectedSandboxId || pendingElement?.componentId;
		const selectedSandbox =
			(targetComponentId
				? sandboxes.find((sandbox) => sandbox.id === targetComponentId)
				: null) ||
			(pendingElement
				? sandboxes.find((sandbox) => sandbox.id === pendingElement.componentId)
				: null);
		const selectedComponent = selectedSandbox
			? {
				id: selectedSandbox.id,
				name: selectedSandbox.componentInput?.name,
				folderPath: selectedSandbox.componentInput?.folderPath,
				entryFile: selectedSandbox.componentInput?.entryFile,
			}
			: undefined;
		const selectedElement =
			pendingElement &&
				(!targetComponentId || pendingElement.componentId === targetComponentId)
				? {
					componentId: pendingElement.componentId,
					sourceLocation: pendingElement.sourceLocation,
				}
				: undefined;

		if (selectedElement && includePendingElement) {
			pendingElementSelectionRef.current = null;
		}

		return {
			canvasId: canvasConfig?.canvasId || "unknown",
			canvasName: canvasConfig?.canvasName,
			componentCount: sandboxes.length,
			components: [],
			selectedComponent,
			selectedElement,
		};
	}, [sandboxes, selectedSandboxId]);

	const sendCanvasContextToChat = useCallback(
		(
			userInput: string,
			autoSend: boolean,
			context: ReturnType<typeof buildCanvasContext>,
			images?: string[],
			imageMetadata?: {
				deviceMode: string;
				deviceViewport: { width: number; height: number };
			},
		) => {
			vscode.postMessage({
				type: "canvasAiChat",
				payload: {
					userInput,
					context,
					images,
					imageMetadata,
					autoSend,
				},
			});
		},
		[],
	);

	const getDeviceMetadataForComponent = useCallback(
		(componentId: string) => {
			const sandbox = sandboxes.find((item) => item.id === componentId);
			if (!sandbox) {
				return undefined;
			}

			const effectiveMode = sandbox.deviceMode ?? globalDeviceMode;
			const preset = DEVICE_PRESETS[effectiveMode];
			let viewportWidth: number;
			let viewportHeight: number;

			if (preset.width !== "auto" && preset.height !== "auto") {
				viewportWidth = preset.width;
				viewportHeight = preset.height;
			} else {
				const isFocused = focusedSandboxId === sandbox.id;
				if (isFocused) {
					const focused = getFocusedSandboxDimensions(
						viewport.width,
						viewport.height,
						DEFAULT_CONFIG,
					);
					viewportWidth = focused.width;
					viewportHeight = focused.height;
				} else {
					viewportWidth = DEFAULT_CONFIG.sandboxWidth;
					viewportHeight = DEFAULT_CONFIG.sandboxHeight;
				}
			}

			return {
				deviceMode: preset.label,
				deviceViewport: {
					width: Math.round(viewportWidth),
					height: Math.round(viewportHeight),
				},
			};
		},
		[focusedSandboxId, globalDeviceMode, sandboxes, viewport.height, viewport.width],
	);

	const captureComponentScreenshot = useCallback(async (componentId: string) => {
		const iframe = document.querySelector(
			`iframe[data-sandbox-id="${componentId}"]`,
		) as HTMLIFrameElement | null;
		const doc = iframe?.contentDocument;
		const target = doc?.documentElement;

		if (!iframe || !doc || !target) {
			return null;
		}

		try {
			const scrollWidth = Math.max(target.scrollWidth, target.clientWidth);
			const scrollHeight = Math.max(target.scrollHeight, target.clientHeight);
			const iframeWindow = iframe.contentWindow;
			const canvas = await html2canvas(target, {
				backgroundColor: null,
				logging: false,
				useCORS: true,
				width: scrollWidth,
				height: scrollHeight,
				windowWidth: scrollWidth,
				windowHeight: scrollHeight,
				scrollX: iframeWindow ? -iframeWindow.scrollX : 0,
				scrollY: iframeWindow ? -iframeWindow.scrollY : 0,
			});

			return canvas.toDataURL("image/png");
		} catch (error) {
			logger.warn("[Canvas] Screenshot capture failed", { componentId, error });
			return null;
		}
	}, []);

	// Handle messages from sandbox iframes (element inspection, errors, etc.)
	useEffect(() => {
		const handleIframeMessage = (event: MessageEvent) => {
			const data = event.data;
			if (!data || typeof data !== "object") return;

			// Handle element selection from inspect mode
			if (data.type === "roopik-element-selected") {
				const { componentId, element, screenshotRequestId } = data;
				pendingScreenshotRequestIdRef.current = screenshotRequestId ?? null;
				if (!screenshotRequestId) {
					pendingScreenshotRef.current = null;
				}
				// Check if we have source location info
				if (element?.sourceLocation) {
					// const { file, startLine } = element.sourceLocation;
					// logger.info('Element source location', { file, startLine });

					// Store the pending selection
					pendingElementSelectionRef.current = {
						componentId,
						sourceLocation: element.sourceLocation,
					};

					// Request files from extension - will receive componentFilesLoaded message
					vscode.postMessage({
						type: "loadComponentFiles",
						payload: { componentId },
					});
				}

				if (element?.boundingRect) {
					const iframe = document.querySelector(
						`iframe[data-sandbox-id="${componentId}"]`
					) as HTMLIFrameElement | null;
					if (iframe) {
						const iframeRect = iframe.getBoundingClientRect();
						const anchorX = iframeRect.left + element.boundingRect.x + element.boundingRect.width / 2;
						const anchorTop = iframeRect.top + element.boundingRect.y;
						const anchorBottom = anchorTop + element.boundingRect.height;
						setAiChatAnchor({
							x: anchorX,
							y: anchorBottom,
							top: anchorTop,
							bottom: anchorBottom,
							nonce: Date.now(),
						});
					}
				}
			}

			if (data.type === "roopik-screenshot-captured") {
				const { componentId, imageData, requestId, intent } = data;
				if (!componentId || !imageData) {
					return;
				}

				if (intent === "attach") {
					const context = buildCanvasContext({
						selectedComponentId: componentId,
						includePendingElement: false,
					});
					const imageMetadata = getDeviceMetadataForComponent(componentId);
					sendCanvasContextToChat(
						"Screenshot attached.",
						false,
						context,
						[imageData],
						imageMetadata,
					);
					return;
				}

				if (requestId && requestId === pendingScreenshotRequestIdRef.current) {
					pendingScreenshotRef.current = {
						componentId,
						imageData,
						metadata: getDeviceMetadataForComponent(componentId),
					};
				}
			}

			if (data.type === "roopik-screenshot-error") {
				logger.warn("[Canvas] Screenshot capture failed", data);
			}

			// Handle runtime errors from sandbox (from error boundary or window.onerror)
			if (data.type === "roopik-component-error" || data.type === "sandbox-error") {
				const { componentId, error, message } = data;
				logger.error("[Canvas] Component runtime error", { componentId, error, message });

				// Forward to extension host, which will call core's reportRuntimeError
				vscode.postMessage({
					type: "componentRuntimeError",
					payload: {
						componentId: componentId || "unknown",
						error: {
							message: error?.message || message || "Unknown runtime error",
							type: error?.type || "runtime",
							stack: error?.stack,
							source: error?.source,
							line: error?.line,
							column: error?.column,
							timestamp: Date.now()
						}
					}
				});
			}

			// Handle select mode: open source file in editor with selection
			if (data.type === "roopik-select-open-source") {
				const { sourceLocation, componentId } = data;
				if (sourceLocation?.file) {
					// Source file is relative (e.g., "index.tsx"), need to resolve to absolute
					// using the component's folderPath
					let absoluteFilePath = sourceLocation.file;
					const sandbox = sandboxes.find(s => s.id === componentId);
					if (sandbox?.componentInput?.folderPath && !sourceLocation.file.includes('/') && !sourceLocation.file.includes('\\')) {
						// Relative path - combine with folderPath
						absoluteFilePath = `${sandbox.componentInput.folderPath}/${sourceLocation.file}`;
					}

					vscode.postMessage({
						type: 'openFile',
						payload: {
							filePath: absoluteFilePath,
							line: sourceLocation.startLine || 1,
							column: sourceLocation.startCol || 1,
							endLine: sourceLocation.endLine,
							endColumn: sourceLocation.endCol
						}
					});
				}
			}

			// Handle select mode: open component in editor
			if (data.type === "roopik-select-open-component") {
				const { componentId } = data;
				const sandbox = sandboxes.find(s => s.id === componentId);
				if (sandbox?.componentInput?.folderPath && sandbox.componentInput.entryFile) {
					const filePath = `${sandbox.componentInput.folderPath}/${sandbox.componentInput.entryFile}`;
					vscode.postMessage({
						type: 'openFile',
						payload: {
							filePath,
							line: 1,
							column: 1
						}
					});
				}
			}

			// Handle select mode: ESC pressed, deselect
			if (data.type === "roopik-select-escape") {
				setIsSelectMode(false);
			}

			// Handle select mode: selection cleared (click outside elements)
			if (data.type === "roopik-select-cleared") {
				// Selection was cleared in the sandbox
			}
		};

		window.addEventListener("message", handleIframeMessage);
		return () => window.removeEventListener("message", handleIframeMessage);
	}, [buildCanvasContext, getDeviceMetadataForComponent, sendCanvasContextToChat]);

	useEffect(() => {
		window.__roopikRequestScreenshot = async (payload) => {
			if (!payload?.element) {
				window.postMessage(
					{
						type: "roopik-screenshot-error",
						componentId: payload?.componentId,
						requestId: payload?.requestId,
						message: "No element provided for capture",
					},
					"*",
				);
				return;
			}

			try {
				const element = payload.element;
				const doc = element.ownerDocument;
				const docEl = doc.documentElement;
				const isDocument = element === doc.body || element === docEl;
				const rect = element.getBoundingClientRect();
				const captureWidth = isDocument ? docEl.scrollWidth : element.scrollWidth || rect.width;
				const captureHeight = isDocument ? docEl.scrollHeight : element.scrollHeight || rect.height;
				const scale = window.devicePixelRatio || 1;
				const canvas = await html2canvas(element, {
					backgroundColor: null,
					// Silence html2canvas debug logs in the console.
					logging: false,
					scale,
					useCORS: true,
					width: captureWidth,
					height: captureHeight,
					windowWidth: Math.max(docEl.scrollWidth, docEl.clientWidth),
					windowHeight: Math.max(docEl.scrollHeight, docEl.clientHeight),
					scrollX: 0,
					scrollY: 0,
					...(isDocument
						? {}
						: {
							x: rect.left + window.scrollX,
							y: rect.top + window.scrollY,
						}),
				});
				const imageData = canvas.toDataURL("image/png");
				window.postMessage(
					{
						type: "roopik-screenshot-captured",
						componentId: payload.componentId,
						imageData,
						target: payload.target,
						requestId: payload.requestId,
						intent: payload.intent,
					},
					"*",
				);
			} catch (error) {
				window.postMessage(
					{
						type: "roopik-screenshot-error",
						componentId: payload.componentId,
						requestId: payload.requestId,
						message: error instanceof Error ? error.message : String(error),
					},
					"*",
				);
			}
		};

		return () => {
			delete window.__roopikRequestScreenshot;
		};
	}, []);

	// Notify extension that webview is ready
	useEffect(() => {
		vscode.postMessage({ type: "ready" });
	}, []);

	const handleAISubmit = useCallback(
		async (userInput: string, autoSend = true, includeScreenshot = false) => {
			const pendingElement = pendingElementSelectionRef.current;
			const targetComponentId = pendingElement?.componentId || selectedSandboxId || undefined;
			const context = buildCanvasContext();

			if (includeScreenshot && targetComponentId) {
				const imageData = await captureComponentScreenshot(targetComponentId);
				if (imageData) {
					sendCanvasContextToChat(userInput, autoSend, context, [imageData]);
					return;
				}
			}

			const images: string[] = [];
			const pendingScreenshot = pendingScreenshotRef.current;
			if (
				pendingScreenshot &&
				(context.selectedComponent?.id === pendingScreenshot.componentId ||
					context.selectedElement?.componentId === pendingScreenshot.componentId)
			) {
				images.push(pendingScreenshot.imageData);
				const imageMetadata =
					pendingScreenshot.metadata || getDeviceMetadataForComponent(pendingScreenshot.componentId);
				pendingScreenshotRef.current = null;
				pendingScreenshotRequestIdRef.current = null;
				sendCanvasContextToChat(
					userInput,
					autoSend,
					context,
					images.length ? images : undefined,
					imageMetadata,
				);
				return;
			}

			sendCanvasContextToChat(userInput, autoSend, context, images.length ? images : undefined);
		},
		[
			buildCanvasContext,
			captureComponentScreenshot,
			getDeviceMetadataForComponent,
			selectedSandboxId,
			sendCanvasContextToChat,
		],
	);

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
			return;
		}

		// Use longer delay to ensure DOM is fully updated
		// Also use requestAnimationFrame for smoother animation
		const timer = setTimeout(() => {
			fitAllSandboxes(sandboxes);
		}, 300);

		return () => clearTimeout(timer);
	}, [sandboxCount, sandboxes, focusedSandboxId, fitAllSandboxes]);

	// Focus on a single sandbox (double-click)
	// When focused, sandbox expands dynamically to fill most of the viewport
	// Double-click toggles: focus if not focused, unfocus if already focused
	const focusSandbox = useCallback(
		(sandboxId: string) => {
			if (focusedSandboxId === sandboxId) {
				// Already focused - unfocus and zoom out to see all
				setFocusedSandboxId(null);
				setSelectedSandboxId(null); // Also clear selection
				fitAllSandboxes(sandboxes);
				return;
			}

			const sandbox = sandboxes.find((s) => s.id === sandboxId);
			if (!sandbox) return;

			// Focus this sandbox and select it
			setFocusedSandboxId(sandboxId);
			setSelectedSandboxId(sandboxId);

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
		(sandboxList?: Sandbox[], autoFit: boolean = true) => {
			const current = sandboxList || sandboxes;
			const reorganized = reorganizeSandboxes(current, DEFAULT_CONFIG);
			setSandboxes(reorganized);

			if (autoFit) {
				setTimeout(() => {
					fitAllSandboxes(reorganized);
				}, 100);
			}
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
		// logger.info('Sandbox selected', { sandboxId });

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
		(sandboxId: string, deleteSourceCode = false) => {
			pendingBuildsRef.current.delete(sandboxId);

			if (selectedSandboxId === sandboxId) setSelectedSandboxId(null);
			if (focusedSandboxId === sandboxId) setFocusedSandboxId(null);

			// Notify extension to delete component from storage (Core)
			vscode.postMessage({
				type: "deleteComponent" as const,
				payload: {
					componentId: sandboxId,
					deleteSourceCode
				},
			});

			setSandboxes((prev) => {
				const remaining = prev.filter((s) => s.id !== sandboxId);
				if (remaining.length > 0) {
					// Use configuration constants to control post-delete behavior
					setTimeout(() => {
						// Only auto-reorganize/fit if not in focused mode
						if (!focusedSandboxIdRef.current) {
							if (AUTO_REORGANIZE_ON_DELETE) {
								// Reorganize to grid, optionally auto-fit based on config
								reorganizeToGrid(remaining, AUTO_FIT_ON_DELETE);
							} else if (AUTO_FIT_ON_DELETE) {
								// Just fit without reorganizing
								fitAllSandboxes(remaining);
							}
							// If both false, do nothing - maintain current layout and zoom
						}
						// If focused, don't auto-fit/reorganize - maintain current zoom
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
		// logger.info('Force rebuild sandbox', { sandboxId });

		// Update sandbox to building state
		setSandboxes((prev) =>
			prev.map((s) =>
				s.id === sandboxId
					? { ...s, buildStatus: "building" as const, buildError: undefined, bundleNonce: Date.now() }
					: s
			)
		);

		// Send rebuild request to extension
		vscode.postMessage({
			type: "rebuildComponent",
			payload: { componentId: sandboxId },
		});
	}, []);

	const handleSandboxShowCode = useCallback((sandboxId: string) => {
		const sandbox = sandboxes.find(s => s.id === sandboxId);
		if (!sandbox?.componentInput) {
			console.warn('[Canvas] Cannot show code: component input not found for', sandboxId);
			return;
		}

		const input = sandbox.componentInput;

		// Debug: log the componentInput structure
		// console.log('[Canvas] Component input:', {
		// 	id: input.id,
		// 	folderPath: input.folderPath,
		// 	entryFile: input.entryFile,
		// 	hasFiles: !!input.files,
		// 	filesCount: Object.keys(input.files || {}).length
		// });

		// Check if we have the required data
		if (!input.folderPath || !input.entryFile) {
			// console.warn('[Canvas] Cannot show code: missing folderPath or entryFile for', sandboxId);
			// console.warn('[Canvas] Component input data:', input);
			return;
		}

		// Construct the full file path from folderPath and entryFile
		const filePath = `${input.folderPath}/${input.entryFile}`;

		// console.log('[Canvas] Opening file:', filePath);

		// Send message to extension to open the file
		vscode.postMessage({
			type: 'openFile',
			payload: {
				filePath,
				line: 1,
				column: 1
			}
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
			if (e.key === "Delete" && selectedSandboxId) {
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
				if (isInspectMode) {
					setIsInspectMode(false);
					return;
				}
				if (focusedSandboxId) {
					// Exit focused mode - unfocus, unselect, and unzoom
					setFocusedSandboxId(null);
					setSelectedSandboxId(null);
					fitAllSandboxes(sandboxes);
				} else if (selectedSandboxId) {
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
		isInspectMode,
		handleResetView,
		fitAllSandboxes,
	]);

	// Window resize handler - update viewport dimensions
	useEffect(() => {
		const handleResize = () => {
			// Update viewport dimensions for dynamic focused sizing
			setViewport({
				width: window.innerWidth,
				height: window.innerHeight,
			});

			// DISABLED: Auto-refocus on resize was causing unwanted zoom changes
			// when resizing VS Code panels or opening split views
			// if (focusedSandboxId) {
			// 	setTimeout(() => {
			// 		focusSandbox(focusedSandboxId);
			// 	}, 100);
			// }
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [focusedSandboxId, focusSandbox]);

	// Show toast when device mode changes
	useEffect(() => {
		const preset = DEVICE_PRESETS[globalDeviceMode];
		if (preset.width === 'auto') {
			setToastMessage('Device: Auto (Responsive)');
		} else {
			setToastMessage(`Device: ${preset.label} (${preset.width}×${preset.height})`);
		}
	}, [globalDeviceMode]);


	// Snap mode change handler - auto-reorganize when switching to grid mode
	const handleSnapModeChange = useCallback(
		(mode: SnapMode) => {
			setSnapMode(mode);
			if (mode === "grid" && sandboxes.length > 0) {
				// console.log(
				// 	"[StatusPanel] Switching to Grid mode - reorganizing sandboxes"
				// );
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
		}
		// logger.info('Select mode toggled', { enabled: newState });
	}, [isSelectMode]);

	const handleInspectMode = useCallback(() => {
		const newState = !isInspectMode;
		setIsInspectMode(newState);
		if (newState) {
			setIsSelectMode(false);
		}
	}, [isInspectMode, sandboxes.length]);

	const handleAIChat = useCallback(() => {
		// logger.info('AI Chat toggled');
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

				// console.log(
				// 	`[DragDrop] Importing component: ${componentName} (${fileName})`
				// );

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
						{/* allow-any-unicode-next-line */}
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
					isSelectMode={isSelectMode}
					isInspectMode={isInspectMode}
					captureOnInspectSelect={AUTO_ATTACH_SCREENSHOT_ON_INSPECT}
					onTransformChange={setTransform}
					onSandboxClick={handleSandboxClick}
					onSandboxDoubleClick={focusSandbox}
					onSandboxUpdate={handleSandboxUpdate}
					onSandboxDelete={handleSandboxDelete}
					onSandboxShowCode={handleSandboxShowCode}
					onSandboxRebuild={handleSandboxRebuild}
					deleteSourceCodePref={deleteSourceCodePref}
					onDeleteSourceCodePrefChange={setDeleteSourceCodePref}
				onCanvasBackgroundClick={() => {
					// Clicking outside: unfocus and unselect
					if (focusedSandboxId) {
						setFocusedSandboxId(null);
						fitAllSandboxes(sandboxes);
					}
					setSelectedSandboxId(null);
				}}
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
				onAIChat={handleAIChat}
				onAISubmit={handleAISubmit}
				onScreenshotToggle={setIsChatScreenshotEnabled}
				screenshotEnabled={isChatScreenshotEnabled}
				isSelectMode={isSelectMode}
				isInspectMode={isInspectMode}
				openChatAt={aiChatAnchor}
				onChatAnchorConsumed={() => setAiChatAnchor(null)}
				onChatClosed={() => {
					// Unlock selected element in all sandboxes (but keep inspect mode active)
					sandboxes.forEach((sandbox) => {
						const iframe = document.querySelector(
							`iframe[data-sandbox-id="${sandbox.id}"]`
						) as HTMLIFrameElement | null;
						if (iframe?.contentWindow) {
							iframe.contentWindow.postMessage({
								type: 'roopik-unlock-selection'
							}, '*');
						}
					});
				}}
				onEscape={() => setIsInspectMode(false)}
			/>

			{/* Delete confirmation modal (triggered by Delete key) */}
			{pendingDeleteId && (
				<DeleteConfirmModal
					sandboxId={pendingDeleteId}
					initialDeleteSourceCode={deleteSourceCodePref}
					onDeleteSourceCodeChange={(value) => {
						setDeleteSourceCodePref(value);
					}}
					onConfirm={(deleteSourceCode) => {
						handleSandboxDelete(pendingDeleteId, deleteSourceCode);
						setPendingDeleteId(null);
					}}
					onCancel={() => setPendingDeleteId(null)}
				/>
			)}

			{/* Toast notification */}
			{toastMessage && (
				<Toast
					message={toastMessage}
					duration={1000}
					onClose={() => setToastMessage(null)}
				/>
			)}
		</div>
	);
}

export default App;
