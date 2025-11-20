/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RoopikConfig } from './config';

/**
 * Settings HTML Generator
 *
 * Generates the Settings UI HTML as a modular component.
 * Keeps dashboard code clean and separates concerns.
 */
export class SettingsPanel {
	/**
	 * Generate Settings Modal HTML
	 */
	public static getSettingsHTML(config: RoopikConfig): string {
		return `
	<!-- Settings Modal -->
	<div class="settings-modal" id="settingsModal">
		<div class="settings-content">
			<div class="settings-header">
				<h2 class="settings-title">Settings</h2>
				<button class="settings-close" onclick="closeSettings()">×</button>
			</div>
			<div class="settings-body">
				<!-- Performance Section -->
				<div class="settings-section">
					<h3 class="settings-section-title">Performance</h3>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Max Canvases</div>
							<div class="settings-item-desc">Maximum number of canvases that can be open simultaneously</div>
						</div>
						<div class="settings-item-control">
							<input type="number" class="settings-number" id="maxCanvases"
								value="${config.performance.maxCanvases}"
								onchange="updateSetting('performance.maxCanvases', parseInt(this.value))"
								min="1" max="20">
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Warn at Canvases</div>
							<div class="settings-item-desc">Show warning when this many canvases are open</div>
						</div>
						<div class="settings-item-control">
							<input type="number" class="settings-number" id="warnAtCanvases"
								value="${config.performance.warnAtCanvases}"
								onchange="updateSetting('performance.warnAtCanvases', parseInt(this.value))"
								min="1" max="20">
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Max Components Per Canvas</div>
							<div class="settings-item-desc">Maximum components allowed per canvas</div>
						</div>
						<div class="settings-item-control">
							<input type="number" class="settings-number" id="maxComponentsPerCanvas"
								value="${config.performance.maxComponentsPerCanvas}"
								onchange="updateSetting('performance.maxComponentsPerCanvas', parseInt(this.value))"
								min="10" max="1000">
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">GPU Acceleration</div>
							<div class="settings-item-desc">Enable GPU acceleration for canvas rendering</div>
						</div>
						<div class="settings-item-control">
							<div class="settings-toggle ${config.performance.enableGPUAcceleration ? 'active' : ''}"
								onclick="updateSetting('performance.enableGPUAcceleration', !${config.performance.enableGPUAcceleration}); this.classList.toggle('active')">
							</div>
						</div>
					</div>
				</div>

				<!-- Canvas Section -->
				<div class="settings-section">
					<h3 class="settings-section-title">Canvas</h3>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Auto-Save Interval</div>
							<div class="settings-item-desc">Frequency of automatic saves (milliseconds)</div>
						</div>
						<div class="settings-item-control">
							<input type="number" class="settings-number" id="autoSaveInterval"
								value="${config.canvas.autoSaveInterval}"
								onchange="updateSetting('canvas.autoSaveInterval', parseInt(this.value))"
								min="1000" max="300000" step="1000">
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Crash Recovery</div>
							<div class="settings-item-desc">Enable automatic crash recovery</div>
						</div>
						<div class="settings-item-control">
							<div class="settings-toggle ${config.canvas.enableCrashRecovery ? 'active' : ''}"
								onclick="updateSetting('canvas.enableCrashRecovery', !${config.canvas.enableCrashRecovery}); this.classList.toggle('active')">
							</div>
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Restore Last Session</div>
							<div class="settings-item-desc">Automatically restore canvases from previous session</div>
						</div>
						<div class="settings-item-control">
							<div class="settings-toggle ${config.canvas.restoreLastSession ? 'active' : ''}"
								onclick="updateSetting('canvas.restoreLastSession', !${config.canvas.restoreLastSession}); this.classList.toggle('active')">
							</div>
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Show Dashboard on Startup</div>
							<div class="settings-item-desc">Open dashboard automatically when VS Code starts</div>
						</div>
						<div class="settings-item-control">
							<div class="settings-toggle ${config.canvas.showDashboardOnStartup ? 'active' : ''}"
								onclick="updateSetting('canvas.showDashboardOnStartup', !${config.canvas.showDashboardOnStartup}); this.classList.toggle('active')">
							</div>
						</div>
					</div>
				</div>

				<!-- AI Section -->
				<div class="settings-section">
					<h3 class="settings-section-title">AI</h3>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Context Isolation</div>
							<div class="settings-item-desc">Isolate AI context per canvas (prevents context mixing)</div>
						</div>
						<div class="settings-item-control">
							<div class="settings-toggle ${config.ai.enableContextIsolation ? 'active' : ''}"
								onclick="updateSetting('ai.enableContextIsolation', !${config.ai.enableContextIsolation}); this.classList.toggle('active')">
							</div>
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Max Chat History</div>
							<div class="settings-item-desc">Maximum number of chat messages to retain</div>
						</div>
						<div class="settings-item-control">
							<input type="number" class="settings-number" id="maxChatHistory"
								value="${config.ai.maxChatHistory}"
								onchange="updateSetting('ai.maxChatHistory', parseInt(this.value))"
								min="10" max="1000">
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Design Memory</div>
							<div class="settings-item-desc">Enable AI design memory for consistent patterns</div>
						</div>
						<div class="settings-item-control">
							<div class="settings-toggle ${config.ai.enableDesignMemory ? 'active' : ''}"
								onclick="updateSetting('ai.enableDesignMemory', !${config.ai.enableDesignMemory}); this.classList.toggle('active')">
							</div>
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Enable Style Context</div>
							<div class="settings-item-desc">Include related CSS/style files in AI context for better style modifications</div>
						</div>
						<div class="settings-item-control">
							<div class="settings-toggle ${config.ai.enableStyleContext ? 'active' : ''}"
								onclick="updateSetting('ai.enableStyleContext', !${config.ai.enableStyleContext}); this.classList.toggle('active')">
							</div>
						</div>
					</div>
				</div>

				<!-- Logging Section -->
				<div class="settings-section">
					<h3 class="settings-section-title">Logging</h3>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Log Level</div>
							<div class="settings-item-desc">Control verbosity: TRACE (0), DEBUG (1), INFO (2), WARN (3), ERROR (4), NONE (5)</div>
						</div>
						<div class="settings-item-control">
							<select class="settings-select" id="logLevel"
								onchange="updateSetting('logging.level', parseInt(this.value))">
								<option value="0" ${config.logging.level === 0 ? 'selected' : ''}>TRACE (Most Verbose)</option>
								<option value="1" ${config.logging.level === 1 ? 'selected' : ''}>DEBUG</option>
								<option value="2" ${config.logging.level === 2 ? 'selected' : ''}>INFO (Default)</option>
								<option value="3" ${config.logging.level === 3 ? 'selected' : ''}>WARN</option>
								<option value="4" ${config.logging.level === 4 ? 'selected' : ''}>ERROR</option>
								<option value="5" ${config.logging.level === 5 ? 'selected' : ''}>NONE (Disabled)</option>
							</select>
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Enable File Logging</div>
							<div class="settings-item-desc">Save logs to .roopik/logs/ directory (useful for customer support)</div>
						</div>
						<div class="settings-item-control">
							<div class="settings-toggle ${config.logging.enableFileLogging ? 'active' : ''}"
								onclick="updateSetting('logging.enableFileLogging', !${config.logging.enableFileLogging}); this.classList.toggle('active')">
							</div>
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Max Log File Size (MB)</div>
							<div class="settings-item-desc">Rotate log file when this size is reached</div>
						</div>
						<div class="settings-item-control">
							<input type="number" class="settings-number" id="maxLogFileSize"
								value="${Math.round(config.logging.maxLogFileSize / (1024 * 1024))}"
								onchange="updateSetting('logging.maxLogFileSize', parseInt(this.value) * 1024 * 1024)"
								min="1" max="100">
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Max Log Files</div>
							<div class="settings-item-desc">Number of old log files to keep (older ones are deleted)</div>
						</div>
						<div class="settings-item-control">
							<input type="number" class="settings-number" id="maxLogFiles"
								value="${config.logging.maxLogFiles}"
								onchange="updateSetting('logging.maxLogFiles', parseInt(this.value))"
								min="1" max="20">
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Show Output on Error</div>
							<div class="settings-item-desc">Automatically show Output Channel when errors occur</div>
						</div>
						<div class="settings-item-control">
							<div class="settings-toggle ${config.logging.showOutputOnError ? 'active' : ''}"
								onclick="updateSetting('logging.showOutputOnError', !${config.logging.showOutputOnError}); this.classList.toggle('active')">
							</div>
						</div>
					</div>
				</div>

				<!-- Plugins Section -->
				<div class="settings-section">
					<h3 class="settings-section-title">Plugins (Advanced)</h3>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Force Regex Mode</div>
							<div class="settings-item-desc">Use regex-based transformation instead of AST (for testing/debugging)</div>
						</div>
						<div class="settings-item-control">
							<div class="settings-toggle ${config.plugins.forceRegexMode ? 'active' : ''}"
								onclick="updateSetting('plugins.forceRegexMode', !${config.plugins.forceRegexMode}); this.classList.toggle('active')">
							</div>
						</div>
					</div>
					<div class="settings-item">
						<div class="settings-item-label">
							<div class="settings-item-name">Verbose Logging</div>
							<div class="settings-item-desc">Enable detailed plugin transformation logs in console</div>
						</div>
						<div class="settings-item-control">
							<div class="settings-toggle ${config.plugins.verboseLogging ? 'active' : ''}"
								onclick="updateSetting('plugins.verboseLogging', !${config.plugins.verboseLogging}); this.classList.toggle('active')">
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>`;
	}

