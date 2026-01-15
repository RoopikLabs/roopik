/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Source Tracking Injector
 *
 * Injects data-roopik-source attributes into JSX/HTML elements during build.
 * This enables click-to-source functionality in the canvas sandbox.
 *
 * Supports all frameworks: React, Vue, Svelte, HTML
 *
 * Strategy for React/TSX:
 * - PRIMARY: Babel AST transformation (accurate, handles TypeScript correctly)
 * - FALLBACK: Regex-based transformation (when Babel fails or unavailable)
 *
 * Strategy for other frameworks:
 * - Regex-based transformation with TypeScript type context detection
 *
 * Attributes injected:
 * - data-roopik-source: "file:startLine:startCol:endLine:endCol"
 * - data-roopik-component: tag name (div, Button, etc.)
 * - data-roopik-parent: DISABLED (using CSS selectors instead)
 */

import { BaseInjector, InjectorContext } from './types.js';
import { transformCode, ParseOptions } from './sourceTrackingCore.js';

// Import Babel statically - this ensures it's bundled/resolved correctly
// eslint-disable-next-line local/code-amd-node-module
import * as babelCoreModule from '@babel/core';

/**
 * Framework-specific configuration for source tracking
 */
interface FrameworkConfig {
	/** File extensions to process */
	extensions: string[];
	/** Tags to skip (e.g., script, style for HTML) */
	skipTags: string[];
	/** Check for script/style context */
	checkScriptStyle: boolean;
	/** Use Babel AST transformation (more accurate for JSX/TSX) */
	useBabelAST: boolean;
}

const FRAMEWORK_CONFIGS: Record<string, FrameworkConfig> = {
	react: {
		extensions: ['.jsx', '.tsx'],
		skipTags: [],
		checkScriptStyle: false,
		useBabelAST: true // PRIMARY: Babel AST for React (handles TypeScript correctly)
	},
	vue: {
		extensions: ['.vue'],
		skipTags: ['script', 'style'],
		checkScriptStyle: false,
		useBabelAST: false
	},
	svelte: {
		extensions: ['.svelte'],
		skipTags: ['script', 'style'],
		checkScriptStyle: false,
		useBabelAST: false
	},
	html: {
		extensions: ['.html', '.htm'],
		skipTags: ['script', 'style', 'head', 'meta', 'link'],
		checkScriptStyle: true,
		useBabelAST: false
	},
	// Solid and Preact use JSX like React
	solid: {
		extensions: ['.jsx', '.tsx'],
		skipTags: [],
		checkScriptStyle: false,
		useBabelAST: true // Solid also uses JSX/TSX
	},
	preact: {
		extensions: ['.jsx', '.tsx'],
		skipTags: [],
		checkScriptStyle: false,
		useBabelAST: true // Preact also uses JSX/TSX
	}
};

/**
 * Babel core interface (minimal types for our usage)
 * We don't depend on @types/babel__core to avoid external type dependencies
 */
interface IBabelCore {
	transformSync(code: string, options?: {
		filename?: string;
		plugins?: any[];
		sourceType?: string;
		parserOpts?: {
			sourceType?: string;
			plugins?: string[];
		};
	}): { code: string | null } | null;
}

export class SourceTrackingInjector extends BaseInjector {
	override readonly name = 'source-tracking';
	override readonly priority = 5; // Run FIRST, before error boundary

	// Cache Babel to avoid re-requiring it on every file
	private babelCore: IBabelCore | null = null;
	private babelLoadAttempted = false;

	/**
	 * Try to load Babel for AST-based transformation.
	 * Returns null if Babel is not available.
	 */
	private getBabel(): IBabelCore | null {
		if (this.babelLoadAttempted) {
			return this.babelCore;
		}

		this.babelLoadAttempted = true;

		// Use statically imported Babel module
		if (babelCoreModule && typeof babelCoreModule.transformSync === 'function') {
			this.babelCore = babelCoreModule as IBabelCore;
			console.log('[SourceTracking] Babel module loaded - using AST transformation');
			return this.babelCore;
		}

		console.warn('[SourceTracking] Babel module not available - will use regex fallback');
		return null;
	}

