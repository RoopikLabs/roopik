/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Tools (Project Mode)
 *
 * MCP tools for browser interaction in Project Mode.
 * These give AI agents visual verification, DOM inspection, and debugging capabilities.
 *
 * Includes:
 * - Core browser tools: screenshot, navigate, reload, execute_script, inspect_element
 * - CDP tools: get_errors, get_console_logs (auto-attaches debugger when first used)
 */

import type { BrowserViewService } from '../../projectMode/browserViewService.js';
import type { IRoopikStorageService } from '../../../common/storage/storageService.js';

// ============================================================================
// CDP Types
// ============================================================================

interface ConsoleLog {
	id: string;
	timestamp: number;
	type: 'log' | 'debug' | 'info' | 'warn' | 'error' | 'dir' | 'dirxml' | 'table' | 'trace' | 'clear' | 'assert';
	message: string;
	args?: unknown[];
	location?: string;
	stackTrace?: { callFrames: Array<{ url: string; lineNumber: number; columnNumber: number; functionName: string }> };
}

interface NetworkRequest {
	id: string;
	requestId: string;
	timestamp: number;
	method: string;
	url: string;
	headers: Record<string, string>;
	postData?: string;
}

interface NetworkResponse {
	id: string;
	requestId: string;
	timestamp: number;
	status: number;
	statusText: string;
	url: string;
	headers: Record<string, string>;
	mimeType?: string;
	duration?: number;
}

interface CDPMonitor {
	browserViewId: number;
	consoleLogs: ConsoleLog[];
	networkRequests: NetworkRequest[];
	networkResponses: NetworkResponse[];
	requestStartTimes: Map<string, number>;
	cleanupFunctions: Array<() => void>;
}

// ============================================================================
// CDP Monitoring State
// ============================================================================

const cdpMonitors = new Map<number, CDPMonitor>();

async function ensureCDPMonitoring(
	browserViewId: number,
	browserViewService: BrowserViewService
): Promise<void> {
	// Clean up stale monitors
	for (const [monitoredId] of cdpMonitors) {
		if (monitoredId !== browserViewId) {
			cleanupCDPMonitoring(monitoredId);
		}
	}

	if (cdpMonitors.has(browserViewId)) {
		return;
	}

	const monitor: CDPMonitor = {
		browserViewId,
		consoleLogs: [],
		networkRequests: [],
		networkResponses: [],
		requestStartTimes: new Map(),
		cleanupFunctions: []
	};

	await browserViewService.attachDebugger(browserViewId);
	await browserViewService.sendCDPCommand(browserViewId, 'Runtime.enable');
	await browserViewService.sendCDPCommand(browserViewId, 'Network.enable');
	await browserViewService.sendCDPCommand(browserViewId, 'Page.enable');

	// Console logging
	const consoleCleanup = browserViewService.onCDPEvent(browserViewId, (method, params) => {
		if (method === 'Runtime.consoleAPICalled') {
			handleConsoleMessage(monitor, params as any);
		} else if (method === 'Runtime.exceptionThrown') {
			handleException(monitor, params as any);
		}
	});
	monitor.cleanupFunctions.push(consoleCleanup);

	// Network monitoring
	const networkCleanup = browserViewService.onCDPEvent(browserViewId, (method, params) => {
		if (method === 'Network.requestWillBeSent') {
			handleNetworkRequest(monitor, params as any);
		} else if (method === 'Network.responseReceived') {
			handleNetworkResponse(monitor, params as any);
		} else if (method === 'Network.loadingFailed') {
			handleNetworkFailure(monitor, params as any);
		}
	});
	monitor.cleanupFunctions.push(networkCleanup);

	cdpMonitors.set(browserViewId, monitor);
}

