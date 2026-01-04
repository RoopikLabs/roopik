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
 * Attributes injected:
 * - data-roopik-source: "file:startLine:startCol:endLine:endCol"
 * - data-roopik-component: tag name (div, Button, etc.)
 * - data-roopik-parent: DISABLED (using CSS selectors instead)
 */

import { BaseInjector, InjectorContext } from './types.js';
import { transformCode, ParseOptions } from './sourceTrackingCore.js';

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
}

const FRAMEWORK_CONFIGS: Record<string, FrameworkConfig> = {
	react: {
		extensions: ['.jsx', '.tsx'],
		skipTags: [],
		checkScriptStyle: false
	},
	vue: {
		extensions: ['.vue'],
		skipTags: ['script', 'style'],
		checkScriptStyle: false
	},
	svelte: {
		extensions: ['.svelte'],
		skipTags: ['script', 'style'],
		checkScriptStyle: false
	},
	html: {
		extensions: ['.html', '.htm'],
		skipTags: ['script', 'style', 'head', 'meta', 'link'],
		checkScriptStyle: true
	},
	// Solid and Preact use JSX like React
	solid: {
		extensions: ['.jsx', '.tsx'],
		skipTags: [],
		checkScriptStyle: false
	},
	preact: {
		extensions: ['.jsx', '.tsx'],
		skipTags: [],
		checkScriptStyle: false
	}
};

export class SourceTrackingInjector extends BaseInjector {
	override readonly name = 'source-tracking';
	override readonly priority = 5; // Run FIRST, before error boundary

	/**
	 * Transform source code to add tracking attributes.
	 * This is called for each file during build.
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
			const options: ParseOptions = {
				filePath: filename,
				baseLineOffset: 0,
				skipTags: config.skipTags,
				checkScriptStyle: config.checkScriptStyle,
				componentName: context.componentId
			};

			const result = transformCode(code, options);

			// if (result.count > 0) {
			// 	console.log(`[SourceTracking] Added tracking to ${result.count} elements in: ${filename}`);
			// }

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
 * @param framework - Target framework (react, vue, svelte, html, solid, preact)
 * @returns Transform function
 */
export function createSourceTrackingTransform(framework: string = 'react') {
	const config = FRAMEWORK_CONFIGS[framework] || FRAMEWORK_CONFIGS['react'];

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
			const options: ParseOptions = {
				filePath: filename,
				baseLineOffset: 0,
				skipTags: config.skipTags,
				checkScriptStyle: config.checkScriptStyle,
				componentName: componentId
			};

			const result = transformCode(code, options);
			return result.code;
		} catch (error) {
			console.warn(`[SourceTracking] Transform failed for ${filename}:`, error);
			return code;
		}
	};
}
