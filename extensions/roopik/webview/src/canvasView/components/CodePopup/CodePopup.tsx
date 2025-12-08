/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import type { OnMount, Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import * as monaco from 'monaco-editor';
import './CodePopup.css';
// Import inline codicon font for Monaco search bar icons
import '../../assets/codicon-inline.css';

// Configure Monaco Environment to use mock workers and suppress errors
// This prevents SecurityError/403 when Monaco tries to create web workers in VSCode webview
if (typeof window !== 'undefined') {
	const createMockWorker = () => ({
		postMessage: () => {},
		terminate: () => {},
		onmessage: null,
		onerror: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => true
	});

	(window as unknown as Record<string, unknown>).MonacoEnvironment = {
		getWorker: () => createMockWorker()
	};

	// Suppress the 403/401/SecurityError console errors for Monaco's dynamic imports
	// Monaco tries to load language workers which can't be fetched in webview context
	const originalError = console.error;
	console.error = (...args: unknown[]) => {
		const msg = String(args[0] || '');
		if (
			msg.includes('assets/') ||
			msg.includes('lspLanguageFeatures') ||
			msg.includes('tsMode') ||
			msg.includes('jsonMode') ||
			msg.includes('cssMode') ||
			msg.includes('htmlMode') ||
			msg.includes('typescript.js') ||
			msg.includes('javascript.js') ||
			msg.includes('.worker') ||
			msg.includes('codicon') ||
			msg.includes('401') ||
			msg.includes('403') ||
			msg.includes('ERR_ABORTED') ||
			msg.includes('net::ERR_') ||
			msg.includes('vscode-webview://')
		) {
			return; // Suppress Monaco-related network errors
		}
		originalError.apply(console, args);
	};
}

// Configure Monaco to use local bundle instead of CDN (required for VSCode webview)
loader.config({ monaco });

// ============================================================
// Types
// ============================================================

export interface CodeFile {
	filename: string;
	content: string;
	language: string;
	isEntry?: boolean;
}

export interface CodePopupProps {
	sandboxId: string;
	sandboxName: string;
	files: CodeFile[];
	entryFile?: string;
	/** Initial line to scroll to and highlight (1-indexed) */
	initialLine?: number;
	/** End line for range highlight (1-indexed, optional - if omitted, only initialLine is highlighted) */
	initialLineEnd?: number;
	onClose: () => void;
	onSave: (sandboxId: string, filename: string, content: string) => void;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Get file icon based on extension
 */
function getFileIcon(filename: string): string {
	const ext = filename.split('.').pop()?.toLowerCase() || '';
	const iconMap: Record<string, string> = {
		'tsx': '⚛️',
		'ts': '📘',
		'jsx': '⚛️',
		'js': '📒',
		'css': '🎨',
		'scss': '🎨',
		'html': '🌐',
		'json': '📋',
		'md': '📝',
		'vue': '💚',
		'svelte': '🔶',
	};
	return iconMap[ext] || '📄';
}

// ============================================================
// Component
// ============================================================

export function CodePopup({
	sandboxId,
	sandboxName,
	files,
	entryFile,
	initialLine,
	initialLineEnd,
	onClose,
	onSave,
}: CodePopupProps) {
	// Find initial tab - entry file or first file
	const initialTab = entryFile
		? files.findIndex(f => f.filename === entryFile)
		: 0;

	const [activeTab, setActiveTab] = useState(Math.max(0, initialTab));
	const [editedFiles, setEditedFiles] = useState<Map<string, string>>(new Map());
	const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());
	const [showCloseConfirm, setShowCloseConfirm] = useState(false);
	const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
	const monacoRef = useRef<Monaco | null>(null);
	// Ref to store current save function - avoids stale closure in Monaco command
	const saveCurrentFileRef = useRef<() => void>(() => {});

	const activeFile = files[activeTab];

	// Get current content (edited or original)
	const getCurrentContent = useCallback((filename: string) => {
		return editedFiles.get(filename) ?? files.find(f => f.filename === filename)?.content ?? '';
	}, [editedFiles, files]);

	// Track if initial highlight has been applied (only on first mount)
	const initialHighlightApplied = useRef(false);

	// Handle editor mount
	const handleEditorMount: OnMount = (editor, monacoInstance) => {
		editorRef.current = editor;
		monacoRef.current = monacoInstance;

		// Configure editor for better UX
		editor.updateOptions({
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			wordWrap: 'on',
			fontSize: 13,
			lineNumbers: 'on',
			renderLineHighlight: 'line',
			automaticLayout: true,
		});

		// Add Ctrl+S handler - use ref to always get latest save function
		editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
			saveCurrentFileRef.current();
		});

		// Re-enable Ctrl+X (cut) - VSCode webview intercepts this by default
		// We explicitly bind it to Monaco's built-in cut action
		editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyX, () => {
			editor.trigger('keyboard', 'editor.action.clipboardCutAction', null);
		});

		// Apply initial line highlight (only once on first mount)
		if (initialLine && !initialHighlightApplied.current) {
			initialHighlightApplied.current = true;
			const startLine = initialLine;
			const endLine = initialLineEnd ?? initialLine;

			// Scroll to the line (centered in view)
			editor.revealLineInCenter(startLine);

			// Set cursor position at the start of the line
			editor.setPosition({ lineNumber: startLine, column: 1 });

			// Select the line range for visual highlighting
			editor.setSelection({
				startLineNumber: startLine,
				startColumn: 1,
				endLineNumber: endLine,
				endColumn: editor.getModel()?.getLineMaxColumn(endLine) ?? 1,
			});

			// Add decorations for a more prominent highlight
			editor.deltaDecorations([], [
				{
					range: new monacoInstance.Range(startLine, 1, endLine, 1),
					options: {
						isWholeLine: true,
						className: 'code-popup-line-highlight',
						glyphMarginClassName: 'code-popup-glyph-highlight',
					},
				},
			]);
		}

		// Focus editor
		editor.focus();
	};

	// Handle content change
	const handleEditorChange = useCallback((value: string | undefined) => {
		if (!activeFile || value === undefined) return;

		const originalContent = files.find(f => f.filename === activeFile.filename)?.content ?? '';
		const isDirty = value !== originalContent;

		setEditedFiles(prev => {
			const next = new Map(prev);
			next.set(activeFile.filename, value);
			return next;
		});

		setDirtyFiles(prev => {
			const next = new Set(prev);
			if (isDirty) {
				next.add(activeFile.filename);
			} else {
				next.delete(activeFile.filename);
			}
			return next;
		});
	}, [activeFile, files]);

	// Save current file
	const handleSaveCurrentFile = useCallback(() => {
		if (!activeFile) return;

		const content = getCurrentContent(activeFile.filename);
		onSave(sandboxId, activeFile.filename, content);

		// Mark as clean
		setDirtyFiles(prev => {
			const next = new Set(prev);
			next.delete(activeFile.filename);
			return next;
		});
	}, [activeFile, sandboxId, getCurrentContent, onSave]);

	// Keep the ref updated with the latest save function
	useEffect(() => {
		saveCurrentFileRef.current = handleSaveCurrentFile;
	}, [handleSaveCurrentFile]);

	// Save all dirty files
	const handleSaveAll = useCallback(() => {
		dirtyFiles.forEach(filename => {
			const content = getCurrentContent(filename);
			onSave(sandboxId, filename, content);
		});
		setDirtyFiles(new Set());
	}, [dirtyFiles, sandboxId, getCurrentContent, onSave]);

	// Handle tab switch
	const handleTabClick = useCallback((index: number) => {
		setActiveTab(index);
		// Focus editor after tab switch
		setTimeout(() => editorRef.current?.focus(), 50);
	}, []);

	// Handle close - show inline confirmation if there are unsaved changes
	const handleClose = useCallback(() => {
		if (dirtyFiles.size > 0) {
			setShowCloseConfirm(true);
		} else {
			onClose();
		}
	}, [dirtyFiles.size, onClose]);

	// Confirm close (discard changes)
	const handleConfirmClose = useCallback(() => {
		setShowCloseConfirm(false);
		onClose();
	}, [onClose]);

	// Cancel close
	const handleCancelClose = useCallback(() => {
		setShowCloseConfirm(false);
	}, []);

	// No files to show
	if (files.length === 0) {
		return (
			<div className="code-popup-overlay" onClick={handleClose}>
				<div className="code-popup" onClick={e => e.stopPropagation()}>
					<div className="code-popup-header">
						<span className="code-popup-title">{sandboxName}</span>
						<button className="code-popup-close" onClick={handleClose}>×</button>
					</div>
					<div className="code-popup-empty">
						No source files found for this component.
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="code-popup-overlay" onClick={handleClose}>
			<div className="code-popup" onClick={e => e.stopPropagation()}>
				{/* Header */}
				<div className="code-popup-header">
					<span className="code-popup-title">{sandboxName}</span>
					<div className="code-popup-actions">
						{dirtyFiles.size > 0 && (
							<button
								className="code-popup-save-all"
								onClick={handleSaveAll}
								title="Save all changes (Ctrl+Shift+S)"
							>
								Save All ({dirtyFiles.size})
							</button>
						)}
						<button className="code-popup-close" onClick={handleClose}>×</button>
					</div>
				</div>

				{/* Tabs */}
				<div className="code-popup-tabs">
					{files.map((file, index) => (
						<button
							key={file.filename}
							className={`code-popup-tab ${index === activeTab ? 'active' : ''} ${file.isEntry ? 'entry' : ''}`}
							onClick={() => handleTabClick(index)}
							title={file.filename}
						>
							<span className="tab-icon">{getFileIcon(file.filename)}</span>
							<span className="tab-name">{file.filename}</span>
							{dirtyFiles.has(file.filename) && (
								<span className="tab-dirty">●</span>
							)}
						</button>
					))}
				</div>

				{/* Editor */}
				<div className="code-popup-editor">
					<Editor
						height="100%"
						language={activeFile?.language || 'plaintext'}
						value={getCurrentContent(activeFile?.filename || '')}
						theme="vs-dark"
						onMount={handleEditorMount}
						onChange={handleEditorChange}
						options={{
							readOnly: false,
							minimap: { enabled: false },
							scrollBeyondLastLine: false,
							wordWrap: 'on',
							fontSize: 13,
							lineNumbers: 'on',
							renderLineHighlight: 'line',
							automaticLayout: true,
							tabSize: 2,
							insertSpaces: false,
							folding: true,
							glyphMargin: false,
							lineDecorationsWidth: 8,
							lineNumbersMinChars: 3,
							// Disable features that require workers in webview
							quickSuggestions: false,
							suggestOnTriggerCharacters: false,
							parameterHints: { enabled: false },
							hover: { enabled: false },
							codeLens: false,
							inlayHints: { enabled: 'off' },
							formatOnPaste: false,
							formatOnType: false,
						}}
					/>
				</div>

				{/* Footer */}
				<div className="code-popup-footer">
					<span className="code-popup-hint">
						Ctrl+S to save • ESC to close
					</span>
					<span className="code-popup-language">
						{activeFile?.language || 'plaintext'}
					</span>
				</div>

				{/* Inline close confirmation modal */}
				{showCloseConfirm && (
					<div className="code-popup-confirm-overlay">
						<div className="code-popup-confirm">
							<p>You have unsaved changes in {dirtyFiles.size} file(s).</p>
							<p>Discard changes and close?</p>
							<div className="code-popup-confirm-actions">
								<button className="confirm-btn cancel" onClick={handleCancelClose}>
									Cancel
								</button>
								<button className="confirm-btn discard" onClick={handleConfirmClose}>
									Discard & Close
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

export default CodePopup;
