/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Commands Index
 *
 * Central registry for all Roopik commands.
 * Each command module exports a register function that registers its commands.
 */

import { registerWelcomeCommands } from './welcomeCommands.js';
import { registerCanvasCommands } from './canvasCommands.js';
import { registerImportCommands } from './importCommands.js';
import { registerBrowserCommands } from './browserCommands.js';
import { registerComponentCommands } from './componentCommands.js';

/**
 * Register all Roopik commands
 *
 * Call this once during contribution initialization.
 */
export function registerAllCommands(): void {
	registerWelcomeCommands();
	registerCanvasCommands();
	registerImportCommands();
	registerBrowserCommands();
	registerComponentCommands();
}

// Re-export individual register functions for granular control
export { registerWelcomeCommands } from './welcomeCommands.js';
export { registerCanvasCommands } from './canvasCommands.js';
export { registerImportCommands } from './importCommands.js';
export { registerBrowserCommands } from './browserCommands.js';
export { registerComponentCommands } from './componentCommands.js';
