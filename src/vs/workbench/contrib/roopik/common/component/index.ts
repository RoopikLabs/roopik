/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Module - Public API
 */

// Types (type-only re-exports)
export type {
	Component,
	AddComponentRequest,
	BuildResult,
	BuildError,
	BuildErrorInfo,
	BuildErrorLocation
} from './types.js';

// Service Decorator (runtime value via createDecorator)
export { IComponentService } from './componentService.js';

// Event interfaces (type-only re-exports)
export type {
	ComponentCreatedEvent,
	ComponentBuildEvent,
	ComponentDeletedEvent,
	ComponentUpdatedEvent
} from './componentService.js';

/**
 * IPC Channel name for ComponentService communication.
*/
export const COMPONENT_CHANNEL_NAME = 'roopikComponent';
