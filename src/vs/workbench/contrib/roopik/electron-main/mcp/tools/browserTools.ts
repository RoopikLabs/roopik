/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Tools (Project Mode)
 *
 * MCP tools for browser interaction in Project Mode.
 * These give AI agents visual verification and DOM inspection capabilities.
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
		'rpk_screenshot',
		'[Roopik IDE] Capture a screenshot of the browser in Project Mode. Returns base64-encoded image. Use this for visual verification after making UI changes.',
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
								error: 'No browser is open. Start a project first with rpk_startProject.'
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
		'rpk_navigate',
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
								error: 'No browser is open. Start a project first with rpk_startProject.'
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
		'rpk_reload',
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
								error: 'No browser is open. Start a project first with rpk_startProject.'
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
		'rpk_executeScript',
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
								error: 'No browser is open. Start a project first with rpk_startProject.'
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
		'rpk_inspectElement',
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
								error: 'No browser is open. Start a project first with rpk_startProject.'
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

	console.log('[MCP] Registered 5 browser tools: rpk_screenshot, rpk_navigate, rpk_reload, rpk_executeScript, rpk_inspectElement');
}
