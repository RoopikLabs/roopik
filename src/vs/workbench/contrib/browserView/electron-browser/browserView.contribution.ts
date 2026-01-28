/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { BrowserEditor } from './browserEditor.js';
import { BrowserEditorInput, BrowserEditorSerializer } from './browserEditorInput.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Schemas } from '../../../../base/common/network.js';
import { IBrowserViewWorkbenchService } from '../common/browserView.js';
import { BrowserViewWorkbenchService } from './browserViewWorkbenchService.js';
import { BrowserViewStorageScope } from '../../../../platform/browserView/common/browserView.js';
import { IOpenerService, IOpener, OpenInternalOptions, OpenExternalOptions } from '../../../../platform/opener/common/opener.js';
import { isLocalhostAuthority } from '../../../../platform/url/common/trustedDomains.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logBrowserOpen } from './browserViewTelemetry.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

// Register actions
import './browserViewActions.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		BrowserEditor,
		BrowserEditor.ID,
		localize('browser.editorLabel', "Browser")
	),
	[
		new SyncDescriptor(BrowserEditorInput)
	]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	BrowserEditorInput.ID,
	BrowserEditorSerializer
);

class BrowserEditorResolverContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.browserEditorResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		editorResolverService.registerEditor(
			`${Schemas.vscodeBrowser}:/**`,
			{
				id: BrowserEditorInput.ID,
				label: localize('browser.editorLabel', "Browser"),
				priority: RegisteredEditorPriority.exclusive
			},
			{
				canSupportResource: resource => resource.scheme === Schemas.vscodeBrowser,
				singlePerResource: true
			},
			{
				createEditorInput: ({ resource, options }) => {
					const parsed = BrowserViewUri.parse(resource);
					if (!parsed) {
						throw new Error(`Invalid browser view resource: ${resource.toString()}`);
					}

					const browserInput = instantiationService.createInstance(BrowserEditorInput, {
						id: parsed.id,
						url: parsed.url
					});

					// Start resolving the input right away. This will create the browser view.
					// This allows browser views to be loaded in the background.
					void browserInput.resolve();

					return {
						editor: browserInput,
						options: {
							...options,
							pinned: !!parsed.url // pin if navigated
						}
					};
				}
			}
		);
	}
}

registerWorkbenchContribution2(BrowserEditorResolverContribution.ID, BrowserEditorResolverContribution, WorkbenchPhase.BlockStartup);

/**
 * Opens localhost URLs in the Integrated Browser with notification prompt (like Cursor).
 * User can choose to:
 * - Open in Roopik Browser (default action)
 * - Don't Open (dismisses for this session)
 * - Don't Show Again (permanently disables prompts)
 */
class LocalhostLinkOpenerContribution extends Disposable implements IWorkbenchContribution, IOpener {
	static readonly ID = 'workbench.contrib.localhostLinkOpener';

	// Session-level dismissals (resets when IDE closes)
	private _sessionDismissedHosts: Set<string> = new Set();

	// Pending notifications (to prevent duplicates)
	private _pendingNotifications: Set<string> = new Set();

	constructor(
		@IOpenerService openerService: IOpenerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		this._register(openerService.registerOpener(this));
	}

	async open(resource: URI | string, _options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
		const url = typeof resource === 'string' ? resource : resource.toString(true);

		// Parse and validate localhost URL
		let parsed: URL;
		try {
			parsed = new URL(url);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				return false;
			}
			if (!isLocalhostAuthority(parsed.host)) {
				return false;
			}
		} catch {
			return false;
		}

		const host = parsed.host;

		// Check if user has permanently disabled prompts
		if (this._isDisabledPermanently()) {
			return false; // Let system browser handle it
		}

		// Check if already set to always open
		if (this._shouldAlwaysOpen()) {
			return this._openInRoopikBrowser(url);
		}

		// Check if dismissed this session for this host
		if (this._sessionDismissedHosts.has(host)) {
			return false; // Let system browser handle it
		}

		// Check if there's already a pending notification for this host
		if (this._pendingNotifications.has(host)) {
			return true; // We're handling it, don't let others open it
		}

