/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Mode (Mode 1) - Type Definitions
 *
 * Component design workspace with infinite canvas and isolated sandbox previews.
 * Uses client-side Babel transpilation for instant component rendering.
 */

// ============================================
// Framework & Component Types
// ============================================

/**
 * Supported frontend frameworks
 * Loosely coupled - easy to add more in future
 */
export type Framework = 'react' | 'vue' | 'svelte' | 'html';

/**
 * Component complexity levels
 */
export type ComponentType = 'atomic' | 'composite' | 'page';

/**
 * Background pattern types for canvas
 */
export type BackgroundPattern = 'grid' | 'dots' | 'plain';

/**
 * Device preview modes for sandbox emulation
 * - auto: Use sandbox's natural size (no scaling)
 * - desktop: 1280×800 viewport
 * - tablet: 768×1024 viewport
 * - mobile: 375×667 viewport
 */
export type DevicePreset = 'auto' | 'desktop' | 'tablet' | 'mobile';

/**
 * Device preset configuration
 */
export interface DevicePresetConfig {
	width: number | 'auto';
	height: number | 'auto';
	label: string;
	icon: string;  // For UI display
}

/**
 * Device preset definitions
 */
export const DEVICE_PRESETS: Record<DevicePreset, DevicePresetConfig> = {
	auto: { width: 'auto', height: 'auto', label: 'Auto', icon: '⬜' },
	desktop: { width: 1280, height: 800, label: 'Desktop', icon: '🖥️' },
	tablet: { width: 768, height: 1024, label: 'Tablet', icon: '📱' },
	mobile: { width: 375, height: 667, label: 'Mobile', icon: '📲' }
};

// ============================================
// Dependency Manifest (Golden Prompt)
// ============================================

/**
 * Single dependency entry from AI-generated manifest
 * Maps npm package to CDN global variable
 */
export interface DependencyEntry {
	npm: string;      // "@mui/material"
	global: string;   // "mui"
	url: string;      // "https://unpkg.com/@mui/material@5.15.14/..."
}

/**
 * Full dependency manifest parsed from component code
 */
export interface DependencyManifest {
	entries: DependencyEntry[];
	cdnUrls: string[];
	translationMap: Map<string, string>;  // npm -> global
}

// ============================================
// Component Definition
// ============================================

/**
 * Roopik component - stored in .roopik/components/
 */
export interface RoopikComponent {
	id: string;                    // Unique ID: "btn_primary_001"
	name: string;                  // Display name: "Primary Button"
	type: ComponentType;
	framework: Framework;
	code: string;                  // Source code (import-based)

	// Variant tracking
	variantOf?: string;            // Parent component ID if this is a variant
	variants?: string[];           // Child variant IDs

	// Metadata
	meta: {
		description: string;
		tags: string[];
		createdAt: number;
		updatedAt: number;
		aiGenerated: boolean;
		aiPrompt?: string;           // Original prompt if AI generated
	};

	// Dependencies (for CDN loading)
	dependencies: {
		cdnUrls: string[];           // ['https://unpkg.com/react@18...']
		npmPackages?: string[];      // For future npm-based rendering
	};
}

/**
 * Component info for listings (lightweight)
 */
export interface ComponentInfo {
	id: string;
	name: string;
	type: ComponentType;
	framework: Framework;
	thumbnailPath?: string;
	updatedAt: number;
}

// ============================================
// Sandbox Types
// ============================================

/**
 * Sandbox render state
 */
export type SandboxState = 'loading' | 'ready' | 'error';

/**
 * Sandbox instance on canvas - represents a rendered component
 */
export interface Sandbox {
	id: string;                    // Unique sandbox ID
	componentId: string;           // Reference to RoopikComponent

	// Canvas positioning
	x: number;
	y: number;
	width: number;
	height: number;
	zIndex: number;

	// Render state
	state: SandboxState;
	errorMessage?: string;

	// Code for rendering (transformed to const-based)
	sessionCode?: string;
	cdnUrls?: string[];

	// Device emulation mode (optional - defaults to global if not set)
	deviceMode?: DevicePreset;
}

/**
 * Viewport transform for infinite canvas
 */
export interface CanvasViewport {
	x: number;
	y: number;
	scale: number;
}

/**
 * Canvas state - stored in .roopik/canvas/
 */
export interface CanvasState {
	id: string;                    // Canvas ID
	name: string;                  // "My Components"

	// Sandboxes on this canvas
	sandboxes: Sandbox[];

	// Viewport transform
	viewport: CanvasViewport;

	// UI state
	selectedSandboxId: string | null;
	focusedSandboxId: string | null;   // Currently in focus mode

	// Preferences
	backgroundColor: string;
	backgroundPattern: BackgroundPattern;

	// Global device emulation mode (applies to all sandboxes without override)
	globalDeviceMode: DevicePreset;

	// Timestamps
	createdAt: number;
	updatedAt: number;
}

// ============================================
// Sandbox Communication (postMessage)
// ============================================

/**
 * Message sent TO sandbox iframe
 */
export type SandboxInMessage =
	| { type: 'init'; code: string; cdnUrls: string[] }
	| { type: 'update'; code: string }
	| { type: 'inspect:enable' }
	| { type: 'inspect:disable' }
	| { type: 'inspect:highlight'; selector: string };

/**
 * Message received FROM sandbox iframe
 */
export type SandboxOutMessage =
	| { type: 'ready' }
	| { type: 'rendered' }
	| { type: 'error'; message: string; stack?: string }
	| { type: 'inspect:element'; data: ElementInfo }
	| { type: 'inspect:hover'; selector: string };

/**
 * Element info from inspect mode
 */
export interface ElementInfo {
	tagName: string;
	id?: string;
	classes: string[];
	styles: Record<string, string>;
	rect: { x: number; y: number; width: number; height: number };
}

// ============================================
// Canvas Grid Layout
// ============================================

/**
 * Grid layout configuration
 */
export interface GridConfig {
	columns: number;
	sandboxWidth: number;
	sandboxHeight: number;
	gapX: number;
	gapY: number;
	startX: number;
	startY: number;
	containerPaddingX: number;
	containerPaddingY: number;
	containerMargin: number;
}

/**
 * Default grid configuration
 */
export const DEFAULT_GRID_CONFIG: GridConfig = {
	columns: 4,
	sandboxWidth: 500,
	sandboxHeight: 500,
	gapX: 60,
	gapY: 60,
	startX: 100,
	startY: 100,
	containerPaddingX: 120,
	containerPaddingY: 40,
	containerMargin: 20
};

/**
 * Default canvas state
 */
export const DEFAULT_CANVAS_STATE: Omit<CanvasState, 'id' | 'name' | 'createdAt' | 'updatedAt'> = {
	sandboxes: [],
	viewport: { x: 0, y: 0, scale: 1 },
	selectedSandboxId: null,
	focusedSandboxId: null,
	backgroundColor: '#1a1a1a',
	backgroundPattern: 'dots',
	globalDeviceMode: 'auto'
};
