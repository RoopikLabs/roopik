/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef, useEffect } from 'react';
import type { InspectedElement } from '../utils/inspectOverlay';
import './BottomActionBar.css';

interface BottomActionBarProps {
	onSelectMode?: () => void;
	onInspectMode?: () => void;
	onRectangleSelection?: () => void;
	onAIChat?: () => void;
	onActionsPanel?: () => void;
	// Contextual actions (auto-show based on selection)
	onTextEdit?: () => void;
	onImageReplace?: () => void;
	onColorPicker?: () => void;
	// Inspection
	inspectedElement?: InspectedElement | null;
	onOpenInEditor?: (file: string, line: number) => void;
	// State
	isSelectMode?: boolean;
	isInspectMode?: boolean;
	isRectangleMode?: boolean;
	selectedElementType?: 'text' | 'image' | 'colored' | null;
}

// Available slash commands
const COMMANDS = [
	{ name: '/animate', icon: '✨', description: 'Add animation to element' },
	{ name: '/resize', icon: '↔️', description: 'Change element size' },
	{ name: '/color', icon: '🎨', description: 'Change colors' },
	{ name: '/spacing', icon: '📏', description: 'Adjust padding/margin' },
	{ name: '/layout', icon: '📐', description: 'Change layout properties' },
	{ name: '/text', icon: '📝', description: 'Edit text content' }
];

