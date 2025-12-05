/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * PreviewManager - The Smart Translator
 *
 * Orchestrates the "Source of Truth" pipeline for Mode 1 canvas:
 * 1. Parses dependency manifest from AI-generated code (// DEPENDENCIES: [...])
 * 2. Transforms import → const (on-load for browser execution)
 * 3. Transforms const → import (on-download for clean export)
 * 4. Manages translation maps for each active component
 *
 * Based on the Golden Prompt architecture documented in:
 * - docs/ROOPIK-Architecture/NEW_UPGRADED_ARCHITECTURE.md
 * - docs/challenges/mixed-import-declarations.md
 */

// ============================================
// Types
// ============================================

/**
 * Dependency manifest entry from AI-generated code
 * Maps npm package to CDN URL and global variable
 */
export interface DependencyManifest {
	npm: string;        // "@mui/material"
	global: string;     // "mui"
	url: string;        // "https://unpkg.com/@mui/material@5.15.14/..."
}

/**
 * Component source - the "Source of Truth" from AI
 */
export interface ComponentSource {
	id: string;
	code: string;                          // Standard import-based JSX code
	dependencies: DependencyManifest[];    // Parsed from // DEPENDENCIES comment
}

/**
 * Translation map for import ↔ const conversion
 */
export interface TranslationMap {
	[npmPackage: string]: string;  // "@mui/material" => "mui"
}

/**
 * Session code ready for sandbox execution
 */
export interface SessionCode {
	componentId: string;
	code: string;                    // Transformed code (const instead of import)
	cdnUrls: string[];               // CDN script URLs to load
	translationMap: TranslationMap;  // For reverse transformation on export
}

// ============================================
// PreviewManager Service
// ============================================

/**
 * PreviewManager - Handles bidirectional code transformation
 *
 * Flow:
 * 1. AI generates code with imports + DEPENDENCIES manifest
 * 2. PreviewManager transforms to session code (const-based)
 * 3. Session code runs in browser sandbox with CDN globals
 * 4. On export, session code transforms back to clean imports
 */
export class PreviewManager {
	private translationMaps: Map<string, TranslationMap> = new Map();

	/**
	 * Parse dependency manifest from source code
	 * Looks for // DEPENDENCIES: [...] comment at top of file
	 *
	 * Handles both formats:
	 * - Compact: // DEPENDENCIES: [{"npm": "react", ...}]
	 * - Multi-line with comment prefixes
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
	 *
	 * Converts ES6 imports to const declarations for browser execution:
	 * - import { Button } from '@mui/material'  →  const { Button } = mui;
	 * - import React, { useState } from 'react' →  const { useState } = React;
	 * - import React from 'react'               →  (removed, React is global)
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

			// 1. Handle mixed imports: import React, { useState } from 'react'
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

			// 2. Handle named imports: import { Button, TextField } from '@mui/material'
			const importRegex = new RegExp(
				`import\\s+{([^}]+)}\\s+from\\s+['"]${escapedNpm}['"];?`,
				'g'
			);
			transformedCode = transformedCode.replace(importRegex, (_, imports) => {
				return `const {${imports}} = ${dep.global};`;
			});

			// 3. Handle default imports: import React from 'react'
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

		// Remove export default (component is called directly in sandbox)
		transformedCode = transformedCode.replace(/export\s+default\s+/g, '');

		// Remove the DEPENDENCIES comment block
		transformedCode = transformedCode.replace(/\/\/\s*DEPENDENCIES:[\s\S]*?\]\s*\n?/, '');

		// Store translation map for this component
		this.translationMaps.set(source.id, translationMap);

		return {
			componentId: source.id,
			code: transformedCode.trim(),
			cdnUrls,
			translationMap
		};
	}

	/**
	 * Transform "Session Code" back to "Source of Truth"
	 *
	 * Reverses the transformation for clean export:
	 * - const { Button } = mui;  →  import { Button } from '@mui/material';
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

			// Match: const SomeAlias = globalVar
			const defaultConstRegex = new RegExp(
				`const\\s+(\\w+)\\s+=\\s+${globalVar};?`,
				'g'
			);
			sourceCode = sourceCode.replace(defaultConstRegex, (_, name) => {
				return `import ${name} from '${npmPackage}';`;
			});
		});

		// Add export default back
		sourceCode = sourceCode.replace(/function\s+Component\s*\(/, 'export default function Component(');

		return sourceCode;
	}

	/**
	 * Quick transform for components with Golden Prompt format
	 * Parses manifest and transforms in one step
	 */
	processComponent(id: string, code: string): SessionCode {
		const dependencies = this.parseDependencyManifest(code);
		return this.transformToSessionCode({
			id,
			code,
			dependencies
		});
	}

	/**
	 * Get the translation map for a component
	 */
	getTranslationMap(componentId: string): TranslationMap | undefined {
		return this.translationMaps.get(componentId);
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

// ============================================
// Singleton Instance
// ============================================

// Create a singleton instance for use across the canvas
// In the future, this could be converted to a proper VSCode service with DI
let _instance: PreviewManager | undefined;

export function getPreviewManager(): PreviewManager {
	if (!_instance) {
		_instance = new PreviewManager();
	}
	return _instance;
}
