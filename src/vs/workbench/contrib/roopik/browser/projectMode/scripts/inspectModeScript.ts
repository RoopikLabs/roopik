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

	// Wait for body to be ready before initializing
	function initInspectMode() {
		if (!document.body) {
			// YouTube and other sites might not have body ready yet
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', initInspectMode);
			} else {
				// DOM is already loaded, but body is missing (shouldn't happen, but be safe)
				setTimeout(initInspectMode, 50);
			}
			return;
		}

		// Body is ready, proceed with initialization
		initializeInspectModeUI();
	}

	function initializeInspectModeUI() {

	// ========== Configuration ==========

	/**
	 * DRAG ELEMENT FEATURE FLAG
	 *
	 * Set to false to completely disable drag-drop element reordering.
	 * This is a temporary kill switch while the feature is unstable.
	 *
	 * Known issues with drag-drop:
	 * - Elements don't align properly due to component CSS constraints
	 * - Undo doesn't work reliably (element selectors change after move)
	 * - Need AST-based source update before this is truly useful
	 *
	 * Now using data-roopik-source attribute for stable element identification
	 * (inspired by Onlook's data-oid approach) to make undo work reliably.
	 */
	var DRAG_ELEMENT_ENABLED = true;

	/**
	 * DRAG MODE ENABLE FLAG
	 *
	 * Drag mode should ONLY be enabled when:
	 * 1. Page is hosted by Roopik's Vite dev server (not external sites like google.com)
	 * 2. Elements have data-roopik-source attributes (for source mapping)
	 * 3. We have write access to source files
	 *
	 * Detection methods (to be implemented):
	 * - Check for window.__ROOPIK_PROJECT__ flag set by our Vite plugin
	 * - Check if any element has data-roopik-source attribute
	 * - Check URL matches localhost with our dev server port
	 *
	 * For now: We detect by checking if page has data-roopik-source elements
	 * This ensures drag features only work on pages we can actually save to source.
	 *
	 * Future: This will be passed as parameter from VSCode based on project context.
	 */
	function isDragModeAvailable() {
		// Kill switch - if drag element is disabled globally, return false
		if (!DRAG_ELEMENT_ENABLED) {
			return false;
		}

		// Check if page has any elements with source tracking (our project)
		var hasSourceTracking = document.querySelector('[data-roopik-source]') !== null;

		// Future: Also check for project flag
		// var isRoopikProject = !!window.__ROOPIK_PROJECT__;

		return hasSourceTracking;
	}

	// Cache the result (don't re-check on every drag attempt)
	var dragModeEnabled = isDragModeAvailable();

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

	// Drop zone state
	let currentDropZone = null;  // { parent, index, position: 'before'|'after'|'inside' }
	let dropIndicator = null;
	let dropTargetOverlay = null;
	let invalidDropOverlay = null;
	let lastDropValid = false;

	// Pending changes queue (for future AST sync)
	// Changes accumulate here until user clicks "Save"
	// Format: [{ type: 'move', elementSelector, sourceLocation, targetParent, targetIndex, timestamp }]
	let pendingChanges = [];

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
		'transition: top 0.12s ease-out, left 0.12s ease-out, width 0.12s ease-out, height 0.12s ease-out',
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
		// Only show grab cursor if drag mode is enabled (our project with source tracking)
		'cursor: ' + (dragModeEnabled ? 'grab' : 'default'),
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
		// Guard: Only allow drag if drag mode is enabled (our project)
		if (!dragModeEnabled) return;
		if (!selectedElement || e.button !== 0) return;

		e.preventDefault();
		e.stopPropagation();

		isDragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		selectedOverlay.style.cursor = 'grabbing';

		// Create ghost element (semi-transparent clone)
		createDragGhost(e.clientX, e.clientY);

		// Hide action buttons during drag
		actionButtonsContainer.style.display = 'none';

		// Hide hover overlay during drag
		hoverOverlay.style.display = 'none';
		hoverLabel.style.display = 'none';

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

		// Detect drop zone and show indicator
		var dropZone = getDropTarget(e.clientX, e.clientY);
		if (dropZone) {
			currentDropZone = dropZone;
			showDropIndicator(dropZone);
		} else {
			// Show red invalid indicator
			showInvalidDropIndicator(e.clientX, e.clientY);
		}
	}

	function onDragEnd(e) {
		if (!isDragging) return;
		e.preventDefault();

		isDragging = false;
		selectedOverlay.style.cursor = 'grab';

		// Capture drop zone before cleanup
		var dropZone = currentDropZone;

		// Hide drop indicators
		hideDropIndicator();

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

		// Notify VSCode drag ended with drop zone info
		// VSCode will handle CDP DOM.moveTo and show feedback via __roopikShowToast
		if (typeof window.__roopikBridge === 'function') {
			var message = {
				type: 'drag-ended',
				dropX: e.clientX,
				dropY: e.clientY,
				hasDropZone: !!dropZone
			};

			if (dropZone) {
				message.dropZone = {
					parentSelector: getElementSelector(dropZone.parent),
					parentTagName: dropZone.parent.tagName.toLowerCase(),
					index: dropZone.index,
					position: dropZone.position,
					siblingCount: dropZone.siblings.length
				};
			}

			window.__roopikBridge(JSON.stringify(message));
		}

		// Show immediate feedback for invalid drops
		// Valid drops get feedback from VSCode after CDP operation completes
		if (!dropZone) {
			showToast('Invalid drop location');
		}
	}

	// Action buttons container (appears on selected element - top right corner)
	const actionButtonsContainer = document.createElement('div');
	actionButtonsContainer.id = '__roopik_inspect_actions';
	actionButtonsContainer.style.cssText = [
		'position: fixed',
		'z-index: 2147483647',
		'display: none',
		'gap: 8px',
		'pointer-events: auto'
	].join(';');
	document.body.appendChild(actionButtonsContainer);

	// Attach button (left) - paperclip icon
	const attachButton = document.createElement('div');
	attachButton.id = '__roopik_inspect_attach';
	attachButton.style.cssText = [
		'width: 28px',
		'height: 28px',
		'background-color: #059669',
		'border-radius: 6px',
		'cursor: pointer',
		'box-shadow: 0 2px 8px rgba(5, 150, 105, 0.4)',
		'transition: background-color 0.15s, transform 0.1s',
		'display: flex',
		'align-items: center',
		'justify-content: center'
	].join(';');
	attachButton.title = 'Attach element HTML to AI context';

	// Paperclip icon SVG
	var attachSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	attachSvg.setAttribute('width', '16');
	attachSvg.setAttribute('height', '16');
	attachSvg.setAttribute('viewBox', '0 0 24 24');
	attachSvg.setAttribute('fill', 'none');
	attachSvg.setAttribute('stroke', 'white');
	attachSvg.setAttribute('stroke-width', '2');
	attachSvg.setAttribute('stroke-linecap', 'round');
	attachSvg.setAttribute('stroke-linejoin', 'round');
	var attachPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	attachPath.setAttribute('d', 'M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48');
	attachSvg.appendChild(attachPath);
	attachButton.appendChild(attachSvg);

	// Attach button hover
	attachButton.addEventListener('mouseenter', function() {
		attachButton.style.backgroundColor = '#047857';
		attachButton.style.transform = 'scale(1.1)';
	});
	attachButton.addEventListener('mouseleave', function() {
		attachButton.style.backgroundColor = '#059669';
		attachButton.style.transform = 'scale(1)';
	});

	// Chat button (right) - message icon
	const chatButton = document.createElement('div');
	chatButton.id = '__roopik_inspect_chat';
	chatButton.style.cssText = [
		'width: 28px',
		'height: 28px',
		'background-color: #7c3aed',
		'border-radius: 6px',
		'cursor: pointer',
		'box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4)',
		'transition: background-color 0.15s, transform 0.1s',
		'display: flex',
		'align-items: center',
		'justify-content: center'
	].join(';');
	chatButton.title = 'Chat about this element';

	// Message icon SVG
	var chatSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	chatSvg.setAttribute('width', '16');
	chatSvg.setAttribute('height', '16');
	chatSvg.setAttribute('viewBox', '0 0 24 24');
	chatSvg.setAttribute('fill', 'none');
	chatSvg.setAttribute('stroke', 'white');
	chatSvg.setAttribute('stroke-width', '2');
	chatSvg.setAttribute('stroke-linecap', 'round');
	chatSvg.setAttribute('stroke-linejoin', 'round');
	var chatPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	chatPath.setAttribute('d', 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z');
	chatSvg.appendChild(chatPath);
	chatButton.appendChild(chatSvg);

	// Chat button hover
	chatButton.addEventListener('mouseenter', function() {
		chatButton.style.backgroundColor = '#6d28d9';
		chatButton.style.transform = 'scale(1.1)';
	});
	chatButton.addEventListener('mouseleave', function() {
		chatButton.style.backgroundColor = '#7c3aed';
		chatButton.style.transform = 'scale(1)';
	});

	// Add buttons to container (attach on left, chat on right)
	actionButtonsContainer.appendChild(attachButton);
	actionButtonsContainer.appendChild(chatButton);

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
	chatInput.placeholder = 'Describe changes...';
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
	// Create send icon SVG using DOM methods to avoid CSP errors
	var sendSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	sendSvg.setAttribute('width', '16');
	sendSvg.setAttribute('height', '16');
	sendSvg.setAttribute('viewBox', '0 0 24 24');
	sendSvg.setAttribute('fill', 'none');
	sendSvg.setAttribute('stroke', 'currentColor');
	sendSvg.setAttribute('stroke-width', '2');
	var sendPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	sendPath.setAttribute('d', 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z');
	sendSvg.appendChild(sendPath);
	chatSendBtn.appendChild(sendSvg);
	chatSendBtn.style.cssText = [
		'background: #7c3aed',
		'border: none',
		'border-radius: 4px',
		'padding: 8px',
		'cursor: pointer',
		'color: white',
		'display: flex',
		'align-items: center',
		'justify-content: center',
		'transition: opacity 0.2s ease'
	].join(';');

	// Enable/disable send button based on input
	function updateSendButtonState() {
		var hasText = chatInput.value.trim().length > 0;
		chatSendBtn.disabled = !hasText;
		chatSendBtn.style.opacity = hasText ? '1' : '0.5';
		chatSendBtn.style.cursor = hasText ? 'pointer' : 'not-allowed';
	}

	chatInput.addEventListener('input', updateSendButtonState);
	chatInput.addEventListener('keypress', function(e) {
		if (e.key === 'Enter' && chatInput.value.trim()) {
			sendChatMessage(chatInput.value.trim());
		}
	});

	chatSendBtn.addEventListener('click', function(e) {
		e.preventDefault();
		e.stopPropagation();
		if (chatInput.value.trim()) {
			sendChatMessage(chatInput.value.trim());
		}
	});

	function sendChatMessage(text) {
		if (!selectedElement || typeof window.__roopikBridge !== 'function') {
			return;
		}

		// Disable send button while processing
		chatSendBtn.disabled = true;
		chatSendBtn.style.opacity = '0.5';

		var sourceAttr = selectedElement.getAttribute('data-roopik-source');
		var rect = selectedElement.getBoundingClientRect();

		// Get element HTML and strip metadata
		var rawHTML = selectedElement.outerHTML;
		var cleanHTML = stripRoopikMetadata(rawHTML);

		var message = {
			type: 'chat-message',
			text: text,
			html: cleanHTML, // Auto-attach element HTML
			selector: getElementSelector(selectedElement),
			tagName: selectedElement.tagName.toLowerCase(),
			source: sourceAttr ? parseSourceAttr(sourceAttr) : null,
			boundingBox: {
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height,
				top: rect.top,
				right: rect.right,
				bottom: rect.bottom,
				left: rect.left
			}
		};

		window.__roopikBridge(JSON.stringify(message));
		closeChatBar();
		chatInput.value = '';
		updateSendButtonState();
	}

	chatInputContainer.appendChild(chatInput);
	chatInputContainer.appendChild(chatSendBtn);
	chatBar.appendChild(chatInputContainer);
	document.body.appendChild(chatBar);

	// ========== Utility: Strip Roopik Metadata ==========
	/**
	 * Strip all data-roopik-* attributes from HTML
	 *
	 * SHARED UTILITY: This function is synchronized with htmlUtils.ts
	 * Any changes here MUST be reflected in both places!
	 * See: src/vs/workbench/contrib/roopik/browser/projectMode/utils/htmlUtils.ts
	 */
	function stripRoopikMetadata(html) {
		// NOTE: Double-escaped backslashes because this is inside a template literal!
		return html
			.replace(/\\s+data-roopik-[a-z-]+\\s*=\\s*"[^"]*"/gi, '')
			.replace(/\\s+/g, ' ')
			.trim();
	}

	// ========== Attach Button Handler ==========
	attachButton.addEventListener('click', function(e) {
		e.preventDefault();
		e.stopPropagation();

		if (!selectedElement || typeof window.__roopikBridge !== 'function') {
			return;
		}

		// Get outer HTML of selected element
		var rawHTML = selectedElement.outerHTML;

		// Strip Roopik metadata
		var cleanHTML = stripRoopikMetadata(rawHTML);

		// Send to main process for agent attachment
		var message = {
			type: 'attach-element',
			html: cleanHTML,
			selector: getElementSelector(selectedElement),
			tagName: selectedElement.tagName.toLowerCase()
		};

		window.__roopikBridge(JSON.stringify(message));

		// Visual feedback (green flash)
		attachButton.style.backgroundColor = '#10b981';
		setTimeout(function() {
			attachButton.style.backgroundColor = '#059669';
		}, 200);
	});

	// ========== Chat Button Handler ==========
	chatButton.addEventListener('click', function(e) {
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
		actionButtonsContainer.style.display = 'none';

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
		'transition: top 0.12s ease-out, left 0.12s ease-out',
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

	// ========== Drop Zone UI Elements ==========

	// Drop indicator line (shows where element will be inserted)
	dropIndicator = document.createElement('div');
	dropIndicator.id = '__roopik_inspect_drop_indicator';
	dropIndicator.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483647',
		'background-color: #3b82f6',
		'display: none',
		'transition: all 0.1s ease-out'
	].join(';');
	document.body.appendChild(dropIndicator);

	// Drop target overlay (highlights the parent container)
	dropTargetOverlay = document.createElement('div');
	dropTargetOverlay.id = '__roopik_inspect_drop_target';
	dropTargetOverlay.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483644',
		'border: 2px dashed #3b82f6',
		'background-color: rgba(59, 130, 246, 0.05)',
		'border-radius: 4px',
		'display: none',
		'transition: all 0.1s ease-out'
	].join(';');
	document.body.appendChild(dropTargetOverlay);

	// Invalid drop overlay (red dotted - shows when hovering invalid area)
	// z-index must be higher than selectedOverlay (2147483645) to show on top
	invalidDropOverlay = document.createElement('div');
	invalidDropOverlay.id = '__roopik_inspect_invalid_drop';
	invalidDropOverlay.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483646',
		'border: 3px dotted #ef4444',
		'background-color: rgba(239, 68, 68, 0.15)',
		'border-radius: 4px',
		'display: none',
		'transition: all 0.1s ease-out'
	].join(';');
	document.body.appendChild(invalidDropOverlay);

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

	/**
	 * Get unique CSS selector path for an element
	 *
	 * SHARED UTILITY: This function is synchronized with htmlUtils.ts
	 * Any changes here MUST be reflected in both places!
	 * See: src/vs/workbench/contrib/roopik/browser/projectMode/utils/htmlUtils.ts
	 */
	function getElementSelector(el) {
		// NOTE: Double-escaped backslashes because this is inside a template literal!
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
			if (isSelected) actionButtonsContainer.style.display = 'none';
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

		// Position action buttons responsive (bottom-right default, moves to top-right if no space)
		if (isSelected) {
			var buttonSize = 28;
			var buttonGap = 8; // Gap between buttons
			var containerWidth = buttonSize * 2 + buttonGap; // Two buttons + gap
			var containerHeight = buttonSize;
			var edgeGap = 6;
			var containerLeft, containerTop;

			// Horizontal positioning: prefer right side, fall back to left if needed
			if (rect.right - containerWidth >= 4) {
				// Enough space on right side - align to right edge of element
				containerLeft = rect.right - containerWidth;
			} else if (rect.left + containerWidth <= window.innerWidth - 4) {
				// Not enough space on right, but enough on left - align to left edge
				containerLeft = rect.left;
			} else {
				// Not enough space on either side - center on element
				containerLeft = rect.left + (rect.width / 2) - (containerWidth / 2);
			}

			// Vertical positioning: prefer bottom, fall back to top if needed
			if (rect.bottom + containerHeight + edgeGap + 4 < window.innerHeight) {
				// Space below - position below element
				containerTop = rect.bottom + edgeGap;
			} else if (rect.top - containerHeight - edgeGap > 4) {
				// No space below but space above - move to top
				containerTop = rect.top - containerHeight - edgeGap;
			} else {
				// No space on either side - position inside element at top
				containerTop = rect.top + 4;
			}

			// Keep within viewport boundaries (final safety check)
			containerLeft = Math.max(4, Math.min(containerLeft, window.innerWidth - containerWidth - 4));
			containerTop = Math.max(4, Math.min(containerTop, window.innerHeight - containerHeight - 4));

			actionButtonsContainer.style.display = 'flex';
			actionButtonsContainer.style.left = containerLeft + 'px';
			actionButtonsContainer.style.top = containerTop + 'px';
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

	// ========== Drop Zone Detection ==========

	/**
	 * Detect layout direction of a container
	 * Returns 'horizontal' for row layouts, 'vertical' for column layouts
	 */
	function getLayoutDirection(parent) {
		var style = window.getComputedStyle(parent);
		var display = style.display;
		var flexDirection = style.flexDirection;
		var gridAutoFlow = style.gridAutoFlow;

		// Flexbox
		if (display === 'flex' || display === 'inline-flex') {
			if (flexDirection === 'row' || flexDirection === 'row-reverse') {
				return 'horizontal';
			}
			return 'vertical';
		}

		// Grid
		if (display === 'grid' || display === 'inline-grid') {
			if (gridAutoFlow && gridAutoFlow.includes('column')) {
				return 'horizontal';
			}
			// Check if grid has multiple columns
			var cols = style.gridTemplateColumns;
			if (cols && cols !== 'none' && cols.split(' ').length > 1) {
				return 'horizontal';
			}
			return 'vertical';
		}

		// Block elements are vertical by default
		return 'vertical';
	}

	/**
	 * Check if an element is a descendant of another
	 */
	function isDescendant(parent, child) {
		var node = child;
		while (node) {
			if (node === parent) return true;
			node = node.parentElement;
		}
		return false;
	}

	/**
	 * Get valid drop target at coordinates
	 * Returns { parent, siblings, index } or null
	 */
	function getDropTarget(x, y) {
		// Get element at point (temporarily hide our overlays)
		if (dragGhost) dragGhost.style.display = 'none';
		if (dropIndicator) dropIndicator.style.display = 'none';
		if (dropTargetOverlay) dropTargetOverlay.style.display = 'none';
		if (invalidDropOverlay) invalidDropOverlay.style.display = 'none';

		var elementAtPoint = document.elementFromPoint(x, y);

		if (dragGhost) dragGhost.style.display = 'block';

		// Skip our UI elements
		if (!elementAtPoint || isOurElement(elementAtPoint)) {
			return null;
		}

		// Don't allow dropping into the selected element or its descendants
		if (selectedElement && (elementAtPoint === selectedElement || isDescendant(selectedElement, elementAtPoint))) {
			return null;
		}

		// Find the parent container
		var target = elementAtPoint;
		var parent = target.parentElement;

		// Handle edge cases for body/html parents
		if (!parent || parent === document.documentElement) {
			return null;
		}

		// If parent is body, we can still drop - use body as parent
		if (parent === document.body) {
			// Check if target is a container we can drop into
			if (target.children.length > 0 || isContainerElement(target)) {
				return {
					parent: target,
					siblings: Array.from(target.children).filter(validSibling),
					index: 0,
					position: 'inside'
				};
			}
			// Otherwise use body as parent with its direct children
			var bodySiblings = Array.from(document.body.children).filter(validSibling);
			if (bodySiblings.length > 0) {
				var direction = getLayoutDirection(document.body);
				var insertIndex = findInsertIndex(bodySiblings, x, y, direction);
				return {
					parent: document.body,
					siblings: bodySiblings,
					index: insertIndex.index,
					position: insertIndex.position
				};
			}
			return null;
		}

		// Get siblings (excluding selected element and our UI)
		var siblings = Array.from(parent.children).filter(validSibling);

		if (siblings.length === 0) {
			// Empty container - drop inside
			return {
				parent: parent,
				siblings: [],
				index: 0,
				position: 'inside'
			};
		}

		// Find insertion index based on position
		var direction = getLayoutDirection(parent);
		var insertIndex = findInsertIndex(siblings, x, y, direction);

		return {
			parent: parent,
			siblings: siblings,
			index: insertIndex.index,
			position: insertIndex.position
		};
	}

	/**
	 * Check if element is a container (can have children)
	 */
	function isContainerElement(el) {
		var tag = el.tagName.toLowerCase();
		var containers = ['div', 'section', 'article', 'main', 'aside', 'nav', 'header', 'footer', 'ul', 'ol', 'form', 'fieldset'];
		return containers.includes(tag);
	}

	/**
	 * Filter function for valid siblings
	 */
	function validSibling(el) {
		// Exclude selected element
		if (el === selectedElement) return false;
		// Exclude our UI elements
		if (el.id && el.id.startsWith('__roopik_inspect')) return false;
		// Exclude script/style
		var tag = el.tagName.toLowerCase();
		if (tag === 'script' || tag === 'style' || tag === 'link') return false;
		return true;
	}

	/**
	 * Find the insertion index among siblings
	 */
	function findInsertIndex(siblings, x, y, direction) {
		if (siblings.length === 0) {
			return { index: 0, position: 'inside' };
		}

		for (var i = 0; i < siblings.length; i++) {
			var sibling = siblings[i];
			var rect = sibling.getBoundingClientRect();

			if (direction === 'horizontal') {
				// Horizontal layout - check X position
				var midX = rect.left + rect.width / 2;
				if (x < midX) {
					return { index: i, position: 'before' };
				}
			} else {
				// Vertical layout - check Y position
				var midY = rect.top + rect.height / 2;
				if (y < midY) {
					return { index: i, position: 'before' };
				}
			}
		}

		// After all siblings
		return { index: siblings.length, position: 'after' };
	}

	/**
	 * Show drop indicator at the correct position
	 */
	function showDropIndicator(dropZone) {
		if (!dropZone || !dropIndicator || !dropTargetOverlay) return;

		// Hide invalid indicator when showing valid
		if (invalidDropOverlay) invalidDropOverlay.style.display = 'none';
		lastDropValid = true;

		var parent = dropZone.parent;
		var siblings = dropZone.siblings;
		var index = dropZone.index;
		var position = dropZone.position;

		// Show parent highlight
		var parentRect = parent.getBoundingClientRect();
		dropTargetOverlay.style.display = 'block';
		dropTargetOverlay.style.top = parentRect.top + 'px';
		dropTargetOverlay.style.left = parentRect.left + 'px';
		dropTargetOverlay.style.width = parentRect.width + 'px';
		dropTargetOverlay.style.height = parentRect.height + 'px';

		// Determine indicator position
		var direction = getLayoutDirection(parent);
		var indicatorRect = { top: 0, left: 0, width: 0, height: 0 };

		if (position === 'inside' || siblings.length === 0) {
			// Empty container - show indicator in center
			if (direction === 'horizontal') {
				indicatorRect.top = parentRect.top + 10;
				indicatorRect.left = parentRect.left + parentRect.width / 2 - 2;
				indicatorRect.width = 4;
				indicatorRect.height = parentRect.height - 20;
			} else {
				indicatorRect.top = parentRect.top + parentRect.height / 2 - 2;
				indicatorRect.left = parentRect.left + 10;
				indicatorRect.width = parentRect.width - 20;
				indicatorRect.height = 4;
			}
		} else if (position === 'before' && index < siblings.length) {
			// Before a sibling
			var siblingRect = siblings[index].getBoundingClientRect();
			if (direction === 'horizontal') {
				indicatorRect.top = siblingRect.top;
				indicatorRect.left = siblingRect.left - 2;
				indicatorRect.width = 4;
				indicatorRect.height = siblingRect.height;
			} else {
				indicatorRect.top = siblingRect.top - 2;
				indicatorRect.left = siblingRect.left;
				indicatorRect.width = siblingRect.width;
				indicatorRect.height = 4;
			}
		} else {
			// After last sibling
			var lastSibling = siblings[siblings.length - 1];
			var lastRect = lastSibling.getBoundingClientRect();
			if (direction === 'horizontal') {
				indicatorRect.top = lastRect.top;
				indicatorRect.left = lastRect.right - 2;
				indicatorRect.width = 4;
				indicatorRect.height = lastRect.height;
			} else {
				indicatorRect.top = lastRect.bottom - 2;
				indicatorRect.left = lastRect.left;
				indicatorRect.width = lastRect.width;
				indicatorRect.height = 4;
			}
		}

		// Apply indicator styles
		dropIndicator.style.display = 'block';
		dropIndicator.style.top = indicatorRect.top + 'px';
		dropIndicator.style.left = indicatorRect.left + 'px';
		dropIndicator.style.width = indicatorRect.width + 'px';
		dropIndicator.style.height = indicatorRect.height + 'px';

		// Add rounded caps to the indicator
		if (direction === 'horizontal') {
			dropIndicator.style.borderRadius = '2px';
		} else {
			dropIndicator.style.borderRadius = '2px';
		}
	}

	/**
	 * Hide all drop zone indicators
	 */
	function hideDropIndicator() {
		if (dropIndicator) dropIndicator.style.display = 'none';
		if (dropTargetOverlay) dropTargetOverlay.style.display = 'none';
		if (invalidDropOverlay) invalidDropOverlay.style.display = 'none';
		currentDropZone = null;
	}

	/**
	 * Show invalid drop indicator (red dotted overlay on hovered element)
	 */
	function showInvalidDropIndicator(x, y) {
		// Hide valid indicators
		if (dropIndicator) dropIndicator.style.display = 'none';
		if (dropTargetOverlay) dropTargetOverlay.style.display = 'none';

		// Temporarily hide all our overlays to get the real element underneath
		if (dragGhost) dragGhost.style.display = 'none';
		if (invalidDropOverlay) invalidDropOverlay.style.display = 'none';
		if (selectedOverlay) selectedOverlay.style.display = 'none';
		if (hoverOverlay) hoverOverlay.style.display = 'none';

		var elementAtPoint = document.elementFromPoint(x, y);

		// Restore overlays
		if (dragGhost) dragGhost.style.display = 'block';
		if (selectedOverlay && selectedElement) selectedOverlay.style.display = 'block';

		// Show red overlay on the element (which is invalid for drop)
		if (elementAtPoint && invalidDropOverlay) {
			var rect = elementAtPoint.getBoundingClientRect();
			invalidDropOverlay.style.display = 'block';
			invalidDropOverlay.style.top = rect.top + 'px';
			invalidDropOverlay.style.left = rect.left + 'px';
			invalidDropOverlay.style.width = rect.width + 'px';
			invalidDropOverlay.style.height = rect.height + 'px';
		}

		lastDropValid = false;
		currentDropZone = null;
	}

	// ========== Event Handlers ==========

	function onMouseMove(e) {
		// Skip hover highlighting during drag mode
		if (isDragging) {
			return;
		}

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

		// DON'T cleanup - stay in inspect mode for comparing
		return false;
	}

	// NOTE: ESC key handling has been moved to centralized key handler in editor.ts
	// Keys are intercepted by Electron's before-input-event and forwarded via IPC
	// This allows unified key handling without scattered listeners
	function onKeyDown(e) {
		// Close chat bar on ESC (if chat is open)
		// Otherwise, let the event propagate to centralized handler for inspect mode exit
		if (e.key === 'Escape' && isChatOpen) {
			closeChatBar();
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		// For all other cases, let event propagate to centralized handler
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

	// ========== Exported Functions ==========
	// These are called from VSCode via executeScript after CDP operations

	/**
	 * Show toast message - exported for VSCode to call
	 */
	window.__roopikShowToast = function(message) {
		showToast(message);
	};

	/**
	 * Re-select the current element - exported for VSCode to call after DOM move
	 * Updates overlays and selection state after element position changes
	 */
	window.__roopikReselectElement = function() {
		if (!selectedElement) return;

		// The element's position may have changed, update overlays
		updateOverlay(selectedOverlay, selectedLabel, selectedElement, '#22c55e', true);

		// Update the stored result with new bounds
		var rect = selectedElement.getBoundingClientRect();
		if (window.__roopikInspectResult) {
			window.__roopikInspectResult.bounds = {
				x: rect.left,
				y: rect.top,
				width: rect.width,
				height: rect.height
			};
		}
	};

	/**
	 * Build a unique CSS selector for an element - exported for VSCode to call
	 * Used by source-based element lookup for reliable undo operations.
	 *
	 * This is essential for the undo feature: after elements move, their CSS
	 * selectors change (e.g., :nth-of-type() indices), but we can find them
	 * by data-roopik-source attribute and then build a fresh selector.
	 */
	window.__roopikBuildSelector = function(el) {
		return getElementSelector(el);
	};

	// ========== Cleanup ==========

	function cleanup() {
		document.removeEventListener('mousemove', onMouseMove, true);
		document.removeEventListener('click', onClick, true);
		// NOTE: keydown listener removed - handled centrally in editor.ts
		document.removeEventListener('scroll', onScroll, true);
		document.removeEventListener('mousemove', onDragMove, true);
		document.removeEventListener('mouseup', onDragEnd, true);
		window.removeEventListener('resize', onScroll);

		if (toastTimeout) clearTimeout(toastTimeout);

		// Remove all UI elements
		if (hoverOverlay.parentNode) hoverOverlay.remove();
		if (selectedOverlay.parentNode) selectedOverlay.remove();
		if (hoverLabel.parentNode) hoverLabel.remove();
		if (selectedLabel.parentNode) selectedLabel.remove();
		if (actionButtonsContainer.parentNode) actionButtonsContainer.remove();
		if (chatBar.parentNode) chatBar.remove();
		if (toast.parentNode) toast.remove();
		if (dragGhost && dragGhost.parentNode) dragGhost.remove();
		if (dropIndicator && dropIndicator.parentNode) dropIndicator.remove();
		if (dropTargetOverlay && dropTargetOverlay.parentNode) dropTargetOverlay.remove();
		if (invalidDropOverlay && invalidDropOverlay.parentNode) invalidDropOverlay.remove();

		// Reset all state
		hoverElement = null;
		selectedElement = null;
		isHoveringSelected = false;
		isChatOpen = false;
		isDragging = false;
		dragGhost = null;
		currentDropZone = null;
		lastDropValid = false;

		// Remove exported functions
		delete window.__roopikInspectCleanup;
		delete window.__roopikShowToast;
		delete window.__roopikReselectElement;
		delete window.__roopikBuildSelector;
	}

	window.__roopikInspectCleanup = cleanup;

	// ========== Initialize ==========

	document.addEventListener('mousemove', onMouseMove, true);
	document.addEventListener('click', onClick, true);
	// NOTE: keydown listener removed - all key handling is centralized in editor.ts
	// Keys are intercepted by Electron's before-input-event and forwarded via IPC
	document.addEventListener('scroll', onScroll, true);
	window.addEventListener('resize', onScroll);

	return 'Inspect mode enabled';
	} // End of initializeInspectModeUI()

	// Start initialization (waits for body if needed)
	initInspectMode();
})();
`;
