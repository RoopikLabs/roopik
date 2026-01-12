/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import './BottomActionBar.css';

interface BottomActionBarProps {
	onSelectMode?: () => void;
	onInspectMode?: () => void;
	onAIChat?: () => void;
	onAISubmit?: (input: string, autoSend?: boolean, includeScreenshot?: boolean) => void;
	onScreenshotToggle?: (enabled: boolean) => void;
	screenshotEnabled?: boolean;
	openChatAt?: { x: number; y: number; top: number; bottom: number; nonce: number } | null;
	onChatAnchorConsumed?: () => void;
	onChatClosed?: () => void;
	onEscape?: () => void;
	// State
	isSelectMode?: boolean;
	isInspectMode?: boolean;
}

// Available slash commands
const COMMANDS = [
	// allow-any-unicode-next-line
	{ name: '/animate', icon: '✨', description: 'Add animation to element' },
	// allow-any-unicode-next-line
	{ name: '/resize', icon: '↔️', description: 'Change element size' },
	// allow-any-unicode-next-line
	{ name: '/color', icon: '🎨', description: 'Change colors' },
	// allow-any-unicode-next-line
	{ name: '/spacing', icon: '📏', description: 'Adjust padding/margin' },
	// allow-any-unicode-next-line
	{ name: '/layout', icon: '📐', description: 'Change layout properties' },
	// allow-any-unicode-next-line
	{ name: '/text', icon: '📝', description: 'Edit text content' }
];

export function BottomActionBar({
	onSelectMode,
	onInspectMode,
	onAIChat,
	onAISubmit,
	onScreenshotToggle,
	screenshotEnabled = false,
	openChatAt,
	onChatAnchorConsumed,
	onChatClosed,
	onEscape,
	isSelectMode = false,
	isInspectMode = false
}: BottomActionBarProps) {
	const [isAIChatOpen, setIsAIChatOpen] = useState(false);
	const [aiInputValue, setAIInputValue] = useState('');
	const [showCommands, setShowCommands] = useState(false);
	const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
	const [chatAnchor, setChatAnchor] = useState<{ x: number; y: number; top: number; bottom: number } | null>(null);
	const [overlayHeight, setOverlayHeight] = useState(0);
	const [captureScreenshot, setCaptureScreenshot] = useState(screenshotEnabled);
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
		if (newState) {
			setChatAnchor(null);
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

	const submitAIInput = (autoSend = true) => {
		const trimmed = aiInputValue.trim();
		if (!trimmed) {
			return;
		}
		onAISubmit?.(trimmed, autoSend, captureScreenshot);
		setAIInputValue('');
		setShowCommands(false);
		setIsAIChatOpen(false);
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
			if (e.key === 'Enter') {
				e.preventDefault();
				submitAIInput(true);
				return;
			}
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

	useEffect(() => {
		setCaptureScreenshot(screenshotEnabled);
	}, [screenshotEnabled]);

	// When AI chat closes, notify parent (for unlocking inspect selection)
	const prevIsAIChatOpenRef = useRef(isAIChatOpen);
	useEffect(() => {
		// Only trigger when transitioning from open to closed
		if (prevIsAIChatOpenRef.current && !isAIChatOpen) {
			onChatClosed?.();
		}
		prevIsAIChatOpenRef.current = isAIChatOpen;
	}, [isAIChatOpen, onChatClosed]);

	useEffect(() => {
		if (!openChatAt) {
			return;
		}
		setChatAnchor({ x: openChatAt.x, y: openChatAt.y, top: openChatAt.top, bottom: openChatAt.bottom });
		setIsAIChatOpen(true);
		onChatAnchorConsumed?.();
		setTimeout(() => aiInputRef.current?.focus(), 100);
	}, [openChatAt, onChatAnchorConsumed]);

	useLayoutEffect(() => {
		if (!isAIChatOpen) {
			return;
		}
		if (!aiChatOverlayRef.current) {
			return;
		}
		const { height } = aiChatOverlayRef.current.getBoundingClientRect();
		setOverlayHeight(height);
	}, [isAIChatOpen, aiInputValue, showCommands]);

	// Global keyboard shortcuts - ESC key handler
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				// Close AI chat if open
				if (isAIChatOpen) {
					e.preventDefault();
					e.stopPropagation();
					setIsAIChatOpen(false);
					onEscape?.();
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

	const overlayStyle = chatAnchor
		? {
			left: '50%',
			top: (() => {
				const gap = 6;
				const edgeTop = 12;
				const edgeBottom = 120;
				const height = overlayHeight || 56;
				const preferBelow = chatAnchor.bottom + gap + height <= window.innerHeight - edgeBottom;
				let top = preferBelow ? chatAnchor.bottom + gap : chatAnchor.top - gap - height;
				if (top + height > window.innerHeight - edgeBottom) {
					top = window.innerHeight - height - edgeBottom;
				}
				if (top < edgeTop) {
					top = edgeTop;
				}
				return top;
			})(),
			bottom: 'auto',
			transform: 'translateX(-50%)'
		}
		: undefined;

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

					</div>

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

				</div>
			</div>

			{/* AI Chat Input (appears just above bottom bar) */}
			{isAIChatOpen && (
				<div className="ai-chat-overlay" ref={aiChatOverlayRef} style={overlayStyle}>
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
						<button
							className={`ai-chat-screenshot-toggle ${captureScreenshot ? 'active' : ''}`}
							aria-label="Attach screenshot"
							title="Attach screenshot"
							onClick={() => {
								const next = !captureScreenshot;
								setCaptureScreenshot(next);
								onScreenshotToggle?.(next);
							}}
						>
							<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<rect x="2.5" y="4" width="11" height="8" rx="1.5" />
								<path d="M6 4 L7 2.5 H9 L10 4" />
								<circle cx="8" cy="8" r="2.2" />
							</svg>
						</button>
						<button
							className="ai-chat-add-overlay"
							aria-label="Add to context"
							title="Add to context"
							onClick={() => submitAIInput(false)}
						>
							<svg width="18" height="18" viewBox="0 0 20 20" fill="none">
								<path
									d="M10 4v12M4 10h12"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
								/>
							</svg>
						</button>
						<button
							className="ai-chat-send-overlay"
							aria-label="Send"
							onClick={() => submitAIInput(true)}
						>
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