	/**
	 * Transform JSX/TSX using Babel AST (PRIMARY METHOD for React/Solid/Preact)
	 *
	 * This method uses Babel to properly parse JSX and TypeScript, ensuring
	 * we only inject attributes into actual JSX elements, not TypeScript types.
	 *
	 * @param code - Source code
	 * @param filename - File path
	 * @returns Transformed code or null if transformation failed
	 */
	private transformWithBabel(code: string, filename: string): string | null {
		const babel = this.getBabel();
		if (!babel) {
			return null;
		}

		try {
			const result = babel.transformSync(code, {
				filename,
				plugins: [
					this.createRoopikBabelPlugin(filename)
				],
				sourceType: 'module',
				parserOpts: {
					sourceType: 'module',
					plugins: ['jsx', 'typescript']
				}
			});

			return result?.code || null;
		} catch (error) {
			console.error('[SourceTracking] Babel transformation exception:', error);
			if (error instanceof Error) {
				console.error('   Stack:', error.stack);
			}
			return null;
		}
	}

	/**
	 * Create the Roopik Babel plugin for JSX transformation.
	 *
	 * This plugin visits all JSXElement nodes and injects our tracking attributes.
	 * Because Babel properly parses TypeScript, it will NOT match type annotations
	 * like React.MouseEvent<HTMLDivElement> - only actual JSX elements.
	 *
	 * @param filename - Source file path
	 * @returns Babel plugin
	 */
	private createRoopikBabelPlugin(filename: string) {
		const relPath = filename.replace(/\\/g, '/');

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return function roopikBabelPlugin({ types: t }: { types: any }) {
			return {
				visitor: {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					JSXElement(path: any, state: any) {
						const { node } = path;
						const elementLoc = node.loc;
						if (!elementLoc) {
							return;
						}

						const openingElement = node.openingElement;
						if (!openingElement) {
							return;
						}

						// Extract current element's tag name
						const name = openingElement.name;
						let currentElementName: string;
						if (t.isJSXIdentifier(name)) {
							currentElementName = name.name;
						} else if (t.isJSXMemberExpression(name)) {
							currentElementName = `${name.object.name}.${name.property.name}`;
						} else {
							currentElementName = 'Unknown';
						}

						// Full element location (from opening < to closing >)
						const sourceValue = `${relPath}:${elementLoc.start.line}:${elementLoc.start.column}:${elementLoc.end.line}:${elementLoc.end.column}`;

						// Check if already has our attributes
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const hasRoopikAttr = openingElement.attributes.some(
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(attr: any) => t.isJSXAttribute(attr) && attr.name.name === 'data-roopik-source'
						);

						if (!hasRoopikAttr) {
							// Add source attribute
							openingElement.attributes.push(
								t.jsxAttribute(
									t.jsxIdentifier('data-roopik-source'),
									t.stringLiteral(sourceValue)
								)
							);

							// Add component name attribute
							openingElement.attributes.push(
								t.jsxAttribute(
									t.jsxIdentifier('data-roopik-component'),
									t.stringLiteral(currentElementName)
								)
							);
						}
					}
				}
			};
		};
	}

