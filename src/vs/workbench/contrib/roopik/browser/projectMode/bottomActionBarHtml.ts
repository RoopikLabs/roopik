/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Bottom Action Bar HTML Content
 *
 * A floating toolbar with LAYERED hover behavior (no expand/collapse).
 * Fixed size overlay that allows browser interaction outside its bounds.
 *
 * Architecture:
 * - Layer 1 (Primary): Fixed main icons - always visible
 * - Layer 2 (Options): Translucent overlay ON TOP of Layer 1 on hover
 *
 * Benefits:
 * - No size changes ever (deterministic)
 * - Layer 2 is always same size as Layer 1
 * - Clean, no clipping issues
 * - Easy to add/remove icons in future
 */

export type ActionBarMode = 'browse' | 'select' | 'inspect' | 'dragSelect';

export interface BottomActionBarState {
	activeMode: ActionBarMode;
	position: 'bottom' | 'top';
}

/**
 * Generate HTML content for the bottom action bar
 */
export function generateBottomActionBarHtml(state: BottomActionBarState): string {
	const { activeMode = 'select' } = state;

	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		html, body {
			background: transparent;
			overflow: hidden;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
			font-size: 12px;
			user-select: none;
			-webkit-user-select: none;
			width: 100%;
			height: 100%;
		}

		/* ============================================
		   Container - holds both layers
		   ============================================ */
		.action-bar-container {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
		}

		/* ============================================
		   Layer 1: Primary Bar (always visible)
		   Glassy translucent effect
		   ============================================ */
		.layer-1 {
			position: absolute;
			top: 0;
			left: 0;
			display: flex;
			align-items: center;
			gap: 2px;
			background: rgba(30, 30, 30, 0.75);
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 8px;
			padding: 6px 8px;
			backdrop-filter: blur(16px);
			-webkit-backdrop-filter: blur(16px);
		}

		/* ============================================
		   Layer 2: Options Overlay (appears on hover)
		   Same size as Layer 1, different color
		   to differentiate from Layer 1 (teal/cyan tint)
		   ============================================ */
		.layer-2 {
			position: absolute;
			top: 0;
			left: 0;
			display: flex;
			align-items: center;
			gap: 2px;
			/* Teal/cyan tint to clearly differentiate from Layer 1 */
			background: rgba(20, 40, 50, 0.92);
			border: 1px solid rgba(56, 189, 248, 0.3);
			border-radius: 8px;
			padding: 6px 8px;
			backdrop-filter: blur(20px);
			-webkit-backdrop-filter: blur(20px);

			/* Hidden by default */
			opacity: 0;
			visibility: hidden;
			transition: opacity 0.15s ease, visibility 0.15s ease;

			/* Ensure it's on top */
			z-index: 10;
		}

		.layer-2.visible {
			opacity: 1;
			visibility: visible;
		}

		/* ============================================
		   Button Base Styles (used in both layers)
		   ============================================ */
		.action-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 32px;
			height: 32px;
			border: none;
			border-radius: 6px;
			background: transparent;
			color: rgba(255, 255, 255, 0.7);
			cursor: pointer;
			transition: all 0.15s ease;
			flex-shrink: 0;
			position: relative;
		}

		.action-btn:hover {
			background: rgba(255, 255, 255, 0.1);
			color: rgba(255, 255, 255, 0.9);
		}

		.action-btn.active {
			background: rgba(59, 130, 246, 0.3);
			color: rgb(96, 165, 250);
		}

		.action-btn.active:hover {
			background: rgba(59, 130, 246, 0.4);
		}

		.action-btn svg {
			width: 18px;
			height: 18px;
		}

		/* Dropdown indicator (small triangle) - only on Layer 1 expandable buttons */
		.has-options .dropdown-indicator {
			position: absolute;
			bottom: 4px;
			right: 4px;
			width: 0;
			height: 0;
			border-left: 3px solid transparent;
			border-right: 3px solid transparent;
			border-top: 4px solid currentColor;
			opacity: 0.5;
		}

		.has-options:hover .dropdown-indicator {
			opacity: 0.8;
		}

		/* ============================================
		   Divider
		   ============================================ */
		.action-divider {
			width: 1px;
			height: 20px;
			background: rgba(255, 255, 255, 0.15);
			margin: 0 4px;
			flex-shrink: 0;
		}

		/* ============================================
		   Drag Handle
		   ============================================ */
		.drag-handle {
			cursor: grab;
		}

		.drag-handle:active {
			cursor: grabbing;
		}

		.drag-handle svg {
			opacity: 0.5;
		}

		.drag-handle:hover svg {
			opacity: 0.8;
		}

		/* ============================================
		   Tooltips (only on Layer 1, not Layer 2)
		   ============================================ */
		.layer-1 .action-btn[data-tooltip]:hover::after {
			content: attr(data-tooltip);
			position: absolute;
			bottom: calc(100% + 8px);
			left: 50%;
			transform: translateX(-50%);
			background: rgba(0, 0, 0, 0.9);
			color: white;
			padding: 4px 8px;
			border-radius: 4px;
			font-size: 11px;
			white-space: nowrap;
			pointer-events: none;
			z-index: 1000;
		}

		/* Hide tooltip on buttons that trigger Layer 2 */
		.layer-1 .has-options[data-tooltip]:hover::after {
			display: none;
		}

		/* ============================================
		   Placeholder slot (empty space in Layer 2)
		   ============================================ */
		.placeholder-slot {
			width: 32px;
			height: 32px;
			flex-shrink: 0;
		}
	</style>
