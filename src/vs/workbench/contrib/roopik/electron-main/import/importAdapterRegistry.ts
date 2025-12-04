/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * ImportAdapterRegistry - Manages available import adapters
 *
 * Registry pattern for dynamic adapter management.
 * Allows registering new adapters at runtime and finding
 * the appropriate adapter for a given source.
 *
 * Usage:
 * ```typescript
 * const registry = new ImportAdapterRegistry();
 * registry.register(new LocalFileAdapter(workspace, logger));
 * registry.register(new GitHubAdapter(httpService, logger));
 *
 * const adapter = registry.findAdapter(source);
 * if (adapter) {
 *   const result = await adapter.import(source, options);
 * }
 * ```
 */

import type { IComponentImportAdapter, AdapterSourceType } from '../../common/import/importTypes.js';

/**
 * Registry for import adapters
 */
export class ImportAdapterRegistry {
	private readonly adapters = new Map<AdapterSourceType, IComponentImportAdapter>();

	/**
	 * Register an adapter
	 * @param adapter - Adapter to register
	 * @throws Error if adapter with same ID already registered
	 */
	register(adapter: IComponentImportAdapter): void {
		if (this.adapters.has(adapter.id)) {
			throw new Error(`Adapter with ID "${adapter.id}" is already registered`);
		}
		this.adapters.set(adapter.id, adapter);
	}

	/**
	 * Unregister an adapter by ID
	 * @param adapterId - ID of adapter to remove
	 * @returns true if adapter was removed, false if not found
	 */
	unregister(adapterId: AdapterSourceType): boolean {
		return this.adapters.delete(adapterId);
	}

	/**
	 * Get an adapter by ID
	 * @param adapterId - ID of adapter to get
	 */
	getAdapter(adapterId: AdapterSourceType): IComponentImportAdapter | undefined {
		return this.adapters.get(adapterId);
	}

	/**
	 * Find an adapter that can handle the given source
	 * Checks adapters in order of registration until one can handle the source
	 * @param source - Source path/URL to find adapter for
	 */
	findAdapter(source: string): IComponentImportAdapter | undefined {
		for (const adapter of this.adapters.values()) {
			if (adapter.canHandle(source)) {
				return adapter;
			}
		}
		return undefined;
	}

	/**
	 * Get all registered adapters
	 */
	getAllAdapters(): IComponentImportAdapter[] {
		return Array.from(this.adapters.values());
	}

	/**
	 * Get adapter IDs
	 */
	getAdapterIds(): AdapterSourceType[] {
		return Array.from(this.adapters.keys());
	}

	/**
	 * Check if an adapter is registered
	 */
	hasAdapter(adapterId: AdapterSourceType): boolean {
		return this.adapters.has(adapterId);
	}

	/**
	 * Get adapter display names for UI (e.g., source picker)
	 */
	getAdapterDisplayNames(): { id: AdapterSourceType; displayName: string }[] {
		return Array.from(this.adapters.entries()).map(([id, adapter]) => ({
			id,
			displayName: adapter.displayName
		}));
	}

	/**
	 * Clear all registered adapters
	 */
	clear(): void {
		this.adapters.clear();
	}
}
