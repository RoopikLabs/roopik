/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Module - Public API
 */

// Types
export {
	Component,
	AddComponentRequest,
	BuildResult,
	BuildError,
	BuildErrorInfo,
	BuildErrorLocation
} from './types.js';

// Service Interface & Events
export {
	IComponentService,
	ComponentCreatedEvent,
	ComponentBuildEvent,
	ComponentDeletedEvent,
	ComponentUpdatedEvent
} from './componentService.js';

/**
 * IPC Channel name for ComponentService communication.
*/
export const COMPONENT_CHANNEL_NAME = 'roopikComponent';
