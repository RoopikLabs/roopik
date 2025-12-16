/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Inspect Mode Inject Script
 *
 * This script is injected into the browser to enable element inspection.
 * It provides:
 * - Hover highlighting (blue overlay)
 * - Click selection (green overlay)
 * - Grab cursor on selected element (for future drag support)
 * - Chat icon on selected element (for AI editing)
 * - Chat input bar (stub for future AI integration)
 *
 * The script is a self-contained IIFE that runs in the browser context.
 * It communicates with VSCode via window.__roopikBridge.
 */

export const INSPECT_MODE_SCRIPT = `
(function() {
	'use strict';

	// Cleanup any existing inspect mode
	if (window.__roopikInspectCleanup) {
		window.__roopikInspectCleanup();
	}

	// ========== State ==========
	let hoverElement = null;
	let selectedElement = null;
	let toastTimeout = null;
	let isHoveringSelected = false;
	let isChatOpen = false;

	// Drag state
	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragGhost = null;

	// ========== Create UI Elements ==========

	// Hover overlay (blue - follows mouse)
	const hoverOverlay = document.createElement('div');
	hoverOverlay.id = '__roopik_inspect_hover';
	hoverOverlay.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483646',
		'border: 2px solid #007acc',
		'background-color: rgba(0, 122, 204, 0.1)',
		'transition: all 0.05s ease-out',
		'display: none'
	].join(';');
	document.body.appendChild(hoverOverlay);

	// Selected overlay (green - stays on selected element)
	// pointer-events: auto so we can detect hover for grab cursor
	const selectedOverlay = document.createElement('div');
	selectedOverlay.id = '__roopik_inspect_selected';
	selectedOverlay.style.cssText = [
		'position: fixed',
		'pointer-events: auto',
		'z-index: 2147483645',
		'border: 2px solid #22c55e',
		'background-color: rgba(34, 197, 94, 0.15)',
		'cursor: grab',
		'display: none'
	].join(';');
	document.body.appendChild(selectedOverlay);

	// Selected overlay hover handlers - change cursor to indicate draggable
	selectedOverlay.addEventListener('mouseenter', function() {
		isHoveringSelected = true;
		// Hide hover overlay when entering selected element
		hoverOverlay.style.display = 'none';
		hoverLabel.style.display = 'none';
	});
	selectedOverlay.addEventListener('mouseleave', function() {
		isHoveringSelected = false;
	});

	// ========== Drag Handlers on Selected Overlay ==========
	selectedOverlay.addEventListener('mousedown', function(e) {
		if (!selectedElement || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();

		isDragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		selectedOverlay.style.cursor = 'grabbing';

		// Create ghost element (semi-transparent clone)
		createDragGhost(e.clientX, e.clientY);

		// Hide chat icon during drag
		chatIcon.style.display = 'none';

		// Add document-level listeners for drag
		document.addEventListener('mousemove', onDragMove, true);
		document.addEventListener('mouseup', onDragEnd, true);
	});

	function createDragGhost(x, y) {
		if (!selectedElement) return;

		// Create ghost container
		dragGhost = document.createElement('div');
		dragGhost.id = '__roopik_inspect_ghost';
		dragGhost.style.cssText = [
			'position: fixed',
			'pointer-events: none',
			'z-index: 2147483648',
			'opacity: 0.7',
			'transform: scale(0.95)',
			'box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3)',
			'border-radius: 4px',
			'overflow: hidden',
			'transition: opacity 0.1s'
		].join(';');

		// Clone the selected element for visual preview
		var rect = selectedElement.getBoundingClientRect();
		var clone = selectedElement.cloneNode(true);

		// Remove data attributes from clone
		clone.removeAttribute('data-roopik-source');
		clone.removeAttribute('data-roopik-component');

		// Style the clone to match original size
		clone.style.cssText = [
			'width: ' + rect.width + 'px',
			'height: ' + rect.height + 'px',
			'margin: 0',
			'max-width: 300px',
			'max-height: 200px',
			'overflow: hidden'
		].join(';');

		dragGhost.appendChild(clone);

		// Position at cursor
		var ghostWidth = Math.min(rect.width, 300);
		var ghostHeight = Math.min(rect.height, 200);
		dragGhost.style.left = (x - ghostWidth / 2) + 'px';
		dragGhost.style.top = (y - ghostHeight / 2) + 'px';
		dragGhost.style.width = ghostWidth + 'px';
		dragGhost.style.height = ghostHeight + 'px';

		document.body.appendChild(dragGhost);

		// Notify VSCode drag started
		if (typeof window.__roopikBridge === 'function') {
			window.__roopikBridge(JSON.stringify({
				type: 'drag-started',
				selector: getElementSelector(selectedElement),
				tagName: selectedElement.tagName.toLowerCase()
			}));
		}
	}

	function onDragMove(e) {
		if (!isDragging || !dragGhost) return;
		e.preventDefault();

		// Update ghost position (centered on cursor)
		var ghostRect = dragGhost.getBoundingClientRect();
		dragGhost.style.left = (e.clientX - ghostRect.width / 2) + 'px';
		dragGhost.style.top = (e.clientY - ghostRect.height / 2) + 'px';

		// TODO Phase 3: Detect drop zones and highlight siblings
	}

	function onDragEnd(e) {
		if (!isDragging) return;
		e.preventDefault();

		isDragging = false;
		selectedOverlay.style.cursor = 'grab';

		// Remove ghost
		if (dragGhost && dragGhost.parentNode) {
			dragGhost.remove();
		}
		dragGhost = null;

		// Remove document listeners
		document.removeEventListener('mousemove', onDragMove, true);
		document.removeEventListener('mouseup', onDragEnd, true);

		// Restore chat icon if element still selected
		if (selectedElement) {
			updateOverlay(selectedOverlay, selectedLabel, selectedElement, '#22c55e', true);
		}

		// Notify VSCode drag ended
		if (typeof window.__roopikBridge === 'function') {
			window.__roopikBridge(JSON.stringify({
				type: 'drag-ended',
				dropX: e.clientX,
				dropY: e.clientY
			}));
		}

		showToast('🚧 Drop zones coming soon!');
	}

	// Chat icon (appears on selected element - top right corner)
	const chatIcon = document.createElement('div');
	chatIcon.id = '__roopik_inspect_chat';
	chatIcon.style.cssText = [
		'position: fixed',
		'z-index: 2147483647',
		'width: 28px',
		'height: 28px',
		'background-color: #7c3aed',
		'border-radius: 6px',
		'display: none',
		'cursor: pointer',
		'pointer-events: auto',
		'box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4)',
		'transition: background-color 0.15s, transform 0.1s'
	].join(';');
	// Chat bubble icon (SVG) - centered with flexbox applied via JS
	chatIcon.innerHTML = '<svg style="display:block;margin:auto;margin-top:6px;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
	chatIcon.title = 'Ask AI to edit this element';
	document.body.appendChild(chatIcon);

	// Chat icon hover effects
	chatIcon.addEventListener('mouseenter', function() {
		chatIcon.style.backgroundColor = '#6d28d9';
		chatIcon.style.transform = 'scale(1.1)';
	});
	chatIcon.addEventListener('mouseleave', function() {
		chatIcon.style.backgroundColor = '#7c3aed';
		chatIcon.style.transform = 'scale(1)';
	});

	// ========== Chat Input Bar ==========
	const chatBar = document.createElement('div');
	chatBar.id = '__roopik_inspect_chat_bar';
	chatBar.style.cssText = [
		'position: fixed',
		'z-index: 2147483647',
		'display: none',
		'background: #1e1e1e',
		'border: 1px solid #3c3c3c',
		'border-radius: 8px',
		'padding: 10px',
		'box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4)',
		'width: 500px'
	].join(';');

	// Chat input container (input + send button)
	const chatInputContainer = document.createElement('div');
	chatInputContainer.style.cssText = 'display: flex; gap: 8px; align-items: center;';

	const chatInput = document.createElement('input');
	chatInput.type = 'text';
	chatInput.placeholder = 'Describe changes... (Coming soon)';
	chatInput.style.cssText = [
		'flex: 1',
		'background: #2d2d2d',
		'border: 1px solid #3c3c3c',
		'border-radius: 4px',
		'padding: 10px 12px',
		'color: #cccccc',
		'font-size: 13px',
		'font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
		'outline: none'
	].join(';');

	const chatSendBtn = document.createElement('button');
	chatSendBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
	chatSendBtn.disabled = true;
	chatSendBtn.style.cssText = [
		'background: #7c3aed',
		'border: none',
		'border-radius: 4px',
		'padding: 8px',
		'cursor: not-allowed',
		'opacity: 0.5',
		'color: white',
		'display: flex',
		'align-items: center',
		'justify-content: center'
	].join(';');

	chatInputContainer.appendChild(chatInput);
	chatInputContainer.appendChild(chatSendBtn);
	chatBar.appendChild(chatInputContainer);
	document.body.appendChild(chatBar);

	// Chat icon click handler - toggles chat bar
	chatIcon.addEventListener('click', function(e) {
		e.preventDefault();
		e.stopPropagation();
		toggleChatBar();
	});

	function toggleChatBar() {
		if (isChatOpen) {
			closeChatBar();
		} else {
			openChatBar();
		}
	}

	function openChatBar() {
		if (!selectedElement) return;
		isChatOpen = true;

		var rect = selectedElement.getBoundingClientRect();
		var barHeight = 60; // Clean input bar height
		var barWidth = 500;

		// Determine position: prefer below element, fallback to above
		var top, left;

		// Check if there's space below
		if (rect.bottom + barHeight + 10 < window.innerHeight) {
			top = rect.bottom + 8;
		} else if (rect.top - barHeight - 10 > 0) {
			// Space above
			top = rect.top - barHeight - 8;
		} else {
			// Put it at the bottom of viewport
			top = window.innerHeight - barHeight - 20;
		}

		// Horizontal: center under element, but keep in viewport
		left = rect.left + (rect.width / 2) - (barWidth / 2);
		left = Math.max(10, Math.min(left, window.innerWidth - barWidth - 10));

		chatBar.style.top = top + 'px';
		chatBar.style.left = left + 'px';
		chatBar.style.display = 'block';

		// Hide chat icon while chat bar is open
		chatIcon.style.display = 'none';

		// Focus the input
		setTimeout(function() {
			chatInput.focus();
		}, 50);

		// Also notify VSCode (for future use)
		if (typeof window.__roopikBridge === 'function') {
			var sourceAttr = selectedElement.getAttribute('data-roopik-source');
			var message = {
				type: 'chat-opened',
				selector: getElementSelector(selectedElement),
				tagName: selectedElement.tagName.toLowerCase(),
				source: sourceAttr ? parseSourceAttr(sourceAttr) : null
			};
			window.__roopikBridge(JSON.stringify(message));
		}
	}

	function closeChatBar() {
		isChatOpen = false;
		chatBar.style.display = 'none';

		// Show chat icon again when chat closes
		if (selectedElement) {
			updateOverlay(selectedOverlay, selectedLabel, selectedElement, '#22c55e', true);
		}
	}

	// Close chat bar when clicking outside
	document.addEventListener('click', function(e) {
		if (isChatOpen && !chatBar.contains(e.target) && e.target !== chatIcon) {
			closeChatBar();
		}
	}, true);

	// ========== Other UI Elements ==========

	// Hover label (tag info - blue)
	const hoverLabel = document.createElement('div');
	hoverLabel.id = '__roopik_inspect_label';
	hoverLabel.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483647',
		'background-color: #007acc',
		'color: white',
		'font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
		'font-size: 11px',
		'padding: 2px 6px',
		'border-radius: 2px',
		'white-space: nowrap',
		'display: none'
	].join(';');
	document.body.appendChild(hoverLabel);

	// Selected label (tag info - green, stays on selected element)
	const selectedLabel = document.createElement('div');
	selectedLabel.id = '__roopik_inspect_selected_label';
	selectedLabel.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483647',
		'background-color: #22c55e',
		'color: white',
		'font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
		'font-size: 11px',
		'padding: 2px 6px',
		'border-radius: 2px',
		'white-space: nowrap',
		'display: none'
	].join(';');
	document.body.appendChild(selectedLabel);

	// Toast notification
	const toast = document.createElement('div');
	toast.id = '__roopik_inspect_toast';
	toast.style.cssText = [
		'position: fixed',
		'top: 20px',
		'left: 50%',
		'transform: translateX(-50%) translateY(-100px)',
		'background-color: #1e1e1e',
		'color: #ffffff',
		'font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
		'font-size: 13px',
		'padding: 10px 20px',
		'border-radius: 6px',
		'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)',
		'z-index: 2147483647',
		'opacity: 0',
		'transition: transform 0.3s ease, opacity 0.3s ease',
		'pointer-events: none'
	].join(';');
	document.body.appendChild(toast);

	// ========== Helper Functions ==========

	function showToast(message) {
		if (toastTimeout) clearTimeout(toastTimeout);
		toast.textContent = message;
		toast.style.opacity = '1';
		toast.style.transform = 'translateX(-50%) translateY(0)';
		toastTimeout = setTimeout(function() {
			toast.style.opacity = '0';
			toast.style.transform = 'translateX(-50%) translateY(-100px)';
		}, 2000);
	}

	function parseSourceAttr(attr) {
		if (!attr) return null;
		var parts = attr.split(':');
		var pathEndIndex = 0;
		for (var i = parts.length - 1; i >= 0; i--) {
			if (isNaN(parseInt(parts[i], 10))) {
				pathEndIndex = i;
				break;
			}
		}
		var filePath = parts.slice(0, pathEndIndex + 1).join(':');
		var numbers = parts.slice(pathEndIndex + 1).map(function(n) { return parseInt(n, 10); });
		var result = { file: filePath, line: numbers[0] || 1 };
		if (numbers.length >= 2) result.column = numbers[1];
		if (numbers.length >= 4) {
			result.endLine = numbers[2];
			result.endColumn = numbers[3];
		}
		return result;
	}

	function getElementSelector(el) {
		if (!el || el === document.body || el === document.documentElement) return null;
		var parts = [];
		var current = el;
		while (current && current !== document.body && current !== document.documentElement) {
			var selector = current.tagName.toLowerCase();
			if (current.id) {
				parts.unshift('#' + CSS.escape(current.id));
				break;
			}
			if (current.className && typeof current.className === 'string') {
				var classes = current.className.trim().split(/\\s+/).filter(function(c) { return c; });
				if (classes.length > 0) {
					selector += '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
				}
			}
			var parent = current.parentElement;
			if (parent) {
				var siblings = Array.from(parent.children).filter(function(s) { return s.tagName === current.tagName; });
				if (siblings.length > 1) {
					var index = siblings.indexOf(current) + 1;
					selector += ':nth-of-type(' + index + ')';
				}
			}
			parts.unshift(selector);
			current = parent;
		}
		return parts.join(' > ');
	}

	function buildInspectResult(el, x, y) {
		var sourceAttr = el.getAttribute('data-roopik-source');
		var componentAttr = el.getAttribute('data-roopik-component');
		var parentAttr = el.getAttribute('data-roopik-parent');
		return {
			selector: getElementSelector(el),
			x: x,
			y: y,
			tagName: el.tagName.toLowerCase(),
			id: el.id || null,
			className: (typeof el.className === 'string') ? el.className : null,
			html: el.outerHTML,
			source: sourceAttr ? parseSourceAttr(sourceAttr) : null,
			component: componentAttr || null,
			parent: parentAttr || null,
			timestamp: Date.now()
		};
	}

	function updateOverlay(overlay, label, el, color, isSelected) {
		if (!el || el === document.body || el === document.documentElement) {
			overlay.style.display = 'none';
			if (label) label.style.display = 'none';
			if (isSelected) chatIcon.style.display = 'none';
			return;
		}
		var rect = el.getBoundingClientRect();
		overlay.style.display = 'block';
		overlay.style.top = rect.top + 'px';
		overlay.style.left = rect.left + 'px';
		overlay.style.width = rect.width + 'px';
		overlay.style.height = rect.height + 'px';

		if (label) {
			label.style.display = 'block';
			label.textContent = el.tagName.toLowerCase();
			label.style.backgroundColor = color || '#007acc';
			var labelHeight = 20;
			if (rect.top > labelHeight + 4) {
				label.style.top = (rect.top - labelHeight - 4) + 'px';
			} else {
				label.style.top = (rect.bottom + 4) + 'px';
			}
			label.style.left = Math.max(0, rect.left) + 'px';
		}

		// Position chat icon responsive like HTML tag (bottom-right default, moves to top-right if no space)
		if (isSelected) {
			var iconSize = 28;
			var iconGap = 6;
			var iconLeft = rect.right - iconSize;
			var iconTop;

			// Default: try bottom-right (like HTML tag default position)
			if (rect.bottom + iconSize + iconGap + 4 < window.innerHeight) {
				// Space below - position below element at bottom-right
				iconTop = rect.bottom + iconGap;
			} else {
				// No space below - move to top-right (like HTML tag does)
				iconTop = rect.top - iconSize - iconGap;
			}

			// Keep within viewport boundaries
			iconLeft = Math.max(4, Math.min(iconLeft, window.innerWidth - iconSize - 4));
			iconTop = Math.max(4, Math.min(iconTop, window.innerHeight - iconSize - 4));

			chatIcon.style.display = 'block';
			chatIcon.style.left = iconLeft + 'px';
			chatIcon.style.top = iconTop + 'px';
		}
	}

	function isOurElement(el) {
		// Check if element or any parent is one of our UI elements
		var current = el;
		while (current && current !== document.body) {
			if (current.id && current.id.startsWith('__roopik_inspect')) {
				return true;
			}
			// Also check for ghost element
			if (current === dragGhost) {
				return true;
			}
			current = current.parentElement;
		}
		return false;
	}

	// ========== Event Handlers ==========

	function onMouseMove(e) {
		var el = document.elementFromPoint(e.clientX, e.clientY);
		if (isOurElement(el)) return;

		// If hovering the selected overlay, don't update hover state
		if (isHoveringSelected) {
			return;
		}

		if (el && el !== hoverElement) {
			hoverElement = el;
			// Don't show hover overlay on selected element (already has green)
			if (el === selectedElement) {
				hoverOverlay.style.display = 'none';
				hoverLabel.style.display = 'none';
			} else {
				updateOverlay(hoverOverlay, hoverLabel, el, '#007acc', false);
			}
		}
	}

	function onClick(e) {
		// Don't process clicks on our UI elements
		if (isOurElement(e.target) || chatBar.contains(e.target)) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();

		var el = hoverElement || document.elementFromPoint(e.clientX, e.clientY);
		if (!el || isOurElement(el)) return false;

		// Close chat bar if open
		if (isChatOpen) {
			closeChatBar();
		}

		// Select this element
		selectedElement = el;

		// Build result
		var rect = el.getBoundingClientRect();
		var sourceAttr = el.getAttribute('data-roopik-source');
		var message = {
			type: 'element-selected',
			selector: getElementSelector(el),
			html: el.outerHTML,
			tagName: el.tagName.toLowerCase(),
			source: sourceAttr ? parseSourceAttr(sourceAttr) : null,
			bounds: {
				x: rect.left,
				y: rect.top,
				width: rect.width,
				height: rect.height
			}
		};

		// Store result for backward compatibility (getInspectResult)
		window.__roopikInspectResult = message;

		// Send to VSCode via CDP bridge (if available)
		if (typeof window.__roopikBridge === 'function') {
			window.__roopikBridge(JSON.stringify(message));
		}

		// Update selected overlay (green) with its own label and chat icon
		updateOverlay(selectedOverlay, selectedLabel, el, '#22c55e', true);
		selectedOverlay.style.display = 'block';

		// Hide hover overlay since we're now on selected
		hoverOverlay.style.display = 'none';
		hoverLabel.style.display = 'none';

		// Show selection feedback
		showToast('✓ Element selected');

		// DON'T cleanup - stay in inspect mode for comparing
		return false;
	}

	// NOTE: ESC key handling has been moved to centralized key handler in editor.ts
	// Keys are intercepted by Electron's before-input-event and forwarded via IPC
	// This allows unified key handling without scattered listeners
	function onKeyDown(e) {
		// Close chat bar on ESC
		if (e.key === 'Escape' && isChatOpen) {
			closeChatBar();
			e.preventDefault();
			e.stopPropagation();
		}
	}

	function onScroll() {
		if (hoverElement && hoverElement !== selectedElement) {
			updateOverlay(hoverOverlay, hoverLabel, hoverElement, '#007acc', false);
		}
		if (selectedElement) {
			updateOverlay(selectedOverlay, selectedLabel, selectedElement, '#22c55e', true);
		}
		// Update chat bar position if open
		if (isChatOpen && selectedElement) {
			openChatBar(); // Re-position
		}
	}

	// ========== Cleanup ==========

	function cleanup() {
		document.removeEventListener('mousemove', onMouseMove, true);
		document.removeEventListener('click', onClick, true);
		document.removeEventListener('keydown', onKeyDown, true);
		document.removeEventListener('scroll', onScroll, true);
		document.removeEventListener('mousemove', onDragMove, true);
		document.removeEventListener('mouseup', onDragEnd, true);
		window.removeEventListener('resize', onScroll);

		if (toastTimeout) clearTimeout(toastTimeout);

		if (hoverOverlay.parentNode) hoverOverlay.remove();
		if (selectedOverlay.parentNode) selectedOverlay.remove();
		if (hoverLabel.parentNode) hoverLabel.remove();
		if (selectedLabel.parentNode) selectedLabel.remove();
		if (chatIcon.parentNode) chatIcon.remove();
		if (chatBar.parentNode) chatBar.remove();
		if (toast.parentNode) toast.remove();
		if (dragGhost && dragGhost.parentNode) dragGhost.remove();

		hoverElement = null;
		selectedElement = null;
		isHoveringSelected = false;
		isChatOpen = false;
		isDragging = false;
		dragGhost = null;
		delete window.__roopikInspectCleanup;
	}

	window.__roopikInspectCleanup = cleanup;

	// ========== Initialize ==========

	document.addEventListener('mousemove', onMouseMove, true);
	document.addEventListener('click', onClick, true);
	document.addEventListener('keydown', onKeyDown, true);
	document.addEventListener('scroll', onScroll, true);
	window.addEventListener('resize', onScroll);

	return 'Inspect mode enabled';
})();
`;
