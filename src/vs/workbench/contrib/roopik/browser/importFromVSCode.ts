/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { localize } from '../../../../nls.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { isWindows, isMacintosh } from '../../../../base/common/platform.js';
import { joinPath, dirname, basename } from '../../../../base/common/resources.js';
import * as json from '../../../../base/common/json.js';

/**
 * Get VS Code user data directory URI based on platform
 */
function getVSCodeUserDataURI(environmentService: INativeEnvironmentService): URI {
	const userHome = environmentService.userHome;

	if (isWindows) {
		// Windows: %APPDATA%\Code\User
		return joinPath(dirname(dirname(environmentService.userRoamingDataHome)), 'Code', 'User');
	}

	if (isMacintosh) {
		// macOS: ~/Library/Application Support/Code/User
		return joinPath(userHome, 'Library', 'Application Support', 'Code', 'User');
	}

	// Linux: ~/.config/Code/User (or $XDG_CONFIG_HOME/Code/User)
	return joinPath(dirname(dirname(environmentService.userRoamingDataHome)), 'Code', 'User');
}

/**
 * Check if VS Code is installed by checking if its user data folder exists
 */
async function isVSCodeInstalled(fileService: IFileService, vscodeUserURI: URI): Promise<boolean> {
	try {
		const stat = await fileService.exists(vscodeUserURI);
		return stat;
	} catch {
		return false;
	}
}

/**
 * Import settings, keybindings, and snippets from VS Code
 */
