/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Build Module - Public API (electron-main)
 */

// Service
export { BuildService } from './buildService.js';

// Injectors (re-export for convenience)
export {
	InjectorPipeline,
	BaseInjector,
	ErrorBoundaryInjector,
	InspectModeInjector,
	HmrBridgeInjector,
	createDefaultPipeline
} from './injectors/index.js';
export type { IScriptInjector, InjectorContext } from './injectors/index.js';