		// Show notification prompt (like Cursor)
		return this._showNotificationPrompt(url, host);
	}

	private _isDisabledPermanently(): boolean {
		return this.storageService.getBoolean('roopik.localhostBrowser.disabled', StorageScope.PROFILE, false);
	}

	private _shouldAlwaysOpen(): boolean {
		return this.configurationService.getValue<boolean>('workbench.browser.openLocalhostLinks') === true;
	}

	private async _showNotificationPrompt(url: string, host: string): Promise<boolean> {
		this._pendingNotifications.add(host);

		return new Promise<boolean>((resolve) => {
			const displayUrl = this._getDisplayUrl(url);

			this.notificationService.prompt(
				Severity.Info,
				localize('localhostBrowser.prompt', "Opening {0} in Roopik Browser", displayUrl),
				[
					{
						label: localize('localhostBrowser.open', "Open"),
						run: () => {
							this._pendingNotifications.delete(host);
							this._openInRoopikBrowser(url).then(() => resolve(true));
						}
					},
					{
						label: localize('localhostBrowser.dontOpen', "Don't Open"),
						run: () => {
							this._pendingNotifications.delete(host);
							this._sessionDismissedHosts.add(host);
							resolve(false); // Let system browser handle it
						}
					},
					{
						label: localize('localhostBrowser.dontShowAgain', "Don't Show Again"),
						run: () => {
							this._pendingNotifications.delete(host);
							this.storageService.store('roopik.localhostBrowser.disabled', true, StorageScope.PROFILE, StorageTarget.USER);
							resolve(false); // Let system browser handle it
						}
					}
				],
				{
					sticky: false,
					onCancel: () => {
						this._pendingNotifications.delete(host);
						this._sessionDismissedHosts.add(host);
						resolve(false); // Let system browser handle it on close
					}
				}
			);
		});
	}

	private _getDisplayUrl(url: string): string {
		try {
			const parsed = new URL(url);
			const display = `${parsed.protocol}//${parsed.host}${parsed.pathname !== '/' ? parsed.pathname : ''}`;
			return display.length > 50 ? display.substring(0, 47) + '...' : display;
		} catch {
			return url.length > 50 ? url.substring(0, 47) + '...' : url;
		}
	}

	private async _openInRoopikBrowser(url: string): Promise<boolean> {
		logBrowserOpen(this.telemetryService, 'localhostLinkOpener');

		const browserUri = BrowserViewUri.forUrl(url);
		await this.editorService.openEditor({ resource: browserUri, options: { pinned: true } });
		return true;
	}
}

registerWorkbenchContribution2(LocalhostLinkOpenerContribution.ID, LocalhostLinkOpenerContribution, WorkbenchPhase.BlockStartup);

registerSingleton(IBrowserViewWorkbenchService, BrowserViewWorkbenchService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.browser.openLocalhostLinks': {
			type: 'boolean',
			default: false,
			markdownDescription: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.openLocalhostLinks' },
				'When enabled, localhost links from the terminal, chat, and other sources will open in the Integrated Browser instead of the system browser.'
			)
		},
		'workbench.browser.dataStorage': {
			type: 'string',
			enum: [
				BrowserViewStorageScope.Global,
				BrowserViewStorageScope.Workspace,
				BrowserViewStorageScope.Ephemeral
			],
			markdownEnumDescriptions: [
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.dataStorage.global' }, 'All browser views share a single persistent session across all workspaces.'),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.dataStorage.workspace' }, 'Browser views within the same workspace share a persistent session.'),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.dataStorage.ephemeral' }, 'Each browser view has its own session that is cleaned up when closed.')
			],
			restricted: true,
			default: BrowserViewStorageScope.Global,
			markdownDescription: localize(
				{ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.dataStorage' },
				'Controls how browser data (cookies, cache, storage) is shared between browser views.\n\n**Note**: In untrusted workspaces, this setting is ignored and `ephemeral` storage is always used.'
			),
			scope: ConfigurationScope.WINDOW,
			order: 100
		}
	}
});