export async function importFromVSCode(
	fileService: IFileService,
	notificationService: INotificationService,
	dialogService: IDialogService,
	environmentService: INativeEnvironmentService
): Promise<void> {
	const vscodeUserURI = getVSCodeUserDataURI(environmentService);

	// Check if VS Code is installed
	if (!(await isVSCodeInstalled(fileService, vscodeUserURI))) {
		await dialogService.confirm({
			message: localize('vscode.notFound', "VS Code installation not found"),
			detail: localize('vscode.notFound.detail', "Could not find VS Code user data directory. Make sure VS Code is installed on your system."),
			primaryButton: localize('ok', "OK")
		});
		return;
	}

	// Confirm import
	const result = await dialogService.confirm({
		message: localize('import.confirm', "Import from VS Code?"),
		detail: localize('import.confirm.detail', "This will copy:\n• Settings & keybindings\n• Code snippets\n• Installed extensions (without their state)\n\nYour existing Roopik settings will not be overwritten. Extensions will need to be reconfigured."),
		primaryButton: localize('import', "Import"),
		cancelButton: localize('cancel', "Cancel")
	});

	if (!result.confirmed) {
		return;
	}

	try {
		const roopikUserURI = joinPath(environmentService.userRoamingDataHome, 'User');

		const importedFiles: string[] = [];
		const filesToImport = [
			{ name: 'settings.json', description: 'Settings' },
			{ name: 'keybindings.json', description: 'Keybindings' }
		];

		// Import individual files
		for (const file of filesToImport) {
			const sourceURI = joinPath(vscodeUserURI, file.name);
			const targetURI = joinPath(roopikUserURI, file.name);

			if (await fileService.exists(sourceURI)) {
				try {
					const sourceContent = await fileService.readFile(sourceURI);
					const sourceText = sourceContent.value.toString();

					// Check if target file exists
					if (await fileService.exists(targetURI)) {
						// Merge with existing file
						try {
							const targetContent = await fileService.readFile(targetURI);
							const targetText = targetContent.value.toString();
							// Use JSONC parser to handle comments and trailing commas
							const sourceJson = json.parse(sourceText);
							const targetJson = json.parse(targetText);

							// Merge: Roopik settings take precedence
							const merged = { ...sourceJson, ...targetJson };

							await fileService.writeFile(targetURI, VSBuffer.fromString(JSON.stringify(merged, null, '\t')));
							importedFiles.push(file.description);
						} catch (err) {
							// If merge fails, skip this file
							console.error(`Failed to merge ${file.name}:`, err);
						}
					} else {
						// Simply copy if target doesn't exist
						await fileService.writeFile(targetURI, VSBuffer.fromString(sourceText));
						importedFiles.push(file.description);
					}
				} catch (err) {
					console.error(`Failed to import ${file.name}:`, err);
				}
			}
		}

		// Import snippets directory
		const sourceSnippetsURI = joinPath(vscodeUserURI, 'snippets');
		const targetSnippetsURI = joinPath(roopikUserURI, 'snippets');
		const importedSnippets: string[] = [];

		if (await fileService.exists(sourceSnippetsURI)) {
			try {
				// Ensure target snippets directory exists
				await fileService.createFolder(targetSnippetsURI);

				const snippetEntries = await fileService.resolve(sourceSnippetsURI);
				if (snippetEntries.children) {
					for (const entry of snippetEntries.children) {
						if (!entry.isDirectory) {
							const fileName = basename(entry.resource);
							if (fileName.endsWith('.json') || fileName.endsWith('.code-snippets')) {
								const targetPath = joinPath(targetSnippetsURI, fileName);

								if (!(await fileService.exists(targetPath))) {
									const content = await fileService.readFile(entry.resource);
									await fileService.writeFile(targetPath, content.value);
									importedSnippets.push(fileName);
								}
							}
						}
					}
				}
			} catch (err) {
				console.error('Failed to import snippets:', err);
			}
		}

		// Import extensions directory
		// VS Code stores extensions in ~/.vscode/extensions (in user home, NOT AppData)
		const sourceExtensionsURI = joinPath(environmentService.userHome, '.vscode', 'extensions');
		// Roopik uses environmentService.extensionsPath
		const targetExtensionsURI = URI.file(environmentService.extensionsPath);
		const importedExtensions: string[] = [];

		console.log('VS Code extensions path:', sourceExtensionsURI.fsPath);
		console.log('Roopik extensions path:', targetExtensionsURI.fsPath);

		if (await fileService.exists(sourceExtensionsURI)) {
			console.log('VS Code extensions directory found!');
			try {
				// Ensure target extensions directory exists
				await fileService.createFolder(targetExtensionsURI);

				// First, copy the extensions.json file (tracks installed extensions)
				const sourceExtensionsJsonURI = joinPath(sourceExtensionsURI, 'extensions.json');
				const targetExtensionsJsonURI = joinPath(targetExtensionsURI, 'extensions.json');

				if (await fileService.exists(sourceExtensionsJsonURI)) {
					try {
						const sourceJsonContent = await fileService.readFile(sourceExtensionsJsonURI);
						const sourceExtList = json.parse(sourceJsonContent.value.toString()) as unknown[];

						// If target extensions.json exists, merge them
						let targetExtList: unknown[] = [];
						if (await fileService.exists(targetExtensionsJsonURI)) {
							const targetJsonContent = await fileService.readFile(targetExtensionsJsonURI);
							targetExtList = json.parse(targetJsonContent.value.toString()) as unknown[];
						}

						// Get existing extension identifiers to avoid duplicates
						const existingIds = new Set(
							targetExtList
								.filter((ext): ext is { identifier: { id: string } } =>
									typeof ext === 'object' && ext !== null && 'identifier' in ext)
								.map(ext => ext.identifier.id.toLowerCase())
						);

						// Add extensions that don't already exist
						for (const ext of sourceExtList) {
							if (typeof ext === 'object' && ext !== null && 'identifier' in ext) {
								const extWithId = ext as { identifier: { id: string } };
								if (!existingIds.has(extWithId.identifier.id.toLowerCase())) {
									targetExtList.push(ext);
								}
							}
						}

						await fileService.writeFile(targetExtensionsJsonURI, VSBuffer.fromString(JSON.stringify(targetExtList, null, '\t')));
						console.log('Updated extensions.json with', targetExtList.length, 'extensions');
					} catch (err) {
						console.error('Failed to merge extensions.json:', err);
					}
				}

				// Then copy the extension folders
				const extensionEntries = await fileService.resolve(sourceExtensionsURI);
				console.log('Found extensions:', extensionEntries.children?.length || 0);
				if (extensionEntries.children) {
					for (const entry of extensionEntries.children) {
						if (entry.isDirectory) {
							const extName = basename(entry.resource);
							// Skip internal/system extensions
							if (extName.startsWith('.') || extName === 'node_modules') {
								continue;
							}

							const targetExtPath = joinPath(targetExtensionsURI, extName);

							// Only copy if not already exists
							if (!(await fileService.exists(targetExtPath))) {
								try {
									await fileService.copy(entry.resource, targetExtPath);
									importedExtensions.push(extName);
								} catch (err) {
									console.error(`Failed to copy extension ${extName}:`, err);
								}
							}
						}
					}
				}
			} catch (err) {
				console.error('Failed to import extensions:', err);
			}
		}

		// Show detailed success message
		if (importedFiles.length > 0 || importedSnippets.length > 0 || importedExtensions.length > 0) {
			const details: string[] = [];
			if (importedFiles.length > 0) {
				details.push(`• ${importedFiles.join(', ')}`);
			}
			if (importedSnippets.length > 0) {
				details.push(`• ${importedSnippets.length} snippet file(s): ${importedSnippets.slice(0, 3).join(', ')}${importedSnippets.length > 3 ? '...' : ''}`);
			}
			if (importedExtensions.length > 0) {
				details.push(`• ${importedExtensions.length} extension(s): ${importedExtensions.slice(0, 3).join(', ')}${importedExtensions.length > 3 ? '...' : ''}`);
			}

			notificationService.notify({
				severity: Severity.Info,
				message: localize('import.success', "Imported from VS Code:\n{0}\n\nRestart Roopik to see extensions.", details.join('\n'))
			});
		} else {
			notificationService.notify({
				severity: Severity.Warning,
				message: localize('import.noFiles', "No new files found to import from VS Code.\n\nAll settings, snippets, and extensions are already present.")
			});
		}
	} catch (error) {
		notificationService.notify({
			severity: Severity.Error,
			message: localize('import.error', "Failed to import from VS Code: {0}", error instanceof Error ? error.message : String(error))
		});
	}
}
