/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Sandbox represents a live, interactive preview environment (iframe)
// Mode 1: Client-side transpilation with Babel
export interface Sandbox {
	id: string;                    // Component ID: "button_sample_001"
	x: number;                     // Canvas X position
	y: number;                     // Canvas Y position
	width: number;                 // Sandbox width
	height: number;                // Sandbox height
	zIndex: number;                // Stacking order (higher = on top)
	sandboxMessage: {              // Message to send to iframe
		type: 'init' | 'update';
		code: string;              // Transformed code (const-based)
		cdnUrls?: string[];        // CDN scripts to load
	};
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