function handleConsoleMessage(monitor: CDPMonitor, params: {
	type: string;
	args: Array<{ type: string; value?: any; unserializableValue?: string; description?: string }>;
	timestamp: number;
	stackTrace?: { callFrames: Array<{ url: string; lineNumber: number; columnNumber: number; functionName: string }> };
}): void {
	const { type, args, timestamp, stackTrace } = params;

	const messages = args.map(arg => {
		if (arg.value !== undefined) {
			return typeof arg.value === 'object' ? JSON.stringify(arg.value) : String(arg.value);
		}
		if (arg.unserializableValue) return arg.unserializableValue;
		if (arg.description) return arg.description;
		return '[Object]';
	});

	const location = stackTrace?.callFrames?.[0]
		? `${stackTrace.callFrames[0].url}:${stackTrace.callFrames[0].lineNumber}:${stackTrace.callFrames[0].columnNumber}`
		: undefined;

	const log: ConsoleLog = {
		id: `console-${Date.now()}-${Math.random()}`,
		timestamp: timestamp * 1000,
		type: type as ConsoleLog['type'],
		message: messages.join(' '),
		args: args.map(arg => arg.value),
		location,
		stackTrace
	};

	monitor.consoleLogs.push(log);
	if (monitor.consoleLogs.length > 1000) {
		monitor.consoleLogs.shift();
	}
}

function handleException(monitor: CDPMonitor, params: {
	timestamp: number;
	exceptionDetails: {
		text: string;
		lineNumber?: number;
		columnNumber?: number;
		url?: string;
		stackTrace?: { callFrames: Array<{ url: string; lineNumber: number; columnNumber: number; functionName: string }> };
	};
}): void {
	const { timestamp, exceptionDetails } = params;

	const location = exceptionDetails.url && exceptionDetails.lineNumber !== undefined
		? `${exceptionDetails.url}:${exceptionDetails.lineNumber}:${exceptionDetails.columnNumber}`
		: undefined;

	const log: ConsoleLog = {
		id: `exception-${Date.now()}-${Math.random()}`,
		timestamp: timestamp * 1000,
		type: 'error',
		message: exceptionDetails.text,
		location,
		stackTrace: exceptionDetails.stackTrace
	};

	monitor.consoleLogs.push(log);
	if (monitor.consoleLogs.length > 1000) {
		monitor.consoleLogs.shift();
	}
}

function handleNetworkRequest(monitor: CDPMonitor, params: {
	requestId: string;
	request: { url: string; method: string; headers: Record<string, string>; postData?: string };
	timestamp: number;
}): void {
	const { requestId, request, timestamp } = params;

	const networkRequest: NetworkRequest = {
		id: `req-${Date.now()}-${Math.random()}`,
		requestId,
		timestamp: timestamp * 1000,
		method: request.method,
		url: request.url,
		headers: request.headers || {},
		postData: request.postData
	};

	monitor.networkRequests.push(networkRequest);
	monitor.requestStartTimes.set(requestId, timestamp);

	if (monitor.networkRequests.length > 500) {
		monitor.networkRequests.shift();
	}
}

function handleNetworkResponse(monitor: CDPMonitor, params: {
	requestId: string;
	response: { url: string; status: number; statusText: string; headers: Record<string, string>; mimeType?: string };
	timestamp: number;
}): void {
	const { requestId, response, timestamp } = params;

	const startTime = monitor.requestStartTimes.get(requestId);
	const duration = startTime ? (timestamp - startTime) * 1000 : undefined;

	const networkResponse: NetworkResponse = {
		id: `res-${Date.now()}-${Math.random()}`,
		requestId,
		timestamp: timestamp * 1000,
		status: response.status,
		statusText: response.statusText,
		url: response.url,
		headers: response.headers || {},
		mimeType: response.mimeType,
		duration
	};

	monitor.networkResponses.push(networkResponse);
	if (monitor.networkResponses.length > 500) {
		monitor.networkResponses.shift();
	}
}

function handleNetworkFailure(monitor: CDPMonitor, params: {
	requestId: string;
	timestamp: number;
	errorText: string;
}): void {
	const { requestId, timestamp, errorText } = params;

	const networkResponse: NetworkResponse = {
		id: `fail-${Date.now()}-${Math.random()}`,
		requestId,
		timestamp: timestamp * 1000,
		status: 0,
		statusText: errorText,
		url: '',
		headers: {}
	};

	monitor.networkResponses.push(networkResponse);
	if (monitor.networkResponses.length > 500) {
		monitor.networkResponses.shift();
	}
}

function getMonitorOrThrow(browserViewId: number | undefined): CDPMonitor {
	if (browserViewId === undefined) {
		throw new Error('No browser is open. Start a project first with project_start.');
	}

	const monitor = cdpMonitors.get(browserViewId);
	if (!monitor) {
		throw new Error('CDP monitoring not initialized. Try running the command again.');
	}

	return monitor;
}

