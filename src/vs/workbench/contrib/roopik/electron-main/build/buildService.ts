/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Build Service Implementation
 *
 * Pure build service - takes source files, returns bundled code.
 * Does NOT handle storage - caller decides what to do with output.
 *
 * Uses:
 * - ESBuildTransformer for bundling
 * - InjectorPipeline for script injection
 * - ComponentParser for framework/entry detection
 */

import { IBuildService, BuildInput, BuildOutput } from '../../common/build/buildService.js';
import { ESBuildTransformer } from './esbuildTransformer.js';
import { ComponentParser } from '../../common/build/componentParser.js';
import { InjectorPipeline, createDefaultPipeline, IScriptInjector } from './injectors/index.js';
import { ILoggerService } from '../../../../../platform/log/common/log.js';

export class BuildService implements IBuildService {
	readonly _serviceBrand: undefined;

	private readonly transformer: ESBuildTransformer;
	private readonly parser: ComponentParser;
	private readonly pipeline: InjectorPipeline;

	constructor(@ILoggerService loggerService: ILoggerService) {
		this.parser = new ComponentParser();
		this.transformer = new ESBuildTransformer(loggerService, this.parser);
		this.pipeline = createDefaultPipeline();
	}

	/**
	 * Build component from source files
	 *
	 * Flow:
	 * 1. Detect framework (if not provided)
	 * 2. Bundle with ESBuild
	 * 3. Apply script injectors
	 * 4. Return BuildOutput
	 *
	 * Caller is responsible for storing the output.
	 */
	async build(input: BuildInput): Promise<BuildOutput> {
		const startTime = Date.now();

		// 1. Transform with ESBuild
		const transformed = await this.transformer.transform({
			id: input.id,
			files: input.files,
			entryFile: input.entryFile,
			framework: input.framework,
			dependencies: input.dependencies
		});

		// 2. Apply script injector pipeline
		const injectedCode = this.pipeline.inject(transformed.bundledCode, {
			componentId: input.id,
			framework: transformed.framework
		});

		// 3. Return build output (caller handles storage)
		return {
			bundledCode: injectedCode,
			cdnUrls: transformed.cdnUrls,
			framework: transformed.framework,
			resolvedDependencies: transformed.resolvedDependencies,
			buildTime: Date.now() - startTime,
			bundleSize: injectedCode.length,
			styling: transformed.styling
		};
	}

	// ============================================================================
	// Pipeline Management (for extensibility)
	// ============================================================================

	/**
	 * Register a custom injector
	 *
	 * @param injector Custom injector to add
	 */
	registerInjector(injector: IScriptInjector): void {
		this.pipeline.register(injector);
	}

	/**
	 * Unregister an injector by name
	 *
	 * @param name Injector name to remove
	 */
	unregisterInjector(name: string): boolean {
		return this.pipeline.unregister(name);
	}

	/**
	 * Get list of registered injectors
	 */
	getRegisteredInjectors(): string[] {
		return this.pipeline.getRegisteredInjectors();
	}
}
