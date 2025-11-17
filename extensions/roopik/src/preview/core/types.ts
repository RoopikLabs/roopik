/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Dependency manifest for CDN-based imports
 * Maps npm package names to their CDN URLs and global variables
 */
export interface DependencyManifest {
	npm: string;        // e.g., "@mui/material"
	global: string;     // e.g., "mui"
	url: string;        // e.g., "https://unpkg.com/@mui/material@5.15.14/umd/material-ui.development.js"
}

/**
 * Component source code with dependency manifest
 * This is the "Source of Truth" from AI generation
 */
export interface ComponentSource {
	id: string;
	code: string;                          // Standard import-based JSX code
	dependencies: DependencyManifest[];    // Parsed from // DEPENDENCIES comment
}

/**
 * Translation map for import ↔ const conversion
 * Maps npm package names to global variable names
 */
export interface TranslationMap {
	[npmPackage: string]: string;  // e.g., "@mui/material" => "mui"
}

/**
 * Session code ready for sandbox execution
 * Uses const syntax instead of imports (CDN globals)
 */
export interface SessionCode {
	componentId: string;
	code: string;                    // Transformed code (const instead of import)
	cdnUrls: string[];               // List of CDN script URLs to load
	translationMap: TranslationMap;  // For reverse transformation
}

/**
 * Message sent to sandbox iframe via postMessage
 */
export interface SandboxMessage {
	type: 'init' | 'update';
	code: string;              // Session code (const syntax)
	cdnUrls?: string[];        // Only on init
}

/**
 * Message received from sandbox iframe
 */
export interface SandboxResponse {
	type: 'ready' | 'error';
	message?: string;
}