	/**
	 * Generate Settings CSS
	 */
	public static getSettingsCSS(): string {
		return `
		/* Settings Modal */
		.settings-modal {
			display: none;
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-color: rgba(0, 0, 0, 0.5);
			z-index: 1000;
			align-items: center;
			justify-content: center;
		}

		.settings-modal.open {
			display: flex;
		}

		.settings-content {
			background-color: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			width: 90%;
			max-width: 800px;
			max-height: 85vh;
			display: flex;
			flex-direction: column;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
		}

		.settings-header {
			padding: 20px 24px;
			border-bottom: 1px solid var(--vscode-panel-border);
			display: flex;
			justify-content: space-between;
			align-items: center;
		}

		.settings-title {
			font-size: 18px;
			font-weight: 600;
			margin: 0;
		}

		.settings-close {
			width: 28px;
			height: 28px;
			border-radius: 4px;
			border: none;
			background-color: transparent;
			color: var(--vscode-foreground);
			font-size: 20px;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: all 0.2s;
			padding: 0;
		}

		.settings-close:hover {
			background-color: var(--vscode-inputValidation-errorBackground);
			color: var(--vscode-inputValidation-errorForeground);
		}

		.settings-body {
			flex: 1;
			overflow-y: auto;
			padding: 24px;
		}

		.settings-section {
			margin-bottom: 32px;
		}

		.settings-section:last-child {
			margin-bottom: 0;
		}

		.settings-section-title {
			font-size: 14px;
			font-weight: 600;
			margin-bottom: 16px;
			color: var(--vscode-foreground);
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		.settings-item {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 12px 0;
			border-bottom: 1px solid var(--vscode-panel-border);
		}

		.settings-item:last-child {
			border-bottom: none;
		}

		.settings-item-label {
			flex: 1;
			display: flex;
			flex-direction: column;
			gap: 4px;
		}

		.settings-item-name {
			font-size: 13px;
			color: var(--vscode-foreground);
		}

		.settings-item-desc {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}

		.settings-item-control {
			flex-shrink: 0;
			margin-left: 16px;
		}

		.settings-toggle {
			position: relative;
			width: 40px;
			height: 20px;
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 10px;
			cursor: pointer;
			transition: all 0.2s;
		}

		.settings-toggle.active {
			background-color: var(--vscode-button-background);
			border-color: var(--vscode-button-background);
		}

		.settings-toggle::after {
			content: '';
			position: absolute;
			top: 2px;
			left: 2px;
			width: 14px;
			height: 14px;
			background-color: var(--vscode-foreground);
			border-radius: 50%;
			transition: all 0.2s;
		}

		.settings-toggle.active::after {
			left: 22px;
			background-color: var(--vscode-button-foreground);
		}

		.settings-number {
			width: 80px;
			padding: 6px 8px;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 4px;
			font-size: 13px;
		}

		.settings-number:focus {
			outline: none;
			border-color: var(--vscode-focusBorder);
		}

		.settings-select {
			width: 200px;
			padding: 6px 8px;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 4px;
			font-size: 13px;
			cursor: pointer;
		}

		.settings-select:focus {
			outline: none;
			border-color: var(--vscode-focusBorder);
		}

		@media (max-width: 900px) {
			.settings-content {
				width: 95%;
				max-height: 90vh;
			}

			.settings-header {
				padding: 16px 20px;
			}

			.settings-body {
				padding: 20px;
			}
		}`;
	}

	/**
	 * Generate Settings JavaScript functions
	 */
	public static getSettingsJS(): string {
		return `
		function openSettings() {
			document.getElementById('settingsModal').classList.add('open');
		}

		function closeSettings() {
			document.getElementById('settingsModal').classList.remove('open');
		}

		// Close modal when clicking outside
		document.getElementById('settingsModal')?.addEventListener('click', (e) => {
			if (e.target.id === 'settingsModal') {
				closeSettings();
			}
		});

		function updateSetting(path, value) {
			const parts = path.split('.');
			const settings = {};
			let current = settings;

			for (let i = 0; i < parts.length - 1; i++) {
				current[parts[i]] = {};
				current = current[parts[i]];
			}
			current[parts[parts.length - 1]] = value;

			vscode.postMessage({
				type: 'updateSettings',
				settings: settings
			});
		}`;
	}
}
