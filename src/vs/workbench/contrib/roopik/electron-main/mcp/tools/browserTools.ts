/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Tools (Project Mode)
 *
 * MCP tools for browser navigation, screenshots, and page interaction.
 * These tools are part of Project Mode - giving AI agents eyes to see results.
 */

import type { BrowserViewService } from '../../projectMode/browserViewService.js';
import type { IRoopikStorageService } from '../../../common/storage/storageService.js';

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

	// --------------------------------------------------------------
	// TOOL: Take Screenshot
	// --------------------------------------------------------------
	server.tool(
		'roopik_takeScreenshot',
		'Capture a screenshot of the active browser view as a base64-encoded image. Works on the currently open browser (requires a running project).',
		{},
		async () => {
			try {
				// Auto-resolve active browser view
				const browserViewId = browserViewService.getActiveBrowserViewId();
				if (browserViewId === undefined) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: 'No browser is currently open. Start a project first with roopik_startProject.'
							})
						}],
						isError: true
					};
				}

				const base64Image = await browserViewService.takeScreenshot(browserViewId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							image: base64Image,
							format: 'data-url'
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
		'roopik_navigate',
		'Navigate the active browser to a URL. Use this to load a specific page or dev server.',
		{
			url: z.string().describe('The URL to navigate to (e.g., http://localhost:3000)')
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
								error: 'No browser is currently open. Start a project first with roopik_startProject.'
							})
						}],
						isError: true
					};
				}

				await browserViewService.navigate(browserViewId, url);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							url
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
		'roopik_reload',
		'Reload the current page in the active browser. Optionally clear cache for hard reload.',
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
								error: 'No browser is currently open. Start a project first with roopik_startProject.'
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
							ignoreCache: ignoreCache || false
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
	// TOOL: Get Current URL
	// --------------------------------------------------------------
	server.tool(
		'roopik_getCurrentUrl',
		'Get the current URL and navigation state of the active browser.',
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
								error: 'No browser is currently open. Start a project first with roopik_startProject.'
							})
						}],
						isError: true
					};
				}

				const navState = await browserViewService.getNavigationState(browserViewId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							url: navState.url,
							title: navState.title,
							isLoading: navState.isLoading,
							canGoBack: navState.canGoBack,
							canGoForward: navState.canGoForward,
							lastError: navState.lastError
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
	// TOOL: Go Back
	// --------------------------------------------------------------
	server.tool(
		'roopik_goBack',
		'Navigate back in browser history.',
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
								error: 'No browser is currently open. Start a project first with roopik_startProject.'
							})
						}],
						isError: true
					};
				}

				await browserViewService.goBack(browserViewId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true
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
	// TOOL: Go Forward
	// --------------------------------------------------------------
	server.tool(
		'roopik_goForward',
		'Navigate forward in browser history.',
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
								error: 'No browser is currently open. Start a project first with roopik_startProject.'
							})
						}],
						isError: true
					};
				}

				await browserViewService.goForward(browserViewId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true
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
	// TOOL: Stop Loading
	// --------------------------------------------------------------
	server.tool(
		'roopik_stopLoading',
		'Stop the current page from loading.',
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
								error: 'No browser is currently open. Start a project first with roopik_startProject.'
							})
						}],
						isError: true
					};
				}

				await browserViewService.stop(browserViewId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true
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
		'roopik_executeScript',
		'Execute JavaScript in the browser context and return the result. Useful for querying DOM, checking state, or running custom logic.',
		{
			script: z.string().describe('JavaScript code to execute')
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
								error: 'No browser is currently open. Start a project first with roopik_startProject.'
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
	// TOOL: Get Page HTML
	// --------------------------------------------------------------
	server.tool(
		'roopik_getPageHTML',
		'Get the complete HTML of the current page (document.documentElement.outerHTML).',
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
								error: 'No browser is currently open. Start a project first with roopik_startProject.'
							})
						}],
						isError: true
					};
				}

				const html = await browserViewService.getPageHTML(browserViewId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							html
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
		'roopik_inspectElement',
		'Get deep CSS inspection for an element including resolved styles, source file locations with line:column, computed values, and overridden properties. This is THE MOAT - unique Roopik capability that gives AI precise CSS context with source maps.',
		{
			selector: z.string().describe('CSS selector to find element (e.g., ".btn-primary")'),
			includeUserAgent: z.boolean().optional().describe('Include browser default styles (default: false)'),
			includeInherited: z.boolean().optional().describe('Include inherited styles from parents (default: true)')
		},
		async ({ selector, includeUserAgent, includeInherited }: { selector: string; includeUserAgent?: boolean; includeInherited?: boolean }) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				if (browserViewId === undefined) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: 'No browser is currently open. Start a project first with roopik_startProject.'
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
					includeUserAgent: includeUserAgent ?? false,
					includeInherited: includeInherited ?? true
				});

				if (!result.success || !result.data) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: result.error || 'Failed to inspect element',
								selector
							})
						}],
						isError: true
					};
				}

				const data = result.data;

				// Return rich CSS context with source file locations
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
							cssInJs: data.cssInJs,
							stats: result.diagnostics
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

	console.log('[MCP] Registered 10 browser tools (all auto-resolve active browser - no browserViewId needed)');
}