	/**
	 * Transform source code to add tracking attributes.
	 * This is called for each file during build.
	 *
	 * For React/Solid/Preact: Uses Babel AST (PRIMARY) with regex fallback
	 * For Vue/Svelte/HTML: Uses regex with TypeScript type context detection
	 *
	 * @param code - The source code
	 * @param context - Injector context with componentId and framework
	 * @param filename - The filename being processed
	 * @returns Transformed code with source tracking attributes
	 */
	transformFile(code: string, context: InjectorContext, filename: string): string {
		const framework = context.framework || 'react';
		const config = FRAMEWORK_CONFIGS[framework] || FRAMEWORK_CONFIGS['react'];

		// Check if this file should be processed
		const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
		if (!config.extensions.includes(ext)) {
			// For non-matching extensions, try to detect from content
			if (!this.shouldProcessFile(code, ext)) {
				return code;
			}
		}

		try {
			// For JSX/TSX frameworks with Babel AST enabled, try Babel first
			if (config.useBabelAST && (ext === '.jsx' || ext === '.tsx')) {
				console.log(`[SourceTracking] Attempting Babel AST for: ${filename}`);
				const babelResult = this.transformWithBabel(code, filename);
				if (babelResult) {
					console.log(`[SourceTracking] Babel AST success: ${filename}`);
					return babelResult;
				}
				// Fall through to regex if Babel fails
				console.log(`[SourceTracking] Babel failed, falling back to regex: ${filename}`);
			}

			// Fallback to regex-based transformation
			const options: ParseOptions = {
				filePath: filename,
				baseLineOffset: 0,
				skipTags: config.skipTags,
				checkScriptStyle: config.checkScriptStyle,
				componentName: context.componentId
			};

			const result = transformCode(code, options);

			if (result.count > 0) {
				console.log(`[SourceTracking] Regex added tracking to ${result.count} elements in: ${filename}`);
			} else {
				console.log(`[SourceTracking] Regex found 0 elements in: ${filename}`);
			}

			return result.code;
		} catch (error) {
			// Gracefully handle errors - return original code
			console.warn(`[SourceTracking] Failed to transform ${filename}:`, error);
			return code;
		}
	}

	/**
	 * Check if a file should be processed based on content.
	 * Handles cases where extension doesn't match but content has JSX/HTML.
	 */
	private shouldProcessFile(code: string, ext: string): boolean {
		// Always process .js/.ts files that contain JSX
		if (ext === '.js' || ext === '.ts') {
			// Check for JSX-like content
			return /<[A-Z][a-zA-Z0-9]*[\s\/>]/.test(code) || // React components
				/<[a-z][a-zA-Z0-9-]*[\s\/>]/.test(code);      // HTML elements
		}
		return false;
	}

	/**
	 * Main inject method - not used for source tracking.
	 * Source tracking happens at file level via transformFile().
	 *
	 * This method is kept for interface compatibility but returns code unchanged.
	 */
	override inject(code: string, _context: InjectorContext): string {
		// Source tracking is done at file level, not bundle level
		// The transformFile method is called for each file during build
		return code;
	}
}

/**
 * Create a standalone transform function for use outside the injector pipeline.
 * Useful for direct integration with ESBuild plugins.
 *
 * For React/Solid/Preact: Uses Babel AST (PRIMARY) with regex fallback
 * For Vue/Svelte/HTML: Uses regex with TypeScript type context detection
 *
 * @param framework - Target framework (react, vue, svelte, html, solid, preact)
 * @param logger - Optional logger for diagnostic output
 * @returns Transform function
 */
