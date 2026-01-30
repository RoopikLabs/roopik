/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unified Tool Services
 *
 * Single source of truth for all tool implementations.
 * Used by both WebSocket MCP (external agents) and Native IPC (Dio agent).
 *
 * Architecture:
 * - CDPMonitorService: Centralized Chrome DevTools Protocol monitoring
 * - BrowserToolService: All browser tools (14 tools)
 * - ProjectToolService: Dev server tools (3 tools)
 * - CanvasToolService: Canvas management tools (3 tools)
 * - ComponentToolService: Component management tools (6 tools)
 */

export { CDPMonitorService } from './cdpMonitorService.js';
export type { ConsoleLog, NetworkRequest, NetworkResponse } from './cdpMonitorService.js';

export { BrowserToolService } from './browserToolService.js';

export { ProjectToolService } from './projectToolService.js';

export { CanvasToolService } from './canvasToolService.js';

export { ComponentToolService } from './componentToolService.js';
export type { ComponentAddParams, ComponentAddResult, ComponentRemoveResult, ComponentRebuildResult } from './componentToolService.js';
