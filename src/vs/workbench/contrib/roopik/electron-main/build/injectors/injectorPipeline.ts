/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Script Injector Pipeline
 *
 * Orchestrates multiple injectors in a pipeline pattern.
 * Injectors are sorted by priority and applied in sequence.
 *
 * Pipeline Pattern:
 * - Add injectors via register()
 * - Remove injectors via unregister()
 * - Apply all via inject()
 *
 * Example:
 *   pipeline.register(new ErrorBoundaryInjector());
 *   pipeline.register(new InspectModeInjector());
 *   const result = pipeline.inject(code, context);
 */

import { IScriptInjector, InjectorContext } from './types.js';

export class InjectorPipeline {
	private readonly injectors: Map<string, IScriptInjector> = new Map();
	private sortedInjectors: IScriptInjector[] = [];
	private needsSort = false;

	/**
	 * Register an injector
	 *
	 * @param injector The injector to register
	 * @throws Error if injector with same name already registered
	 */
	register(injector: IScriptInjector): void {
		if (this.injectors.has(injector.name)) {
			throw new Error(`Injector "${injector.name}" is already registered`);
		}
		this.injectors.set(injector.name, injector);
		this.needsSort = true;
	}

	/**
	 * Unregister an injector by name
	 *
	 * @param name Name of the injector to remove
	 * @returns true if removed, false if not found
	 */
	unregister(name: string): boolean {
		const removed = this.injectors.delete(name);
		if (removed) {
			this.needsSort = true;
		}
		return removed;
	}

	/**
	 * Check if an injector is registered
	 */
	has(name: string): boolean {
		return this.injectors.has(name);
	}

	/**
	 * Get list of registered injector names
	 */
	getRegisteredInjectors(): string[] {
		return Array.from(this.injectors.keys());
	}

	/**
	 * Apply all injectors to code in priority order
	 *
	 * @param code Input code
	 * @param context Build context
	 * @returns Transformed code with all injections applied
	 */
	inject(code: string, context: InjectorContext): string {
		if (this.needsSort) {
			this.sortInjectors();
		}

		let result = code;

		for (const injector of this.sortedInjectors) {
			// Check if injector should run for this context
			if (injector.shouldInject(context)) {
				try {
					result = injector.inject(result, context);
				} catch (error) {
					// Log error but don't break pipeline
					console.error(`[InjectorPipeline] Error in injector "${injector.name}":`, error);
				}
			}
		}

		return result;
	}

	/**
	 * Sort injectors by priority (lower priority = runs first)
	 */
	private sortInjectors(): void {
		this.sortedInjectors = Array.from(this.injectors.values()).sort(
			(a, b) => a.priority - b.priority
		);
		this.needsSort = false;
	}

	/**
	 * Clear all registered injectors
	 */
	clear(): void {
		this.injectors.clear();
		this.sortedInjectors = [];
		this.needsSort = false;
	}
}