export function createSourceTrackingTransform(framework: string = 'react', logger?: { info: (msg: string, meta?: any) => void; warn: (msg: string, meta?: any) => void; debug: (msg: string, meta?: any) => void }) {
	const config = FRAMEWORK_CONFIGS[framework] || FRAMEWORK_CONFIGS['react'];

	// Cache Babel loading for performance
	let babelCore: IBabelCore | null = null;
	let babelLoadAttempted = false;

	function getBabel(): IBabelCore | null {
		if (babelLoadAttempted) {
			return babelCore;
		}
		babelLoadAttempted = true;

		// Use statically imported Babel module
		if (babelCoreModule && typeof babelCoreModule.transformSync === 'function') {
			babelCore = babelCoreModule as IBabelCore;
			if (logger) logger.debug('[SOURCE_TRACKING] Babel loaded - using AST transformation');
			return babelCore;
		}

		if (logger) logger.warn('[SOURCE_TRACKING] Babel module not available - using regex fallback');
		return null;
	}

	/**
	 * Transform using Babel AST (for JSX/TSX)
	 */
	function transformWithBabel(code: string, filename: string): string | null {
		const babel = getBabel();
		if (!babel) {
			return null;
		}

		const relPath = filename.replace(/\\/g, '/');

		try {
			const result = babel.transformSync(code, {
				filename,
				plugins: [
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					function roopikBabelPlugin({ types: t }: { types: any }) {
						return {
							visitor: {
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								JSXElement(path: any) {
									const { node } = path;
									const elementLoc = node.loc;
									if (!elementLoc) return;

									const openingElement = node.openingElement;
									if (!openingElement) return;

									// Extract tag name
									const name = openingElement.name;
									let currentElementName: string;
									if (t.isJSXIdentifier(name)) {
										currentElementName = name.name;
									} else if (t.isJSXMemberExpression(name)) {
										currentElementName = `${name.object.name}.${name.property.name}`;
									} else {
										currentElementName = 'Unknown';
									}

									// Build source value
									const sourceValue = `${relPath}:${elementLoc.start.line}:${elementLoc.start.column}:${elementLoc.end.line}:${elementLoc.end.column}`;

									// Check if already has attribute
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									const hasRoopikAttr = openingElement.attributes.some(
										// eslint-disable-next-line @typescript-eslint/no-explicit-any
										(attr: any) => t.isJSXAttribute(attr) && attr.name.name === 'data-roopik-source'
									);

									if (!hasRoopikAttr) {
										openingElement.attributes.push(
											t.jsxAttribute(
												t.jsxIdentifier('data-roopik-source'),
												t.stringLiteral(sourceValue)
											)
										);
										openingElement.attributes.push(
											t.jsxAttribute(
												t.jsxIdentifier('data-roopik-component'),
												t.stringLiteral(currentElementName)
											)
										);
									}
								}
							}
						};
					}
				],
				sourceType: 'module',
				parserOpts: {
					sourceType: 'module',
					plugins: ['jsx', 'typescript']
				}
			});

			return result?.code || null;
		} catch (error) {
			if (logger) logger.warn('[SOURCE_TRACKING] Babel transformation failed', { filename, error });
			return null;
		}
	}

	return function transform(code: string, filename: string, componentId?: string): string {
		// Check extension
		const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();

		// Skip non-matching files (unless they contain JSX)
		if (!config.extensions.includes(ext)) {
			if (ext !== '.js' && ext !== '.ts') {
				return code;
			}
			// Check for JSX content in .js/.ts files
			if (!/<[A-Za-z][a-zA-Z0-9-]*[\s\/>]/.test(code)) {
				return code;
			}
		}

		try {
			// For JSX/TSX frameworks, try Babel first
			if (config.useBabelAST && (ext === '.jsx' || ext === '.tsx')) {
				if (logger) logger.debug('[SOURCE_TRACKING] Attempting Babel AST', { filename });
				const babelResult = transformWithBabel(code, filename);
				if (babelResult) {
					if (logger) logger.info('[SOURCE_TRACKING] Babel AST success', { filename });
					return babelResult;
				}
				// Fall through to regex
				if (logger) logger.debug('[SOURCE_TRACKING] Babel failed, using regex fallback', { filename });
			}

			// Fallback to regex-based transformation
			const options: ParseOptions = {
				filePath: filename,
				baseLineOffset: 0,
				skipTags: config.skipTags,
				checkScriptStyle: config.checkScriptStyle,
				componentName: componentId
			};

			const result = transformCode(code, options);

			if (result.count > 0) {
				if (logger) logger.info(`[SOURCE_TRACKING] Regex added ${result.count} attributes`, { filename });
			} else {
				if (logger) logger.debug('[SOURCE_TRACKING] Regex found 0 elements', { filename });
			}

			return result.code;
		} catch (error) {
			if (logger) logger.warn('[SOURCE_TRACKING] Transform failed', { filename, error });
			return code;
		}
	};
}
