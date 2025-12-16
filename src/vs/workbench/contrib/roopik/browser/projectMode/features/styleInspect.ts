/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import type { IProjectModeService } from '../../../common/projectMode/ipc.js';
import type { CSSSourceLocation, ElementStyleInfo, GetElementStylesResult } from '../../../common/cssResolvers/types.js';
import { StyleInspectPanel, IStyleInspectPanelCallbacks } from '../components/styleInspectPanel.js';
import { ISourceNavigationService } from '../../../common/navigation/index.js';
import type { InspectMode } from './inspectMode.js';

/**
 * Style Inspect Feature
 *
 * Integrates inspect mode with CSS source resolution.
 * Uses the unified InspectMode script for element selection.
 *
 * Flow:
 * 1. User enables style inspect mode
 * 2. InspectMode script is injected (unified hover/select behavior)
 * 3. User clicks element in browser
 * 4. Script sends event via CDP bridge (window.__roopikBridge)
 * 5. Editor receives event, calls getElementStyles via IPC
 * 6. Style panel shows element info and CSS sources
 * 7. User can click file links to open in editor
 *
 * Note: The actual script injection is handled by InspectMode class.
 * StyleInspect is now focused on panel management and CSS resolution.
 */
export class StyleInspect {
	private panel: StyleInspectPanel | null = null;
	private isActive: boolean = false;
	private currentProjectRoot: string | undefined;
	private onVisibilityChangedCallback: ((visible: boolean, panelWidth: number) => void) | undefined;
	private inspectModeRef: InspectMode | null = null;

	constructor(
		private readonly browserService: IProjectModeService,
		private readonly notificationService: INotificationService,
		private readonly sourceNavigationService: ISourceNavigationService
	) {}

	/**
	 * Set the InspectMode reference for unified script injection
	 * Must be called before enable()
	 */
	setInspectMode(inspectMode: InspectMode): void {
		this.inspectModeRef = inspectMode;
	}

	/**
	 * Set callback for when panel visibility changes
	 * Used by editor to adjust browser bounds
	 */
	setOnVisibilityChanged(callback: (visible: boolean, panelWidth: number) => void): void {
		this.onVisibilityChangedCallback = callback;
	}

	/**
	 * Initialize the style panel in a container
	 */
	initialize(container: HTMLElement): void {
		if (this.panel) {
			return;
		}

		const callbacks: IStyleInspectPanelCallbacks = {
			onOpenFile: (location) => this.openFile(location),
			onEditStyle: (prop, newValue) => this.editStyle(prop, newValue),
			onClose: () => this.onPanelClosed(),
			onVisibilityChanged: (visible, panelWidth) => {
				this.onVisibilityChangedCallback?.(visible, panelWidth);
			}
		};

		this.panel = new StyleInspectPanel(container, callbacks);
	}

	/**
	 * Set the current project root (for path resolution)
	 */
	setProjectRoot(projectRoot: string): void {
		this.currentProjectRoot = projectRoot;
	}

	/**
	 * Enable Style Inspect Mode
	 * Uses the unified InspectMode script for element selection
	 */
	async enable(browserViewId: number): Promise<void> {
		if (!browserViewId) {
			return;
		}

		if (!this.inspectModeRef) {
			console.error('[StyleInspect] InspectMode reference not set');
			return;
		}

		this.isActive = true;

		try {
			// Use unified InspectMode script for element selection
			await this.inspectModeRef.enable(browserViewId);

			// Override notification with style-specific message
			this.notificationService.notify({
				severity: Severity.Info,
				message: 'Style Inspect: Click element to view CSS sources. ESC to exit.',
				sticky: false
			});
		} catch (error) {
			console.error('[StyleInspect] Failed to enable:', error);
			this.isActive = false;
		}
	}

	/**
	 * Disable Style Inspect Mode
	 * Cleans up the unified InspectMode script
	 */
	async disable(browserViewId: number): Promise<void> {
		if (!browserViewId) {
			return;
		}

		this.isActive = false;

		try {
			// Use unified InspectMode cleanup
			if (this.inspectModeRef) {
				await this.inspectModeRef.disable(browserViewId);
			}
		} catch {
			// Silent fail
		}
	}

