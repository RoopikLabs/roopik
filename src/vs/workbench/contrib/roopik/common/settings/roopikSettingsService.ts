/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_SETTINGS } from './roopikSettingsTypes.js';
import type { RoopikAppSettings, RoopikWorkspaceSettings, AppSettingsPath, WorkspaceSettingsPath, SettingValue } from './roopikSettingsTypes.js';
import { IRoopikEventService } from '../events/index.js';

// ============================================================================
// Service Interface
// ============================================================================

export const IRoopikSettingsService = createDecorator<IRoopikSettingsService>('roopikSettingsService');

/**
 * Settings change event payload
 */
export interface SettingsChangeEvent {
	path: AppSettingsPath | WorkspaceSettingsPath;
	oldValue: unknown;
	newValue: unknown;
	scope: 'app' | 'workspace';
}

export interface IRoopikSettingsService {
	readonly _serviceBrand: undefined;

	// ========================================================================
	// App Settings (User Profile)
	// ========================================================================

	/**
	 * Get an app setting value by path
	 */
	get<P extends AppSettingsPath>(path: P): SettingValue<P>;

	/**
	 * Set an app setting value by path
	 */
	set<P extends AppSettingsPath>(path: P, value: SettingValue<P>): void;

	/**
	 * Get all app settings
	 */
	getAppSettings(): RoopikAppSettings;

	/**
	 * Reset an app setting to default
	 */
	resetAppSetting(path: AppSettingsPath): void;

	/**
	 * Reset all app settings to defaults
	 */
	resetAllAppSettings(): void;

	// ========================================================================
	// Workspace Settings (.roopik/config.json)
	// ========================================================================

	/**
	 * Get a workspace setting value by path
	 */
	getWorkspace<P extends WorkspaceSettingsPath>(path: P): unknown;

	/**
	 * Set a workspace setting value by path
	 */
	setWorkspace<P extends WorkspaceSettingsPath>(path: P, value: unknown): void;

	/**
	 * Get all workspace settings
	 */
	getWorkspaceSettings(): RoopikWorkspaceSettings;

	// ========================================================================
	// Events
	// ========================================================================

	/**
	 * Event fired when any setting changes
	 */
	readonly onSettingsChanged: Event<SettingsChangeEvent>;
}

// ============================================================================
// Service Implementation
// ============================================================================

const STORAGE_KEY_PREFIX = 'roopik.settings.';

