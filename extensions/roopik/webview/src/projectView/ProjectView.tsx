import { useState, useEffect, useRef } from 'react';
import { BottomActionBar } from '../components/BottomActionBar';
import type { InspectedElement } from '../utils/inspectOverlay';
import './ProjectView.css';

// VS Code API
declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

// Props injected by extension
declare global {
	interface Window {
		VITE_SERVER_URL?: string;
		INITIAL_LOADING?: boolean;
	}
}

function ProjectView() {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [addressBarValue, setAddressBarValue] = useState(window.VITE_SERVER_URL || 'Loading...');
	const [isLoading, setIsLoading] = useState(window.INITIAL_LOADING !== false);
	const [highlightMode, setHighlightMode] = useState(false);
	const [showNotification, setShowNotification] = useState(false);
	const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
	const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const notificationTimeoutRef = useRef<number | null>(null);

	// Bottom Action Bar state
	const [isSelectMode, setIsSelectMode] = useState(false);
	const [isInspectMode, setIsInspectMode] = useState(false);
	const [isRectangleMode, setIsRectangleMode] = useState(false);
	const [inspectedElement, setInspectedElement] = useState<InspectedElement | null>(null);

	// Show debug notification with auto-dismiss
	const showDebugNotification = () => {
		setShowNotification(true);

		if (notificationTimeoutRef.current) {
			clearTimeout(notificationTimeoutRef.current);
		}

		notificationTimeoutRef.current = setTimeout(() => {
			setShowNotification(false);
		}, 10000);
	};

	const hideDebugNotification = () => {
		setShowNotification(false);
		if (notificationTimeoutRef.current) {
			clearTimeout(notificationTimeoutRef.current);
			notificationTimeoutRef.current = null;
		}
	};

	// Update navigation button states
	const canGoBack = currentHistoryIndex > 0;
	const canGoForward = currentHistoryIndex < navigationHistory.length - 1;

	// Send debug mode state to iframe
	const sendDebugModeToIframe = (enabled: boolean) => {
		try {
			iframeRef.current?.contentWindow?.postMessage({
				type: 'roopik-toggle-debug',
				enabled: enabled
			}, '*');
			console.log('[Roopik] Sent debug mode to iframe:', enabled);
		} catch (error) {
			console.error('[Roopik] Failed to send message to iframe:', error);
		}
	};

	// Send inspect mode state to iframe
	const sendInspectModeToIframe = (enabled: boolean) => {
		try {
			const iframe = iframeRef.current;
			if (!iframe || !iframe.contentWindow) {
				console.log('[Roopik] ❌ Cannot send message - iframe not ready');
				return;
			}

			const message = {
				type: 'roopik-toggle-inspect',
				enabled: enabled
			};

			console.log('[Roopik] 📤 Sending inspect mode message:', message);
			iframe.contentWindow.postMessage(message, '*');
			console.log('[Roopik] ✅ Sent inspect mode to iframe:', enabled);
		} catch (error) {
			console.error('[Roopik] ❌ Failed to send message to iframe:', error);
		}
	};

	// Note: Inspect script is injected by Vite plugin, not by webview
	// The roopikInjectPlugin.js already includes inspect mode functionality

	// Handle iframe load
	const handleIframeLoad = () => {
		setIsLoading(false);
		console.log('[Roopik] Preview loaded successfully');

		if (isRefreshing || !iframeRef.current) {
			console.log('[Roopik] Ignoring load event during refresh');
			return;
		}

		// Send handshake
		try {
			iframeRef.current.contentWindow?.postMessage({
				type: 'ROOPIK_HANDSHAKE_SYN',
				secret: 'ROOPIK_IDE_HANDSHAKE_v1'
			}, '*');
			console.log('[Roopik] Sent authentication handshake to iframe');

			iframeRef.current.contentWindow?.postMessage({
				type: 'roopik-init-url',
				url: iframeRef.current.src
			}, '*');
			console.log('[Roopik] Sent initial URL to iframe:', iframeRef.current.src);
		} catch (error) {
			console.error('[Roopik] Failed to send handshake:', error);
		}

		// Update address bar and history
		const currentSrc = iframeRef.current.src;
		setAddressBarValue(currentSrc);

		if (currentHistoryIndex === -1 || navigationHistory[currentHistoryIndex] !== currentSrc) {
			const newHistory = navigationHistory.slice(0, currentHistoryIndex + 1);
			newHistory.push(currentSrc);
			setNavigationHistory(newHistory);
			setCurrentHistoryIndex(newHistory.length - 1);
		}

		// Send debug mode state if enabled
		if (highlightMode) {
			sendDebugModeToIframe(true);
		}
	};

	// Listen for messages from iframe
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;

			switch (message.type) {
				case 'roopik-log':
					vscode.postMessage({
						type: 'iframe-log',
						level: message.level,
						args: message.args
					});
					break;

				case 'roopik-click-to-source':
					vscode.postMessage({
						type: 'click-to-source',
						file: message.file,
						line: message.line,
						column: message.column,
						endLine: message.endLine,
						endColumn: message.endColumn,
						componentName: message.componentName,
						parentContext: message.parentContext
					});
					break;

				case 'roopik-title-change':
					vscode.postMessage({
						type: 'update-title',
						title: message.title
					});
					break;

				case 'roopik-navigate':
					if (isRefreshing) {
						console.log('[Roopik Webview] Ignoring navigation during refresh:', message.url);
						return;
					}

					setAddressBarValue(message.url);
					console.log('[Roopik Webview] Navigation:', message.url);

					if (currentHistoryIndex === -1 || navigationHistory[currentHistoryIndex] !== message.url) {
						const newHistory = navigationHistory.slice(0, currentHistoryIndex + 1);
						newHistory.push(message.url);
						setNavigationHistory(newHistory);
						setCurrentHistoryIndex(newHistory.length - 1);
					}
					break;

				case 'roopik-browser-shortcut-blocked':
					console.log('[Roopik Preview] Blocked browser shortcut:', message.reason, message.detail);
					break;

				case 'roopik-inspect-element':
					console.log('[Roopik] Inspect element:', message.element);
					setInspectedElement(message.element);
					break;
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [highlightMode, isRefreshing, navigationHistory, currentHistoryIndex]);

	// Inspect script is already in the iframe via Vite plugin injection
	// No need to inject from webview side

	// Toggle inspect mode
	useEffect(() => {
		if (!isLoading) {
			console.log('[Roopik] 🔍 Inspect mode:', isInspectMode ? 'ENABLED' : 'DISABLED');
			sendInspectModeToIframe(isInspectMode);
			if (!isInspectMode) {
				setInspectedElement(null);
			}
		}
	}, [isInspectMode, isLoading]);

	// Navigation handlers
	const handleBack = () => {
		if (canGoBack && iframeRef.current) {
			const newIndex = currentHistoryIndex - 1;
			const url = navigationHistory[newIndex];
			iframeRef.current.src = url;
			setAddressBarValue(url);
			setCurrentHistoryIndex(newIndex);
		}
	};

	const handleForward = () => {
		if (canGoForward && iframeRef.current) {
			const newIndex = currentHistoryIndex + 1;
			const url = navigationHistory[newIndex];
			iframeRef.current.src = url;
			setAddressBarValue(url);
			setCurrentHistoryIndex(newIndex);
		}
	};

	const handleHome = () => {
		if (iframeRef.current) {
			const rootUrl = iframeRef.current.src.split('/').slice(0, 3).join('/');
			iframeRef.current.src = rootUrl;
			setAddressBarValue(rootUrl);
		}
	};

	const handleRefresh = () => {
		if (iframeRef.current) {
			setIsRefreshing(true);
			const currentSrc = iframeRef.current.src;
			iframeRef.current.src = 'about:blank';
			setTimeout(() => {
				if (iframeRef.current) {
					iframeRef.current.src = currentSrc;
				}
				setTimeout(() => {
					setIsRefreshing(false);
				}, 100);
			}, 10);
		}
	};

	const handleAddressBarKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			const newUrl = addressBarValue.trim();
			if (newUrl && newUrl.startsWith('http') && iframeRef.current) {
				iframeRef.current.src = newUrl;
			}
		}
	};

	const handleHighlightToggle = () => {
		const newMode = !highlightMode;
		setHighlightMode(newMode);

		if (newMode) {
			showDebugNotification();
		} else {
			hideDebugNotification();
		}

		vscode.postMessage({
			type: 'toggle-highlight-mode',
			enabled: newMode
		});

		sendDebugModeToIframe(newMode);
	};

	const handleStopServer = () => {
		vscode.postMessage({ type: 'stop-server' });
	};

	return (
		<div className="project-view">
			{/* Browser Chrome */}
			<div className="browser-chrome">
				{/* Navigation Controls */}
				<div className="browser-controls">
					<button
						className="control-btn"
						onClick={handleBack}
						disabled={!canGoBack}
						title="Back"
					>
						←
					</button>
					<button
						className="control-btn"
						onClick={handleForward}
						disabled={!canGoForward}
						title="Forward"
					>
						→
					</button>
					<button
						className="control-btn"
						onClick={handleRefresh}
						title="Refresh"
					>
						⟳
					</button>
					<button
						className="control-btn home-icon"
						onClick={handleHome}
						title="Home"
					>
						<svg viewBox="0 0 24 24">
							<path d="M12 5.69l5 4.5V18h-3v-4H10v4H7v-7.81l5-4.5m0-2.69L2 12h3v8h6v-4h2v4h6v-8h3L12 3z"/>
						</svg>
					</button>
				</div>

				{/* Address Bar */}
				<input
					type="text"
					className="address-bar"
					value={addressBarValue}
					onChange={(e) => setAddressBarValue(e.target.value)}
					onKeyDown={handleAddressBarKeyDown}
				/>

				{/* Edit Mode Toggle */}
				<button
					className={`highlight-toggle ${highlightMode ? 'active' : ''}`}
					onClick={handleHighlightToggle}
					title="Toggle edit mode (Ctrl+Click elements to edit)"
				>
					<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
						<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
					</svg>
					<span>EDIT</span>
				</button>

				{/* Stop Server Button */}
				<button
					className="stop-server-btn"
					onClick={handleStopServer}
					title="Stop dev server and close preview"
				>
					<span style={{ fontSize: '14px' }}>⏹</span>
					<span>STOP</span>
				</button>
			</div>

			{/* Preview Container */}
			<div className="preview-container">
				{/* Loading State */}
				{isLoading && (
					<div className="loading">
						<p>Loading preview...</p>
						<p style={{ fontSize: '12px', marginTop: '8px' }}>Starting dev server...</p>
					</div>
				)}

				{/* Debug Notification */}
				<div className={`debug-notification ${showNotification ? 'show' : ''}`}>
					<span>💡 Ctrl+Click on any element to edit</span>
					<button
						className="debug-notification-close"
						onClick={hideDebugNotification}
						title="Close"
					>
						×
					</button>
				</div>

				{/* Preview Iframe */}
				<iframe
					ref={iframeRef}
					id="preview-frame"
					className="preview-frame"
					sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
					src={window.VITE_SERVER_URL}
					onLoad={handleIframeLoad}
					style={{ display: isLoading ? 'none' : 'block' }}
				/>
			</div>

			{/* Bottom Action Bar */}
			{highlightMode && (
				<BottomActionBar
					isSelectMode={isSelectMode}
					isInspectMode={isInspectMode}
					isRectangleMode={isRectangleMode}
					inspectedElement={inspectedElement}
					onSelectMode={() => setIsSelectMode(!isSelectMode)}
					onInspectMode={() => setIsInspectMode(!isInspectMode)}
					onRectangleSelection={() => setIsRectangleMode(!isRectangleMode)}
					onOpenInEditor={(file, line) => {
						// Send message to VS Code extension to open file
						vscode.postMessage({
							type: 'click-to-source',
							file: file,
							line: line,
							column: 1
						});
					}}
				/>
			)}
		</div>
	);
}

export default ProjectView;