	/**
	 * Check if style inspect is active
	 */
	getIsActive(): boolean {
		return this.isActive;
	}

	/**
	 * Handle element selection from browser
	 * Called when user clicks element in style inspect mode
	 */
	async handleElementSelected(
		browserViewId: number,
		selector: string
	): Promise<void> {
		if (!this.panel || !this.currentProjectRoot) {
			console.warn('[StyleInspect] Panel or projectRoot not initialized');
			return;
		}

		try {
			// Get element styles via IPC
			const result: GetElementStylesResult = await this.browserService.getElementStyles({
				browserViewId,
				target: selector,
				projectRoot: this.currentProjectRoot
			});

			if (result.success && result.data) {
				this.showStylePanel(result.data);
			} else {
				this.notificationService.notify({
					severity: Severity.Warning,
					message: `Could not get styles: ${result.error || 'Unknown error'}`,
					sticky: false
				});
			}
		} catch (error) {
			console.error('[StyleInspect] Failed to get element styles:', error);
			this.notificationService.notify({
				severity: Severity.Error,
				message: 'Failed to inspect element styles',
				sticky: false
			});
		}
	}

	/**
	 * Handle element selection by coordinates
	 */
	async handleElementSelectedByPoint(
		browserViewId: number,
		x: number,
		y: number
	): Promise<void> {
		if (!this.panel || !this.currentProjectRoot) {
			console.warn('[StyleInspect] Panel or projectRoot not initialized');
			return;
		}

		try {
			// Get element styles via IPC using coordinates
			const result: GetElementStylesResult = await this.browserService.getElementStyles({
				browserViewId,
				target: { x, y },
				projectRoot: this.currentProjectRoot
			});

			if (result.success && result.data) {
				this.showStylePanel(result.data);
			} else {
				this.notificationService.notify({
					severity: Severity.Warning,
					message: `Could not get styles: ${result.error || 'Unknown error'}`,
					sticky: false
				});
			}
		} catch (error) {
			console.error('[StyleInspect] Failed to get element styles:', error);
		}
	}

	/**
	 * Show the style panel with element info
	 */
	private showStylePanel(data: ElementStyleInfo): void {
		if (this.panel) {
			this.panel.show(data);
		}
	}

	/**
	 * Hide the style panel
	 */
	hidePanel(): void {
		if (this.panel) {
			this.panel.hide();
		}
	}

	/**
	 * Check if panel is visible
	 */
	isPanelVisible(): boolean {
		return this.panel?.getIsVisible() ?? false;
	}

	/**
	 * Open a file at the specified location
	 * Uses the centralized SourceNavigationService for consistent behavior
	 *
	 * For HTML source (data-roopik-source), we pass the full range to highlight
	 * the entire element. This matches the context menu "Open Source" behavior.
	 *
	 * For CSS rules, the location typically comes from CDP which provides accurate
	 * start/end positions for the rule, so we pass those too for consistency.
	 */
	private async openFile(location: CSSSourceLocation): Promise<void> {
		await this.sourceNavigationService.openSourceLocation({
			file: location.file,
			line: location.line,
			column: location.column,
			endLine: location.endLine,
			endColumn: location.endColumn
		});
	}

	/**
	 * Edit a style value (placeholder - would need live CSS editing support)
	 */
	private editStyle(prop: any, newValue: string): void {
		// TODO: Implement live CSS editing
		// This would require:
		// 1. CDP CSS.setStyleTexts to update live
		// 2. File editing to persist changes
		console.log('[StyleInspect] Edit style:', prop.name, '=', newValue);
		this.notificationService.notify({
			severity: Severity.Info,
			message: 'Live CSS editing coming soon!',
			sticky: false
		});
	}

	/**
	 * Handle panel closed
	 */
	private onPanelClosed(): void {
		// Panel was closed, could disable inspect mode here if needed
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.panel) {
			this.panel.dispose();
			this.panel = null;
		}
		this.inspectModeRef = null;
	}
}
