/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ComponentSource, SessionCode, TranslationMap, DependencyManifest } from './types';

/**
 * PreviewManager - The Smart Translator
 *
 * Orchestrates the "Source of Truth" pipeline:
 * 1. Parses dependency manifest from AI-generated code
 * 2. Transforms import → const (on-load)
 * 3. Transforms const → import (on-download)
 * 4. Manages translation maps for each active component
 */
export class PreviewManager {
	private translationMaps: Map<string, TranslationMap> = new Map();

	/**
	 * Parse dependency manifest from source code
	 * Looks for // DEPENDENCIES: [...] comment at top of file
	 * Handles both compact and multi-line formats, strips inline comments
	 */
	parseDependencyManifest(code: string): DependencyManifest[] {
		// Match either compact or multi-line format
		const manifestRegex = /\/\/ DEPENDENCIES:\s*(\[[\s\S]*?\])/;
		const match = code.match(manifestRegex);

		if (!match) {
			return [];
		}

		try {
			let jsonStr = match[1];

			// Remove line comments within the JSON (e.g., "  //   { ...")
			// This handles multi-line manifests with comment prefixes
			jsonStr = jsonStr.replace(/\/\/\s*/g, '');

			// Clean up extra whitespace
			jsonStr = jsonStr.trim();

			return JSON.parse(jsonStr);
		} catch (error) {
			console.error('[PreviewManager] Failed to parse dependency manifest:', error);
			console.error('[PreviewManager] Manifest string was:', match[1]);
			return [];
		}
	}

	/**
	 * Transform "Source of Truth" to "Session Code"
	 * Converts: import { Button } from '@mui/material'
	 * To:       const { Button } = mui
	 */
	transformToSessionCode(source: ComponentSource): SessionCode {
		let transformedCode = source.code;
		const translationMap: TranslationMap = {};
		const cdnUrls: string[] = [];

		// Build translation map and CDN list
		source.dependencies.forEach(dep => {
			translationMap[dep.npm] = dep.global;
			cdnUrls.push(dep.url);
		});

		// Transform imports to const declarations
		source.dependencies.forEach(dep => {
			const escapedNpm = dep.npm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

			// Match: import React, { useState } from 'react'
			const mixedImportRegex = new RegExp(
				`import\\s+(\\w+)\\s*,\\s*{([^}]+)}\\s+from\\s+['"]${escapedNpm}['"];?`,
				'g'
			);
			transformedCode = transformedCode.replace(mixedImportRegex, (_, defaultName, namedImports) => {
				// If default name matches global (e.g., React === React), just destructure named imports
				if (defaultName === dep.global) {
					return `const {${namedImports}} = ${dep.global};`;
				}
				// Otherwise, create both const declarations
				return `const ${defaultName} = ${dep.global};\nconst {${namedImports}} = ${dep.global};`;
			});

			// Match: import { ... } from '@mui/material'
			const importRegex = new RegExp(
				`import\\s+{([^}]+)}\\s+from\\s+['"]${escapedNpm}['"];?`,
				'g'
			);
			transformedCode = transformedCode.replace(importRegex, (_, imports) => {
				return `const {${imports}} = ${dep.global};`;
			});

			// Match: import React from 'react'
			const defaultImportRegex = new RegExp(
				`import\\s+(\\w+)\\s+from\\s+['"]${escapedNpm}['"];?`,
				'g'
			);
			transformedCode = transformedCode.replace(defaultImportRegex, (_, name) => {
				// Skip if import name matches global (e.g., import React = React)
				if (name === dep.global) {
					return ''; // Remove the import entirely, global is already available
				}
				return `const ${name} = ${dep.global};`;
			});
		});

		// Remove export default
		transformedCode = transformedCode.replace(/export\s+default\s+/g, '');

		// Store translation map for this component
		this.translationMaps.set(source.id, translationMap);

		return {
			componentId: source.id,
			code: transformedCode,
			cdnUrls,
			translationMap
		};
	}

	/**
	 * Transform "Session Code" back to "Source of Truth"
	 * Converts: const { Button } = mui
	 * To:       import { Button } from '@mui/material'
	 */
	transformToSourceCode(componentId: string, sessionCode: string): string {
		const translationMap = this.translationMaps.get(componentId);
		if (!translationMap) {
			console.warn(`[PreviewManager] No translation map found for ${componentId}`);
			return sessionCode;
		}

		let sourceCode = sessionCode;

		// Reverse the transformation
		Object.entries(translationMap).forEach(([npmPackage, globalVar]) => {
			// Match: const { ... } = mui
			const constRegex = new RegExp(
				`const\\s+{([^}]+)}\\s+=\\s+${globalVar};?`,
				'g'
			);
			sourceCode = sourceCode.replace(constRegex, (_, imports) => {
				return `import {${imports}} from '${npmPackage}';`;
			});

			// Match: const React = React
			const defaultConstRegex = new RegExp(
				`const\\s+(\\w+)\\s+=\\s+${globalVar};?`,
				'g'
			);
			sourceCode = sourceCode.replace(defaultConstRegex, (_, name) => {
				return `import ${name} from '${npmPackage}';`;
			});
		});

		return sourceCode;
	}

	/**
	 * Clear translation map for a component (cleanup)
	 */
	clearTranslationMap(componentId: string): void {
		this.translationMaps.delete(componentId);
	}

	/**
	 * Clear all translation maps
	 */
	clearAll(): void {
		this.translationMaps.clear();
	}
}
