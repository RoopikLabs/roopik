/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Debug Service - Module Exports
 *
 * Provides autonomous debugging capabilities for AI agents.
 */

export * from './types';
export * from './agentDebugService';
export * from './variableParser';
export * from './debugIPCHandler';

export { AgentDebugService, getAgentDebugService } from './agentDebugService';
export { VariableParser, getVariableParser } from './variableParser';
export { DebugIPCHandler, initializeDebugIPCHandler, getDebugIPCHandler } from './debugIPCHandler';