// ============================================================================
// CDP Cleanup (exported for external use)
// ============================================================================

export function cleanupCDPMonitoring(browserViewId: number): void {
	const monitor = cdpMonitors.get(browserViewId);
	if (monitor) {
		for (const cleanup of monitor.cleanupFunctions) {
			try {
				cleanup();
			} catch (e) {
				console.error('[Browser Tools] Error during CDP cleanup:', e);
			}
		}
		cdpMonitors.delete(browserViewId);
	}
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register all browser-related MCP tools
 *
 * @param server - McpServer instance (dynamically imported)
 * @param z - Zod validation library (dynamically imported)
 * @param browserViewService - BrowserView service instance
 * @param storageService - Storage service instance (for workspace path)
 */
export function registerBrowserTools(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	server: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	z: any,
	browserViewService: BrowserViewService,
	storageService: IRoopikStorageService
): void {

	// ============================================================================
	// CORE BROWSER TOOLS (12)
	// ============================================================================

	// --------------------------------------------------------------
	// TOOL: Open Browser
	// --------------------------------------------------------------
	server.tool(
		'browser_open',
		'[Roopik IDE] Open the browser or navigate to a URL. If browser is not open, opens it with proper editor UI. If URL is provided, navigates to that URL after opening.',
		{
			url: z.string().optional().describe('URL to navigate to after browser opens (optional)')
		},
		async ({ url }: { url?: string }) => {
			try {
				// Check if browser is already open
				const browserViewId = browserViewService.getActiveBrowserViewId();

				if (browserViewId === undefined) {
					// Browser not open - fire event for renderer to open it with proper UI
					// The renderer's projectModeContribution listens and opens browser editor
					// URL normalization is done in browserViewService.navigate()
					browserViewService.requestBrowserOpen(url);

					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: true,
								message: 'Browser open request sent. The browser will open shortly.',
								url: url || undefined
							})
						}]
					};
				}

				// Browser is already open - navigate if URL provided
				// URL normalization is done in browserViewService.navigate()
				if (url) {
					await browserViewService.navigate(browserViewId, url);
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: true,
								browserViewId,
								url,
								message: `Navigated to ${url}`
							})
						}]
					};
				}

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							browserViewId,
							message: 'Browser is already open'
						})
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Take Screenshot (with viewport metadata)
	// --------------------------------------------------------------
	server.tool(
		'browser_screenshot',
		'[Roopik IDE] Capture a screenshot of the browser. Returns base64-encoded image with viewport metadata (width, height, devicePixelRatio) for pixel-perfect clicking with browser_action_input.',
		{},
		async () => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				if (browserViewId === undefined) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: 'No browser is open. Start a project first with project_start.'
							})
						}],
						isError: true
					};
				}

				const result = await browserViewService.takeScreenshotWithMetadata(browserViewId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							image: result.image,
							format: 'data-url',
							viewport: {
								width: result.width,
								height: result.height,
								devicePixelRatio: result.devicePixelRatio
							}
						})
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Close Browser
	// --------------------------------------------------------------
	server.tool(
		'browser_close',
		'[Roopik IDE] Close the browser view. Use this when done with browser testing or to free resources.',
		{},
		async () => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				if (browserViewId === undefined) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: true,
								message: 'No browser is open'
							})
						}]
					};
				}

				await browserViewService.destroyBrowserView(browserViewId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							message: 'Browser closed'
						})
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Browser Action (click, type, press, scroll, hover, drag)
	// --------------------------------------------------------------
	server.tool(
		'browser_action_input',
		`[Roopik IDE] Perform native input events in the browser. Supports click, right_click, double_click, hover, drag, type, press, scroll.

Coordinate format: 'x,y@WIDTHxHEIGHT' where WIDTH/HEIGHT are from browser_screenshot viewport.
Example: '450,203@900x600' means click at (450,203) on a 900x600 viewport.

Actions:
- click/right_click/double_click/hover: requires 'coordinate'
- drag: requires 'coordinate' (start) + 'deltaX'/'deltaY' (offset to end)
- type: requires 'text'
- press: requires 'key' (e.g., 'Enter', 'Escape', 'Tab'), optional 'modifiers' (['ctrl', 'shift'])
- scroll: requires 'deltaX' and/or 'deltaY' (negative = up/left)`,
		{
			action: z.enum(['click', 'right_click', 'double_click', 'hover', 'drag', 'type', 'press', 'scroll'])
				.describe('The action to perform'),
			coordinate: z.string().optional()
				.describe("Coordinate string: 'x,y' or 'x,y@WIDTHxHEIGHT' for scaled coordinates"),
			text: z.string().optional()
				.describe("Text to type (for 'type' action)"),
			key: z.string().optional()
				.describe("Key to press (for 'press' action): Enter, Escape, Tab, ArrowDown, etc."),
			modifiers: z.array(z.string()).optional()
				.describe("Modifier keys (for 'press' action): ['ctrl', 'shift', 'alt', 'meta']"),
			deltaX: z.number().optional()
				.describe("Horizontal offset for drag/scroll (negative = left)"),
			deltaY: z.number().optional()
				.describe("Vertical offset for drag/scroll (negative = up)")
		},
		async (args: {
			action: string;
			coordinate?: string;
			text?: string;
			key?: string;
			modifiers?: string[];
			deltaX?: number;
			deltaY?: number;
		}) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				if (browserViewId === undefined) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: 'No browser is open. Start a project first with project_start.'
							})
						}],
						isError: true
					};
				}

				const { action, coordinate, text, key, modifiers, deltaX, deltaY } = args;

				// Parse coordinate string: 'x,y@WIDTHxHEIGHT'
				let x = 0, y = 0, refWidth: number | undefined, refHeight: number | undefined;

				if (coordinate) {
					const match = coordinate.match(/^(\d+),(\d+)(?:@(\d+)x(\d+))?$/);
					if (!match) {
						return {
							content: [{
								type: 'text' as const,
								text: JSON.stringify({
									success: false,
									isError: true,
									error: `Invalid coordinate format: '${coordinate}'. Expected 'x,y' or 'x,y@WIDTHxHEIGHT'`
								})
							}],
							isError: true
						};
					}
					x = parseInt(match[1], 10);
					y = parseInt(match[2], 10);
					if (match[3] && match[4]) {
						refWidth = parseInt(match[3], 10);
						refHeight = parseInt(match[4], 10);
					}
				}

				let resultData: Record<string, unknown> = { action };

				switch (action) {
					case 'click':
					case 'right_click':
					case 'double_click':
					case 'hover':
						if (!coordinate) {
							return {
								content: [{
									type: 'text' as const,
									text: JSON.stringify({
										success: false,
										isError: true,
										error: `'${action}' requires 'coordinate' parameter`
									})
								}],
								isError: true
							};
						}
						await browserViewService.sendMouseEvent(
							browserViewId,
							action as 'click' | 'right_click' | 'double_click' | 'hover',
							x, y, refWidth, refHeight
						);
						resultData = { action, coordinate, x, y, message: `${action} at (${x}, ${y})` };
						break;

					case 'drag':
						if (!coordinate || deltaX === undefined || deltaY === undefined) {
							return {
								content: [{
									type: 'text' as const,
									text: JSON.stringify({
										success: false,
										isError: true,
										error: "'drag' requires 'coordinate' (start) and 'deltaX'/'deltaY' (offset)"
									})
								}],
								isError: true
							};
						}
						await browserViewService.sendDragEvent(
							browserViewId,
							x, y, x + deltaX, y + deltaY,
							refWidth, refHeight
						);
						resultData = { action, from: { x, y }, to: { x: x + deltaX, y: y + deltaY }, message: 'Drag completed' };
						break;

					case 'type':
						if (!text) {
							return {
								content: [{
									type: 'text' as const,
									text: JSON.stringify({
										success: false,
										isError: true,
										error: "'type' requires 'text' parameter"
									})
								}],
								isError: true
							};
						}
						await browserViewService.sendTypeEvent(browserViewId, text);
						resultData = { action, textLength: text.length, message: `Typed ${text.length} characters` };
						break;

					case 'press':
						if (!key) {
							return {
								content: [{
									type: 'text' as const,
									text: JSON.stringify({
										success: false,
										isError: true,
										error: "'press' requires 'key' parameter"
									})
								}],
								isError: true
							};
						}
						await browserViewService.sendKeyEvent(browserViewId, key, modifiers);
						resultData = { action, key, modifiers, message: `Pressed ${key}` };
						break;

					case 'scroll':
						if (deltaX === undefined && deltaY === undefined) {
							return {
								content: [{
									type: 'text' as const,
									text: JSON.stringify({
										success: false,
										isError: true,
										error: "'scroll' requires 'deltaX' and/or 'deltaY' parameters"
									})
								}],
								isError: true
							};
						}
						await browserViewService.sendScrollEvent(
							browserViewId,
							deltaX ?? 0,
							deltaY ?? 0,
							coordinate ? x : undefined,
							coordinate ? y : undefined
						);
						resultData = { action, deltaX: deltaX ?? 0, deltaY: deltaY ?? 0, message: 'Scrolled' };
						break;

					default:
						return {
							content: [{
								type: 'text' as const,
								text: JSON.stringify({
									success: false,
									isError: true,
									error: `Unknown action: '${action}'`
								})
							}],
							isError: true
						};
				}

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							...resultData
						})
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Navigate
	// --------------------------------------------------------------
	server.tool(
		'browser_navigate',
		'[Roopik IDE] Navigate the browser to a URL. Use this to load specific pages in the project (e.g., /login, /dashboard) or external URLs.',
		{
			url: z.string().describe('The URL to navigate to (e.g., http://localhost:3000/login)')
		},
		async ({ url }: { url: string }) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				if (browserViewId === undefined) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: 'No browser is open. Start a project first with project_start.'
							})
						}],
						isError: true
					};
				}

				// URL normalization is done in browserViewService.navigate()
				await browserViewService.navigate(browserViewId, url);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							url,
							message: `Navigated to ${url}`
						})
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage,
							url
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Reload Page
	// --------------------------------------------------------------
	server.tool(
		'browser_reload',
		'[Roopik IDE] Reload the current page in the browser. Use ignoreCache=true for hard reload after changing assets.',
		{
			ignoreCache: z.boolean().optional().describe('If true, clears cache before reloading (hard reload)')
		},
		async ({ ignoreCache }: { ignoreCache?: boolean }) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				if (browserViewId === undefined) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: 'No browser is open. Start a project first with project_start.'
							})
						}],
						isError: true
					};
				}

				await browserViewService.reload(browserViewId, ignoreCache);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							hardReload: ignoreCache || false,
							message: ignoreCache ? 'Page hard-reloaded (cache cleared)' : 'Page reloaded'
						})
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Execute JavaScript
	// --------------------------------------------------------------
	server.tool(
		'browser_execute_script',
		'[Roopik IDE] Execute JavaScript in the browser context. Use for DOM queries, checking state, clicking elements, or any browser-side logic. Returns the result.',
		{
			script: z.string().describe('JavaScript code to execute (e.g., "document.querySelector(\'.btn\').click()")')
		},
		async ({ script }: { script: string }) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				if (browserViewId === undefined) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: 'No browser is open. Start a project first with project_start.'
							})
						}],
						isError: true
					};
				}

				const result = await browserViewService.executeScript(browserViewId, script);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							result
						})
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Inspect Element Styles
	// --------------------------------------------------------------
	server.tool(
		'browser_inspect_element',
		'[Roopik IDE] Deep CSS inspection for an element. Returns matched CSS rules with source file locations (file:line:column), computed styles, and specificity. This is THE MOAT - precise CSS context with source maps for accurate edits.',
		{
			selector: z.string().describe('CSS selector to find element (e.g., ".btn-primary", "#header")'),
			includeInherited: z.boolean().optional().describe('Include inherited styles from parents (default: true)')
		},
		async ({ selector, includeInherited }: { selector: string; includeInherited?: boolean }) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				if (browserViewId === undefined) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: 'No browser is open. Start a project first with project_start.'
							})
						}],
						isError: true
					};
				}

				const workspacePath = storageService.getWorkspacePath();

				const result = await browserViewService.getElementStyles({
					browserViewId,
					target: selector,
					projectRoot: workspacePath,
					includeUserAgent: false,
					includeInherited: includeInherited ?? true
				});

				if (!result.success || !result.data) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: result.error || 'Element not found',
								selector
							})
						}],
						isError: true
					};
				}

				const data = result.data;

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							selector,
							element: {
								tag: data.tagName,
								classes: data.classes,
								componentName: data.componentName,
								componentSource: data.htmlSource
							},
							matchedRules: data.matchedRules?.map((rule: import('../../../common/cssResolvers/types.js').MatchedCSSRule) => ({
								selector: rule.selector,
								file: rule.file,
								location: rule.location,
								properties: rule.properties,
								specificity: rule.specificity,
								origin: rule.origin
							})),
							inlineStyles: data.inlineStyles,
							inheritedStyles: data.inheritedStyles,
							properties: data.properties,
							cssInJs: data.cssInJs
						})
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage,
							selector
						})
					}],
					isError: true
				};
			}
		}
	);

	// ============================================================================
	// CDP TOOLS (2) - Auto-attaches debugger when first used
	// ============================================================================

	// --------------------------------------------------------------
	// TOOL: Get Errors (Unified - Console + Network)
	// --------------------------------------------------------------
	server.tool(
		'browser_get_errors',
		'[Roopik IDE] Get all errors from the browser: console errors (JavaScript exceptions, console.error) AND failed network requests (4xx, 5xx, network failures). This is the primary debugging tool - shows what is broken.',
		{
			limit: z.number().optional().describe('Maximum errors to return (default: 50)')
		},
		async ({ limit }: { limit?: number }) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				await ensureCDPMonitoring(browserViewId!, browserViewService);

				const monitor = getMonitorOrThrow(browserViewId);
				const maxErrors = Math.min(limit || 50, 200);

				// Get console errors (error type only)
				const consoleErrors = monitor.consoleLogs
					.filter(log => log.type === 'error')
					.slice(-maxErrors)
					.map(log => ({
						source: 'console',
						type: 'error',
						message: log.message,
						location: log.location,
						timestamp: log.timestamp
					}));

				// Get failed network requests (4xx, 5xx, or status 0)
				const networkErrors = monitor.networkResponses
					.filter(res => res.status >= 400 || res.status === 0)
					.slice(-maxErrors)
					.map(res => {
						const request = monitor.networkRequests.find(req => req.requestId === res.requestId);
						return {
							source: 'network',
							type: res.status === 0 ? 'network_failure' : `http_${res.status}`,
							message: res.status === 0 ? res.statusText : `${res.status} ${res.statusText}`,
							url: res.url || request?.url,
							method: request?.method,
							timestamp: res.timestamp
						};
					});

				// Combine and sort by timestamp (most recent first)
				const allErrors = [...consoleErrors, ...networkErrors]
					.sort((a, b) => b.timestamp - a.timestamp)
					.slice(0, maxErrors);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							errorCount: allErrors.length,
							consoleErrorCount: consoleErrors.length,
							networkErrorCount: networkErrors.length,
							errors: allErrors
						}, null, 2)
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Get Console Logs (All types)
	// --------------------------------------------------------------
	server.tool(
		'browser_get_console_logs',
		'[Roopik IDE] Get console output from the browser (console.log, warn, error, etc.). Use type filter to focus on specific log types. For errors only, prefer browser_get_errors.',
		{
			limit: z.number().optional().describe('Maximum logs to return (default: 50)'),
			type: z.enum(['log', 'debug', 'info', 'warn', 'error']).optional().describe('Filter by log type')
		},
		async ({ limit, type }: { limit?: number; type?: ConsoleLog['type'] }) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				await ensureCDPMonitoring(browserViewId!, browserViewService);

				const monitor = getMonitorOrThrow(browserViewId);

				let logs = monitor.consoleLogs;
				if (type) {
					logs = logs.filter(log => log.type === type);
				}

				const maxLogs = Math.min(limit || 50, 500);
				const result = logs.slice(-maxLogs).reverse();

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							count: result.length,
							total: logs.length,
							logs: result.map(log => ({
								type: log.type,
								message: log.message,
								location: log.location,
								timestamp: log.timestamp
							}))
						}, null, 2)
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Get Performance Metrics
	// --------------------------------------------------------------
	server.tool(
		'browser_get_performance',
		'[Roopik IDE] Get performance metrics from the browser including Web Vitals (LCP, CLS) and runtime metrics (JS heap, DOM nodes, layout count). Uses Chrome DevTools Protocol for accurate measurements.',
		{},
		async () => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				if (browserViewId === undefined) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: 'No browser is open. Start a project first with project_start.'
							})
						}],
						isError: true
					};
				}

				// Ensure CDP is attached
				await browserViewService.attachDebugger(browserViewId);

				// Get performance metrics via CDP
				const metricsResult = await browserViewService.sendCDPCommand(browserViewId, 'Performance.getMetrics') as { metrics: Array<{ name: string; value: number }> };

				// Get Web Vitals via script injection
				const webVitalsScript = `
					(function() {
						const result = {};

						// LCP (Largest Contentful Paint)
						if (window.PerformanceObserver) {
							const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
							if (lcpEntries.length > 0) {
								result.lcp = lcpEntries[lcpEntries.length - 1].startTime;
							}
						}

						// CLS (Cumulative Layout Shift)
						const layoutShiftEntries = performance.getEntriesByType('layout-shift');
						if (layoutShiftEntries.length > 0) {
							result.cls = layoutShiftEntries.reduce((sum, entry) => sum + (entry.hadRecentInput ? 0 : entry.value), 0);
						}

						// FCP (First Contentful Paint)
						const fcpEntries = performance.getEntriesByType('paint').filter(e => e.name === 'first-contentful-paint');
						if (fcpEntries.length > 0) {
							result.fcp = fcpEntries[0].startTime;
						}

						// Navigation timing
						const nav = performance.getEntriesByType('navigation')[0];
						if (nav) {
							result.ttfb = nav.responseStart;
							result.domContentLoaded = nav.domContentLoadedEventEnd;
							result.load = nav.loadEventEnd;
						}

						return result;
					})()
				`;

				const webVitals = await browserViewService.executeScript(browserViewId, webVitalsScript);

				// Format metrics
				const metrics: Record<string, number> = {};
				if (metricsResult?.metrics) {
					for (const metric of metricsResult.metrics) {
						metrics[metric.name] = metric.value;
					}
				}

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							webVitals: webVitals || {},
							runtimeMetrics: {
								jsHeapUsedSize: metrics['JSHeapUsedSize'],
								jsHeapTotalSize: metrics['JSHeapTotalSize'],
								domNodes: metrics['Nodes'],
								layoutCount: metrics['LayoutCount'],
								recalcStyleCount: metrics['RecalcStyleCount'],
								layoutDuration: metrics['LayoutDuration'],
								recalcStyleDuration: metrics['RecalcStyleDuration'],
								scriptDuration: metrics['ScriptDuration'],
								taskDuration: metrics['TaskDuration']
							}
						}, null, 2)
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Get CDP Info
	// --------------------------------------------------------------
	server.tool(
		'browser_get_cdp_info',
		'[Roopik IDE] Get information about browser state and available Roopik tools for browser automation. Returns current URL, dev server status, and list of available browser tools.',
		{},
		async () => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();

				// Get current URL if browser is open
				let currentUrl: string | undefined;
				let devServerRunning = false;

				if (browserViewId !== undefined) {
					currentUrl = await browserViewService.executeScript(browserViewId, 'window.location.href') as string;
					devServerRunning = true;
				}

				const availableTools = [
					'browser_open',
					'browser_close',
					'browser_action_input',
					'browser_navigate',
					'browser_reload',
					'browser_screenshot',
					'browser_execute_script',
					'browser_inspect_element',
					'browser_get_errors',
					'browser_get_console_logs',
					'browser_get_performance',
					'browser_get_cdp_info'
				];

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							browserOpen: browserViewId !== undefined,
							browserViewId,
							currentUrl,
							devServerRunning,
							availableTools,
							message: browserViewId !== undefined
								? `Browser is open at ${currentUrl}`
								: 'No browser is currently open. Use browser_open or project_start to open one.'
						}, null, 2)
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	console.log('[MCP] Registered 12 browser tools: browser_open, browser_screenshot, browser_close, browser_action_input, browser_navigate, browser_reload, browser_execute_script, browser_inspect_element, browser_get_errors, browser_get_console_logs, browser_get_performance, browser_get_cdp_info');
}