</head>
<body>
	<div class="action-bar-container">

		<!-- ============================================
		     LAYER 1: Primary Bar (always visible)
		     5 main icons: [Mode] | [Click-to-Source] | [AI] | [Drag] | [...]
		     ============================================ -->
		<div class="layer-1" id="layer1">
			<!-- Mode Button (has options - triggers Layer 2) -->
			<button class="action-btn active has-options" id="modeBtn" data-tooltip="Mode" data-layer2="mode">
				<svg id="modeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
					<path d="M13 13l6 6"/>
				</svg>
				<span class="dropdown-indicator"></span>
			</button>

			<div class="action-divider"></div>

			<!-- Click-to-Source Button (jump to code from element) -->
			<button class="action-btn" id="clickToSourceBtn" data-tooltip="Click to Source">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="16 18 22 12 16 6"/>
					<polyline points="8 6 2 12 8 18"/>
					<circle cx="12" cy="12" r="2" fill="currentColor"/>
				</svg>
			</button>

			<div class="action-divider"></div>

			<!-- AI Assistant Button -->
			<button class="action-btn" id="aiBtn" data-tooltip="AI Assistant">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/>
				</svg>
			</button>

			<div class="action-divider"></div>

			<!-- Drag Handle (standard 2x3 grip pattern - wide and recognizable) -->
			<button class="action-btn drag-handle" id="dragHandle" data-tooltip="Drag to Move">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="9" cy="5" r="1.5" fill="currentColor"/>
					<circle cx="15" cy="5" r="1.5" fill="currentColor"/>
					<circle cx="9" cy="12" r="1.5" fill="currentColor"/>
					<circle cx="15" cy="12" r="1.5" fill="currentColor"/>
					<circle cx="9" cy="19" r="1.5" fill="currentColor"/>
					<circle cx="15" cy="19" r="1.5" fill="currentColor"/>
				</svg>
			</button>

			<div class="action-divider"></div>

			<!-- More Options Button (has options - triggers Layer 2) -->
			<button class="action-btn has-options" id="moreBtn" data-tooltip="More" data-layer2="more">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="5" cy="12" r="1.5" fill="currentColor"/>
					<circle cx="12" cy="12" r="1.5" fill="currentColor"/>
					<circle cx="19" cy="12" r="1.5" fill="currentColor"/>
				</svg>
				<span class="dropdown-indicator"></span>
			</button>
		</div>

		<!-- ============================================
		     LAYER 2: Options Overlay (hidden by default)
		     Same size as Layer 1, shows on hover
		     Content changes based on which button triggered it
		     ============================================ -->
		<div class="layer-2" id="layer2">
			<!-- Content injected by JS based on trigger -->
		</div>
	</div>

	<script>
		// ============================================
		// State
		// ============================================
		let activeMode = '${activeMode}';
		let activeLayer2 = null; // 'mode' | 'more' | null
		let isDragging = false;
		let hideTimer = null;

		// Elements
		const layer1 = document.getElementById('layer1');
		const layer2 = document.getElementById('layer2');
		const modeBtn = document.getElementById('modeBtn');
		const moreBtn = document.getElementById('moreBtn');
		const modeIcon = document.getElementById('modeIcon');
		const clickToSourceBtn = document.getElementById('clickToSourceBtn');
		const aiBtn = document.getElementById('aiBtn');
		const dragHandle = document.getElementById('dragHandle');

		// ============================================
		// Message Passing (console.log bridge)
		// ============================================
		function sendMessage(type, data = {}) {
			const msg = JSON.stringify({ type, ...data });
			console.log('ROOPIK_MSG:' + msg);
		}

		// ============================================
		// Mode Icons (SVG paths)
		// ============================================
		const modeIcons = {
			browse: '<path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
			select: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/>',
			inspect: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
			dragSelect: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-dasharray="4 2"/>'
		};

		// ============================================
		// Layer 2 Content Templates
		// ============================================

		// Mode options - shows all 4 modes (current one highlighted)
		// Browse (hand) = normal browsing, no special mode active
		// MUST have same structure as Layer 1 (5 icons + 4 dividers)
		function getModeLayer2Content() {
			return \`
				<button class="action-btn \${activeMode === 'browse' ? 'active' : ''}" data-mode="browse">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/>
						<path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2"/>
						<path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/>
						<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
					</svg>
				</button>
				<div class="action-divider"></div>
				<button class="action-btn \${activeMode === 'select' ? 'active' : ''}" data-mode="select">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
						<path d="M13 13l6 6"/>
					</svg>
				</button>
				<div class="action-divider"></div>
				<button class="action-btn \${activeMode === 'inspect' ? 'active' : ''}" data-mode="inspect">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="11" cy="11" r="8"/>
						<path d="M21 21l-4.35-4.35"/>
					</svg>
				</button>
				<div class="action-divider"></div>
				<button class="action-btn \${activeMode === 'dragSelect' ? 'active' : ''}" data-mode="dragSelect">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-dasharray="4 2"/>
					</svg>
				</button>
				<div class="action-divider"></div>
				<!-- Empty slot to match Layer 1 width (5 icons) -->
				<div class="placeholder-slot"></div>
			\`;
		}

		// More options - toggle icons for theme and view mode
		// MUST have same structure as Layer 1 (5 icons + 4 dividers)
		function getMoreLayer2Content() {
			return \`
				<!-- Dark/Light Mode Toggle (Sun/Moon) -->
				<button class="action-btn" data-action="toggle-theme" data-tooltip="Toggle Theme">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="5"/>
						<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
					</svg>
				</button>
				<div class="action-divider"></div>
				<!-- Preview/Code Toggle -->
				<button class="action-btn" data-action="toggle-view" data-tooltip="Toggle Preview/Code">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="16 18 22 12 16 6"/>
						<polyline points="8 6 2 12 8 18"/>
					</svg>
				</button>
				<div class="action-divider"></div>
				<!-- Screenshot Action -->
				<button class="action-btn" data-action="screenshot" data-tooltip="Screenshot">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
						<circle cx="8.5" cy="8.5" r="1.5"/>
						<polyline points="21 15 16 10 5 21"/>
					</svg>
				</button>
				<div class="action-divider"></div>
				<!-- Copy Action -->
				<button class="action-btn" data-action="copy" data-tooltip="Copy">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
					</svg>
				</button>
				<div class="action-divider"></div>
				<!-- Settings (gear icon) -->
				<button class="action-btn" data-action="settings" data-tooltip="Settings">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="3"/>
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
					</svg>
				</button>
			\`;
		}

		// ============================================
		// Show/Hide Layer 2
		// ============================================
		function showLayer2(type) {
			clearTimeout(hideTimer);

			// Set content based on type
			if (type === 'mode') {
				layer2.innerHTML = getModeLayer2Content();
				attachModeHandlers();
			} else if (type === 'more') {
				layer2.innerHTML = getMoreLayer2Content();
				attachMoreHandlers();
			}

			activeLayer2 = type;
			layer2.classList.add('visible');
		}

		function hideLayer2() {
			// Small delay to allow moving to Layer 2
			hideTimer = setTimeout(() => {
				layer2.classList.remove('visible');
				activeLayer2 = null;
			}, 150);
		}

		function cancelHide() {
			clearTimeout(hideTimer);
		}

		// ============================================
		// Attach click handlers to Layer 2 buttons
		// ============================================
		function attachModeHandlers() {
			layer2.querySelectorAll('[data-mode]').forEach(btn => {
				btn.addEventListener('click', () => {
					const mode = btn.getAttribute('data-mode');
					setMode(mode);
					layer2.classList.remove('visible');
					activeLayer2 = null;
				});
			});
		}

		function attachMoreHandlers() {
			layer2.querySelectorAll('[data-action]').forEach(btn => {
				btn.addEventListener('click', () => {
					const action = btn.getAttribute('data-action');
					sendMessage('placeholder-action', { action });
					layer2.classList.remove('visible');
					activeLayer2 = null;
				});
			});
		}

		// ============================================
		// Mode Management
		// ============================================
		function setMode(mode) {
			activeMode = mode;
			// Update Layer 1 mode icon
			modeIcon.innerHTML = modeIcons[mode];
			sendMessage('mode-change', { mode });
		}

		// Initialize icon
		modeIcon.innerHTML = modeIcons[activeMode];

		// ============================================
		// Event Handlers - Layer 1 buttons
		// ============================================

		// Mode button hover -> show Layer 2 mode options
		modeBtn.addEventListener('mouseenter', () => showLayer2('mode'));
		modeBtn.addEventListener('mouseleave', () => hideLayer2());

		// More button hover -> show Layer 2 more options
		moreBtn.addEventListener('mouseenter', () => showLayer2('more'));
		moreBtn.addEventListener('mouseleave', () => hideLayer2());

		// Layer 2 hover -> keep visible
		layer2.addEventListener('mouseenter', () => cancelHide());
		layer2.addEventListener('mouseleave', () => hideLayer2());

		// Click-to-Source Button click
		clickToSourceBtn.addEventListener('click', () => {
			sendMessage('click-to-source', {});
		});

		// AI Button click
		aiBtn.addEventListener('click', () => {
			sendMessage('ai-assistant', {});
		});

		// Drag Handle
		dragHandle.addEventListener('mousedown', (e) => {
			isDragging = true;
			sendMessage('drag-start', { x: e.screenX, y: e.screenY });
			e.preventDefault();
		});

		document.addEventListener('mousemove', (e) => {
			if (!isDragging) return;
			sendMessage('drag-move', { screenX: e.screenX, screenY: e.screenY });
		});

		document.addEventListener('mouseup', (e) => {
			if (!isDragging) return;
			isDragging = false;
			sendMessage('drag-end', { screenX: e.screenX, screenY: e.screenY });
		});

		// ============================================
		// Keyboard Shortcuts
		// ============================================
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				// Escape goes to browse mode (disables all special modes)
				setMode('browse');
				sendMessage('escape-pressed', {});
			} else if (e.key === 'b' || e.key === 'B') {
				setMode('browse');  // Browse = normal mode, no special modes
			} else if (e.key === 'v' || e.key === 'V') {
				setMode('select');
			} else if (e.key === 'i' || e.key === 'I') {
				setMode('inspect');
			} else if (e.key === 's' || e.key === 'S') {
				setMode('dragSelect');
			}
		});

		// ============================================
		// External API
		// ============================================
		window.roopikActionBar = {
			setMode: (mode) => {
				activeMode = mode;
				modeIcon.innerHTML = modeIcons[mode];
			},
			getMode: () => activeMode,
			getState: () => ({ activeMode, isDragging })
		};

		// Notify parent that toolbar is ready
		sendMessage('action-bar-ready', { activeMode });
	</script>
</body>
</html>`;
}

/**
 * Calculate overlay bounds for the action bar
 * Fixed size: 240×50 (fits 5 buttons + 4 dividers + padding)
 * 5 buttons × 32px = 160px
 * 4 dividers × 9px = 36px
 * padding: 8px × 2 = 16px
 * Total: ~212px, rounded to 240px for breathing room
 */
export function getActionBarOverlayBounds(
	browserBounds: { x: number; y: number; width: number; height: number },
	position: 'bottom' | 'top' = 'bottom'
): { x: number; y: number; width: number; height: number } {
	const width = 240;
	const height = 50;
	const margin = 16;

	// Center horizontally within browser bounds
	const x = browserBounds.x + Math.floor((browserBounds.width - width) / 2);

	// Position vertically based on position
	const y = position === 'bottom'
		? browserBounds.y + browserBounds.height - height - margin
		: browserBounds.y + margin;

	return { x, y, width, height };
}
