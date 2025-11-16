/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Sandbox represents a live, interactive preview environment (iframe)
export interface Sandbox {
	id: string;                    // "sandbox_123"
	name: string;                  // "Login Screen - Variation A"

	// Full file system storage
	files: {
		[path: string]: string;      // File path → File content
	};

	entryPoint: string;            // "src/App.tsx" or "index.html"

	// Compiled output (cached after bundling)
	compiled?: {
		html: string;                // Single bundled HTML
		css: string;                 // Single bundled CSS
		js: string;                  // Single bundled JS (all imports resolved)
		errors?: string[];           // Compilation errors if any
	};

	// Vite dev server URL (for HMR-enabled preview)
	devServerUrl?: string;         // "http://localhost:5173"

	position: { x: number; y: number; };  // Canvas position
	size: { width: number; height: number; };
	isSelected: boolean;           // Currently focused?
	isVisible: boolean;            // In viewport?
	createdAt: number;
	updatedAt: number;
}

export interface CanvasState {
	id: string;                    // Canvas ID
	name: string;                  // "Login Flow Design"
	sandboxes: Sandbox[];          // Array of all sandboxes
	selectedSandboxId: string | null;  // Currently focused sandbox
	viewport: {
		x: number;
		y: number;
		scale: number;
	};
	createdAt: number;
	updatedAt: number;
}
