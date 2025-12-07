/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Script Injectors - Public API
 *
 * Pipeline pattern for injecting scripts into bundled component code.
 */

// Types
export { IScriptInjector, InjectorContext, BaseInjector } from './types.js';

// Pipeline
export { InjectorPipeline } from './injectorPipeline.js';

// Built-in Injectors
export { ErrorBoundaryInjector } from './errorBoundaryInjector.js';
export { InspectModeInjector } from './inspectModeInjector.js';
export { HmrBridgeInjector } from './hmrBridgeInjector.js';

// ============================================================================
// Factory for default pipeline
// ============================================================================

import { InjectorPipeline } from './injectorPipeline.js';
import { ErrorBoundaryInjector } from './errorBoundaryInjector.js';
import { InspectModeInjector } from './inspectModeInjector.js';
import { HmrBridgeInjector } from './hmrBridgeInjector.js';

/**
 * Create a default injector pipeline with all built-in injectors
 *
 * Includes:
 * - ErrorBoundaryInjector (priority 10): Error handling and display
 * - InspectModeInjector (priority 50): Element inspection
 * - HmrBridgeInjector (priority 90): Hot module replacement
 *
 * @returns Configured InjectorPipeline
 */
export function createDefaultPipeline(): InjectorPipeline {
	const pipeline = new InjectorPipeline();

	// Add new injectors
	pipeline.register(new ErrorBoundaryInjector());
	pipeline.register(new InspectModeInjector());
	pipeline.register(new HmrBridgeInjector());
	// pipeline.register(new MyCustomInjector()); // Future extensibility

	// Remove injectors if not needed
	// pipeline.unregister('inspect-mode');

	return pipeline;
}
