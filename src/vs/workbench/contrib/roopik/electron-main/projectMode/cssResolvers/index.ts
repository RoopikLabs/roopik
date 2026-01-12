/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * CSS Resolvers - electron-main
 *
 * This module provides CSS source resolution capabilities for Mode 2 (Project Preview).
 * All services run in the main process and use CDP (Chrome DevTools Protocol) for
 * deterministic style resolution.
 *
 * Main entry point: StyleSourceOrchestrator
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  StyleSourceOrchestrator (main entry)                          │
 * │    ├── CDPCssService (CDP communication)                       │
 * │    ├── URLToPathConverter (URL → local file path)              │
 * │    ├── SourceMapResolver (SCSS/LESS source maps)               │
 * │    └── CSSInJsDetector (Emotion/styled-components detection)   │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 * ```typescript
 * const orchestrator = new StyleSourceOrchestrator(cdpService, projectRoot);
 * const result = await orchestrator.getElementStyles({
 *   browserViewId: 1,
 *   target: '.btn-primary',  // or { x: 100, y: 200 }
 *   projectRoot: '/path/to/project'
 * });
 * ```
 */

// Main orchestrator
export { StyleSourceOrchestrator } from './styleSourceOrchestrator.js';

// Individual services
export { CDPCssService, type ICDPBrowserService } from './cdpCssService.js';
export { URLToPathConverter } from './urlToPathConverter.js';
export { SourceMapResolver } from './sourceMapResolver.js';
export { CSSInJsDetector } from './cssInJsDetector.js';

// Re-export common types
export type {
	CSSSourceLocation,
	CSSSourceType,
	CSSInJSLibrary,
	ResolvedCSSProperty,
	MatchedCSSRule,
	MatchedCSSProperty,
	ElementStyleInfo,
	InlineStyleProperty,
	InheritedStyleInfo,
	CSSInJSDetectionResult,
	GetElementStylesRequest,
	GetElementStylesResult,
	StyleEditOperation,
	StyleEditResult
} from '../../../common/cssResolvers/types.js';
