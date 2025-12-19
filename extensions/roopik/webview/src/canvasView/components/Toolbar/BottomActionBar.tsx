/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef, useEffect } from 'react';
import './BottomActionBar.css';

interface BottomActionBarProps {
	onSelectMode?: () => void;
	onInspectMode?: () => void;
	onRectangleSelection?: () => void;
	onAIChat?: () => void;
	// Contextual actions (auto-show based on selection)
	onTextEdit?: () => void;
	onImageReplace?: () => void;
	onColorPicker?: () => void;
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
	onTextEdit,
	onImageReplace,
	onColorPicker,
	isSelectMode = false,
	isInspectMode = false,
	isRectangleMode = false,
	selectedElementType = null
}: BottomActionBarProps) {
	const [isAIChatOpen, setIsAIChatOpen] = useState(false);
	const [aiInputValue, setAIInputValue] = useState('');
	const [showCommands, setShowCommands] = useState(false);
	const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
	const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
	const aiInputRef = useRef<HTMLInputElement>(null);
	const aiChatOverlayRef = useRef<HTMLDivElement>(null);

	// Filter commands based on input
	const filteredCommands = aiInputValue.startsWith('/')
		? COMMANDS.filter(cmd => cmd.name.toLowerCase().includes(aiInputValue.toLowerCase().slice(1)))
		: [];

	// Handle AI chat overlay
	const handleAIChat = () => {
		const newState = !isAIChatOpen;
		setIsAIChatOpen(newState);

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

	// Handle view mode toggle (Preview/Code)
	const handleViewModeToggle = () => {
		const newMode = viewMode === 'preview' ? 'code' : 'preview';
		setViewMode(newMode);
		// TODO: Implement logic to show/hide code panel
		console.log('View mode toggled to:', newMode);
	};

	// Global keyboard shortcuts - ESC key handler
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				// Close AI chat if open
				if (isAIChatOpen) {
					e.preventDefault();
					e.stopPropagation();
					setIsAIChatOpen(false);
					return;
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
		};

		// Listen on parent document (capture phase)
		document.addEventListener('keydown', handleEscape, true);
		window.addEventListener('mousedown', handleClickOutside);

		return () => {
			document.removeEventListener('keydown', handleEscape, true);
			window.removeEventListener('mousedown', handleClickOutside);
		};
	}, [isAIChatOpen]);

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

					{/* Placeholder - Reserved for future feature */}
					<button
						className="action-btn"
						onClick={() => console.log('Placeholder button - feature coming soon')}
						title="Placeholder (Coming Soon)"
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
		</>
	);
}
