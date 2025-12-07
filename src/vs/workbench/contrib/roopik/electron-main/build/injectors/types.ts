/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Script Injector Pipeline Types
 *
 * Defines the interface for script injectors that can modify bundled code.
 * Follows pipeline pattern - each injector transforms code in sequence.
 */

import { Framework } from '../../../common/storage/storageTypes.js';

// ============================================================================
// Injector Types
// ============================================================================

/**
 * Context passed to each injector
 */
export interface InjectorContext {
	/** Component ID (for logging) */
	componentId: string;

	/** Framework used */
	framework: Framework;

	/** Canvas ID (optional) */
	canvasId?: string;
}

/**
 * Script Injector Interface
 *
 * Each injector takes code and returns modified code.
 * Injectors are applied in order (pipeline pattern).
 */
export interface IScriptInjector {
	/** Unique name for this injector */
	readonly name: string;

	/** Priority (lower = runs first, default = 100) */
	readonly priority: number;

	/**
	 * Check if this injector should run for the given context
	 */
	shouldInject(context: InjectorContext): boolean;

	/**
	 * Transform the code
	 *
	 * @param code Input code
	 * @param context Build context
	 * @returns Transformed code
	 */
	inject(code: string, context: InjectorContext): string;
}

/**
 * Base class for injectors with default implementations
 */
export abstract class BaseInjector implements IScriptInjector {
	abstract readonly name: string;

	/** Default priority - middle of the pack */
	readonly priority: number = 100;

	/** By default, inject for all frameworks */
	shouldInject(_context: InjectorContext): boolean {
		return true;
	}

	abstract inject(code: string, context: InjectorContext): string;
}