export class RoopikSettingsService extends Disposable implements IRoopikSettingsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onSettingsChanged = this._register(new Emitter<SettingsChangeEvent>());
	readonly onSettingsChanged = this._onSettingsChanged.event;

	private _appSettings: RoopikAppSettings;
	private _workspaceSettings: RoopikWorkspaceSettings;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IRoopikEventService private readonly eventService: IRoopikEventService
	) {
		super();

		// Load settings from storage
		this._appSettings = this.loadAppSettings();
		this._workspaceSettings = this.loadWorkspaceSettings();

		// Forward settings changes to event service
		this._register(this.onSettingsChanged(event => {
			this.eventService.publish('settings.changed', {
				scope: event.scope,
				key: event.path,
				oldValue: event.oldValue,
				newValue: event.newValue
			});
		}));
	}

	// ========================================================================
	// App Settings Implementation
	// ========================================================================

	get<P extends AppSettingsPath>(path: P): SettingValue<P> {
		const [category, key] = path.split('.') as [keyof RoopikAppSettings, string];
		const categorySettings = this._appSettings[category] as unknown as Record<string, unknown>;
		return categorySettings[key] as SettingValue<P>;
	}

	set<P extends AppSettingsPath>(path: P, value: SettingValue<P>): void {
		const [category, key] = path.split('.') as [keyof RoopikAppSettings, string];
		const categorySettings = this._appSettings[category] as unknown as Record<string, unknown>;

		const oldValue = categorySettings[key];
		if (oldValue === value) {
			return; // No change
		}

		// Update in-memory settings
		categorySettings[key] = value;

		// Persist to storage
		this.saveAppSetting(path, value);

		// Fire change event
		this._onSettingsChanged.fire({
			path,
			oldValue,
			newValue: value,
			scope: 'app'
		});
	}

	getAppSettings(): RoopikAppSettings {
		return { ...this._appSettings };
	}

	resetAppSetting(path: AppSettingsPath): void {
		const [category, key] = path.split('.') as [keyof RoopikAppSettings, string];
		const defaultValue = (DEFAULT_APP_SETTINGS[category] as unknown as Record<string, unknown>)[key];
		this.set(path, defaultValue as SettingValue<typeof path>);
	}

	resetAllAppSettings(): void {
		this._appSettings = { ...DEFAULT_APP_SETTINGS };
		this.storageService.remove(STORAGE_KEY_PREFIX + 'app', StorageScope.PROFILE);

		this._onSettingsChanged.fire({
			path: 'welcome.showOnStartup', // Generic path to indicate reset
			oldValue: undefined,
			newValue: undefined,
			scope: 'app'
		});
	}

	// ========================================================================
	// Workspace Settings Implementation
	// ========================================================================

	getWorkspace<P extends WorkspaceSettingsPath>(path: P): unknown {
		const [category, key] = path.split('.') as [keyof RoopikWorkspaceSettings, string];
		const categorySettings = this._workspaceSettings[category] as unknown as Record<string, unknown>;
		return categorySettings[key];
	}

	setWorkspace<P extends WorkspaceSettingsPath>(path: P, value: unknown): void {
		const [category, key] = path.split('.') as [keyof RoopikWorkspaceSettings, string];
		const categorySettings = this._workspaceSettings[category] as unknown as Record<string, unknown>;

		const oldValue = categorySettings[key];
		if (oldValue === value) {
			return; // No change
		}

		// Update in-memory settings
		categorySettings[key] = value;

		// Persist to storage (workspace scope)
		this.saveWorkspaceSetting(path, value);

		// Fire change event
		this._onSettingsChanged.fire({
			path,
			oldValue,
			newValue: value,
			scope: 'workspace'
		});
	}

	getWorkspaceSettings(): RoopikWorkspaceSettings {
		return { ...this._workspaceSettings };
	}

	// ========================================================================
	// Private Helpers
	// ========================================================================

	private loadAppSettings(): RoopikAppSettings {
		const stored = this.storageService.get(STORAGE_KEY_PREFIX + 'app', StorageScope.PROFILE);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as Partial<RoopikAppSettings>;
				return this.mergeWithDefaults(parsed, DEFAULT_APP_SETTINGS);
			} catch {
				// Invalid JSON, use defaults
			}
		}
		return { ...DEFAULT_APP_SETTINGS };
	}

	private loadWorkspaceSettings(): RoopikWorkspaceSettings {
		const stored = this.storageService.get(STORAGE_KEY_PREFIX + 'workspace', StorageScope.WORKSPACE);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as Partial<RoopikWorkspaceSettings>;
				return this.mergeWorkspaceWithDefaults(parsed, DEFAULT_WORKSPACE_SETTINGS);
			} catch {
				// Invalid JSON, use defaults
			}
		}
		return { ...DEFAULT_WORKSPACE_SETTINGS };
	}

	private saveAppSetting(path: AppSettingsPath, value: unknown): void {
		// Save entire settings object
		this.storageService.store(
			STORAGE_KEY_PREFIX + 'app',
			JSON.stringify(this._appSettings),
			StorageScope.PROFILE,
			StorageTarget.USER
		);
	}

	private saveWorkspaceSetting(path: WorkspaceSettingsPath, value: unknown): void {
		// Save entire settings object
		this.storageService.store(
			STORAGE_KEY_PREFIX + 'workspace',
			JSON.stringify(this._workspaceSettings),
			StorageScope.WORKSPACE,
			StorageTarget.USER
		);
	}

	private mergeWithDefaults(
		partial: Partial<RoopikAppSettings>,
		defaults: RoopikAppSettings
	): RoopikAppSettings {
		return {
			browser: { ...defaults.browser, ...partial.browser },
			canvas: { ...defaults.canvas, ...partial.canvas },
			welcome: { ...defaults.welcome, ...partial.welcome },
			agent: { ...defaults.agent, ...partial.agent }
		};
	}

	private mergeWorkspaceWithDefaults(
		partial: Partial<RoopikWorkspaceSettings>,
		defaults: RoopikWorkspaceSettings
	): RoopikWorkspaceSettings {
		return {
			browser: { ...defaults.browser, ...partial.browser },
			components: { ...defaults.components, ...partial.components }
		};
	}
}