export function BottomActionBar({
	onSelectMode,
	onInspectMode,
	onRectangleSelection,
	onAIChat,
	onActionsPanel,
	onTextEdit,
	onImageReplace,
	onColorPicker,
	inspectedElement,
	onOpenInEditor,
	isSelectMode = false,
	isInspectMode = false,
	isRectangleMode = false,
	selectedElementType = null
}: BottomActionBarProps) {
	const [isAIChatOpen, setIsAIChatOpen] = useState(false);
	const [isActionsPanelOpen, setIsActionsPanelOpen] = useState(false);
	const [aiInputValue, setAIInputValue] = useState('');
	const [showCommands, setShowCommands] = useState(false);
	const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
	const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
	const aiInputRef = useRef<HTMLInputElement>(null);
	const aiChatOverlayRef = useRef<HTMLDivElement>(null);
	const actionsPanelRef = useRef<HTMLDivElement>(null);

	// Filter commands based on input
	const filteredCommands = aiInputValue.startsWith('/')
		? COMMANDS.filter(cmd => cmd.name.toLowerCase().includes(aiInputValue.toLowerCase().slice(1)))
		: [];

	// Handle AI chat overlay
	const handleAIChat = () => {
		const newState = !isAIChatOpen;
		setIsAIChatOpen(newState);

		// Close properties panel if opening AI chat
		if (newState && isActionsPanelOpen) {
			setIsActionsPanelOpen(false);
		}

		onAIChat?.();

		// Focus input when opened
		if (newState) {
			setTimeout(() => aiInputRef.current?.focus(), 100);
		}
	};

	// Handle AI input change
	const handleAIInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setAIInputValue(value);
		setShowCommands(value.startsWith('/'));
		setSelectedCommandIndex(0);
	};

	// Handle command selection
	const handleCommandSelect = (commandName: string) => {
		setAIInputValue(commandName + ' ');
		setShowCommands(false);
		aiInputRef.current?.focus();
	};

	// Handle keyboard navigation in commands
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!showCommands || filteredCommands.length === 0) {
			if (e.key === 'Escape') {
				setIsAIChatOpen(false);
			}
			return;
		}

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				setSelectedCommandIndex((prev) => (prev + 1) % filteredCommands.length);
				break;
			case 'ArrowUp':
				e.preventDefault();
				setSelectedCommandIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
				break;
			case 'Enter':
				e.preventDefault();
				handleCommandSelect(filteredCommands[selectedCommandIndex].name);
				break;
			case 'Escape':
				e.preventDefault();
				setShowCommands(false);
				setIsAIChatOpen(false);
				break;
		}
	};

	// Handle actions panel toggle
	const handleActionsPanel = () => {
		const newState = !isActionsPanelOpen;
		setIsActionsPanelOpen(newState);

		// Close AI chat if opening properties panel
		if (newState && isAIChatOpen) {
			setIsAIChatOpen(false);
		}

		onActionsPanel?.();
	};

	// Handle view mode toggle (Preview/Code)
	const handleViewModeToggle = () => {
		const newMode = viewMode === 'preview' ? 'code' : 'preview';
		setViewMode(newMode);
		// TODO: Implement logic to show/hide code panel
		console.log('View mode toggled to:', newMode);
	};

	// Close overlay when clicking outside (no longer needed without backdrop)
	// Kept for future use if needed

	// Auto-open properties panel when inspect mode is active and element is inspected
	useEffect(() => {
		if (isInspectMode && inspectedElement && !isActionsPanelOpen) {
			setIsActionsPanelOpen(true);
		}
	}, [isInspectMode, inspectedElement]);

	// Close AI chat and properties panel on Escape key or click outside
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				if (isAIChatOpen) {
					setIsAIChatOpen(false);
				}
				if (isActionsPanelOpen) {
					setIsActionsPanelOpen(false);
				}
			}
		};

		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;

			// Close AI chat if clicking outside
			if (isAIChatOpen && aiChatOverlayRef.current && !aiChatOverlayRef.current.contains(e.target as Node)) {
				if (!target.closest('[title="AI Assistant (⌘K)"]')) {
					setIsAIChatOpen(false);
				}
			}

			// Close properties panel if clicking outside
			if (isActionsPanelOpen && actionsPanelRef.current && !actionsPanelRef.current.contains(e.target as Node)) {
				if (!target.closest('[title="Properties (⌘E)"]')) {
					setIsActionsPanelOpen(false);
				}
			}
		};

		window.addEventListener('keydown', handleEscape);
		window.addEventListener('mousedown', handleClickOutside);
		return () => {
			window.removeEventListener('keydown', handleEscape);
			window.removeEventListener('mousedown', handleClickOutside);
		};
	}, [isAIChatOpen, isActionsPanelOpen]);

	return (
		<>
			{/* Floating Bottom Action Bar */}
			<div className="bottom-action-bar">
				<div className="action-bar-container">
					{/* Selection Tools */}
					<div className="action-bar-section">
						<button
							className={`action-btn ${isSelectMode ? 'active' : ''}`}
							onClick={() => { setIsAIChatOpen(false); onSelectMode?.(); }}
							title="Select Mode (V)"
						>
							<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
								<path
									d="M3 3L17 10L10 10.5L7 17L3 3Z"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinejoin="round"
									fill="none"
								/>
							</svg>
						</button>

						<button
							className={`action-btn ${isInspectMode ? 'active' : ''}`}
							onClick={() => { setIsAIChatOpen(false); onInspectMode?.(); }}
							title="Inspect Mode (I)"
						>
							<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
								<path
									d="M10 3V17M3 10H17"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
								/>
								<circle
									cx="10"
									cy="10"
									r="3"
									stroke="currentColor"
									strokeWidth="1.5"
									fill="none"
								/>
							</svg>
						</button>

						<button
							className={`action-btn ${isRectangleMode ? 'active' : ''}`}
							onClick={() => { setIsAIChatOpen(false); onRectangleSelection?.(); }}
							title="Drag Selection (R)"
						>
							<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
								<rect
									x="3"
									y="3"
									width="14"
									height="14"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeDasharray="2 2"
									fill="none"
								/>
							</svg>
						</button>
					</div>

					<div className="action-bar-divider" />

					{/* Contextual Actions */}
					{selectedElementType === 'text' && onTextEdit && (
						<button
							className="action-btn contextual"
							onClick={onTextEdit}
							title="Edit Text (T)"
						>
							<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
								<path
									d="M6 3H14M10 3V17M7 17H13"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
								/>
							</svg>
						</button>
					)}

					{selectedElementType === 'image' && onImageReplace && (
						<button
							className="action-btn contextual"
							onClick={onImageReplace}
							title="Replace Image (M)"
						>
							<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
								<rect
									x="3"
									y="3"
									width="14"
									height="14"
									rx="2"
									stroke="currentColor"
									strokeWidth="1.5"
									fill="none"
								/>
								<circle cx="7" cy="7" r="1.5" fill="currentColor" />
								<path
									d="M3 13L7 9L10 12L13 9L17 13"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</button>
					)}

					{selectedElementType === 'colored' && onColorPicker && (
						<button
							className="action-btn contextual"
							onClick={onColorPicker}
							title="Pick Color (C)"
						>
							<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
								<circle
									cx="10"
									cy="10"
									r="7"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
								/>
								<path
									d="M10 3C10 3 13 6 13 10C13 11.66 11.66 13 10 13C8.34 13 7 11.66 7 10C7 6 10 3 10 3Z"
									fill="currentColor"
								/>
							</svg>
						</button>
					)}

					{(selectedElementType === 'text' || selectedElementType === 'image' || selectedElementType === 'colored') && (
						<div className="action-bar-divider" />
					)}

					{/* AI Assistant */}
					<button
						className={`action-btn ${isAIChatOpen ? 'active' : ''}`}
						onClick={handleAIChat}
						title="AI Assistant (⌘K)"
					>
						<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
							<path
								d="M10 3L12 7H16L13 10L14 14L10 12L6 14L7 10L4 7H8L10 3Z"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinejoin="round"
								fill="none"
							/>
						</svg>
					</button>

					<div className="action-bar-divider" />

					{/* Properties Panel */}
					<button
						className={`action-btn ${isActionsPanelOpen ? 'active' : ''}`}
						onClick={handleActionsPanel}
						title="Properties (⌘E)"
					>
						<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
							<circle cx="10" cy="4" r="1.5" fill="currentColor" />
							<circle cx="10" cy="10" r="1.5" fill="currentColor" />
							<circle cx="10" cy="16" r="1.5" fill="currentColor" />
							<circle cx="4" cy="10" r="1.5" fill="currentColor" />
							<circle cx="16" cy="10" r="1.5" fill="currentColor" />
						</svg>
					</button>

					<div className="action-bar-divider" />

					{/* Preview/Code Toggle */}
					<div className="view-mode-toggle">
						<button
							className={`action-btn ${viewMode === 'preview' ? 'active' : ''}`}
							onClick={handleViewModeToggle}
							title="Preview Mode"
						>
							<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
								<rect
									x="2"
									y="4"
									width="16"
									height="12"
									rx="2"
									stroke="currentColor"
									strokeWidth="1.5"
									fill="none"
								/>
								<path
									d="M6 8H14M6 11H11"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
								/>
							</svg>
						</button>
						<button
							className={`action-btn ${viewMode === 'code' ? 'active' : ''}`}
							onClick={handleViewModeToggle}
							title="Code Mode"
						>
							<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
								<path
									d="M7 6L3 10L7 14M13 6L17 10L13 14"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</button>
					</div>
				</div>
			</div>

			{/* AI Chat Input (appears just above bottom bar) */}
			{isAIChatOpen && (
				<div className="ai-chat-overlay" ref={aiChatOverlayRef}>
					<div className="ai-chat-input-container-overlay">
						<input
							ref={aiInputRef}
							type="text"
							className="ai-chat-input-overlay"
							placeholder="Type / for commands or describe what you want..."
							value={aiInputValue}
							onChange={handleAIInputChange}
							onKeyDown={handleKeyDown}
							autoFocus
						/>
						<button className="ai-chat-send-overlay" aria-label="Send">
							<svg width="18" height="18" viewBox="0 0 20 20" fill="none">
								<path
									d="M3 10h14m-6-6l6 6-6 6"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</button>

						{/* Command Suggestions Dropdown */}
						{showCommands && filteredCommands.length > 0 && (
							<div className="command-suggestions">
								{filteredCommands.map((cmd, index) => (
									<div
										key={cmd.name}
										className={`command-item ${index === selectedCommandIndex ? 'selected' : ''}`}
										onClick={() => handleCommandSelect(cmd.name)}
									>
										<div className="command-name">{cmd.name}</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{/* Actions/Properties Panel */}
			{isActionsPanelOpen && (
				<div className="actions-panel" ref={actionsPanelRef}>
					<div className="actions-panel-header">
						<div className="actions-panel-title">
							<svg width="16" height="16" viewBox="0 0 20 20" fill="none">
								<circle cx="10" cy="4" r="1.5" fill="currentColor" />
								<circle cx="10" cy="10" r="1.5" fill="currentColor" />
								<circle cx="10" cy="16" r="1.5" fill="currentColor" />
							</svg>
							<span>Properties</span>
						</div>
						<button className="actions-panel-close" onClick={handleActionsPanel} aria-label="Close Properties Panel">
							<svg width="16" height="16" viewBox="0 0 20 20" fill="none">
								<path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
							</svg>
						</button>
					</div>
				<div className="actions-panel-content">
					{inspectedElement ? (
						<div className="inspected-element-details">
							{/* Component Info */}
							<div className="property-section">
								<div className="property-section-title">Component</div>
								<div className="property-item">
									<span className="property-label">Name</span>
									<span className="property-value">{inspectedElement.componentName}</span>
								</div>
								{inspectedElement.file && (
									<div className="property-item">
										<span className="property-label">Source</span>
										<div className="property-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
											<span style={{ fontSize: '11px', opacity: 0.8 }}>
												{inspectedElement.file.split('/').pop()}:{inspectedElement.line}
											</span>
											<button
												className="open-in-editor-btn"
												onClick={() => {
													if (inspectedElement.file && inspectedElement.line && onOpenInEditor) {
														onOpenInEditor(inspectedElement.file, inspectedElement.line);
													}
												}}
												title="Open in editor"
											>
												<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
													<path d="M9 2L14 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
													<path d="M14 7H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
												</svg>
											</button>
										</div>
									</div>
								)}
							</div>

							{/* Props */}
							{inspectedElement.props && Object.keys(inspectedElement.props).length > 0 && (
								<div className="property-section">
									<div className="property-section-title">Props</div>
									{Object.entries(inspectedElement.props).map(([key, value]) => (
										<div key={key} className="property-item">
											<span className="property-label">{key}</span>
											<span className="property-value" style={{ fontSize: '11px', opacity: 0.8 }}>
												{typeof value === 'object' ? JSON.stringify(value) : String(value)}
											</span>
										</div>
									))}
								</div>
							)}

							{/* Computed Styles */}
							{inspectedElement.computedStyles && (
								<div className="property-section">
									<div className="property-section-title">Styles</div>
									{inspectedElement.computedStyles.display && (
										<div className="property-item">
											<span className="property-label">display</span>
											<span className="property-value">{inspectedElement.computedStyles.display}</span>
										</div>
									)}
									{inspectedElement.computedStyles.width && (
										<div className="property-item">
											<span className="property-label">width</span>
											<span className="property-value">{inspectedElement.computedStyles.width}</span>
										</div>
									)}
									{inspectedElement.computedStyles.height && (
										<div className="property-item">
											<span className="property-label">height</span>
											<span className="property-value">{inspectedElement.computedStyles.height}</span>
										</div>
									)}
									{inspectedElement.computedStyles.padding && (
										<div className="property-item">
											<span className="property-label">padding</span>
											<span className="property-value">{inspectedElement.computedStyles.padding}</span>
										</div>
									)}
									{inspectedElement.computedStyles.margin && (
										<div className="property-item">
											<span className="property-label">margin</span>
											<span className="property-value">{inspectedElement.computedStyles.margin}</span>
										</div>
									)}
									{inspectedElement.computedStyles.color && (
										<div className="property-item">
											<span className="property-label">color</span>
											<div className="property-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
												<span
													style={{
														display: 'inline-block',
														width: '12px',
														height: '12px',
														borderRadius: '2px',
														backgroundColor: inspectedElement.computedStyles.color,
														border: '1px solid rgba(0,0,0,0.1)'
													}}
												/>
												<span>{inspectedElement.computedStyles.color}</span>
											</div>
										</div>
									)}
									{inspectedElement.computedStyles.backgroundColor && (
										<div className="property-item">
											<span className="property-label">background</span>
											<div className="property-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
												<span
													style={{
														display: 'inline-block',
														width: '12px',
														height: '12px',
														borderRadius: '2px',
														backgroundColor: inspectedElement.computedStyles.backgroundColor,
														border: '1px solid rgba(0,0,0,0.1)'
													}}
												/>
												<span>{inspectedElement.computedStyles.backgroundColor}</span>
											</div>
										</div>
									)}
								</div>
							)}
						</div>
					) : (
						<div className="actions-panel-placeholder">
							<svg width="48" height="48" viewBox="0 0 20 20" fill="none" opacity="0.3">
								<circle cx="10" cy="4" r="1.5" fill="currentColor" />
								<circle cx="10" cy="10" r="1.5" fill="currentColor" />
								<circle cx="10" cy="16" r="1.5" fill="currentColor" />
							</svg>
							<p>{isInspectMode ? 'Hover over elements to inspect them' : 'Select an element to see available properties and actions'}</p>
						</div>
					)}
				</div>
				</div>
			)}
		</>
	);
}
