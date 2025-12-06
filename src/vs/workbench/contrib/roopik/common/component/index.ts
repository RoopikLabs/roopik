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
	CreateComponentRequest,
	SourceData,
	AIAgentSourceData,
	LocalFileSourceData,
	GitHubSourceData,
	FigmaSourceData,
	ManualSourceData,
	ImportResult,
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
