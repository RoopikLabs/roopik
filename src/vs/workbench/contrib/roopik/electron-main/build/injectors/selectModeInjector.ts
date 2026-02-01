/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Select Mode Injector - Element Inspector for SFC Components
 *
 * A practical mini-DevTools for designers/developers working with sandboxed components.
 * Since real DevTools can't access iframe sandboxes, this provides:
 *
 * Features:
 * - Component name display
 * - Element path breadcrumb (div > .container > button)
 * - Box model visualization (margin/padding/border)
 * - Key computed styles (colors, fonts, spacing)
 * - Copy Styles button
 * - Element dimensions
 */

import { BaseInjector, InjectorContext } from './types.js';

export class SelectModeInjector extends BaseInjector {
	override readonly name = 'select-mode';
	override readonly priority = 45; // Run before inspect mode (50)

	override inject(code: string, context: InjectorContext): string {
		// Extract component name from componentId (use last part of path)
		const pathParts = context.componentId.replace(/\\/g, '/').split('/');
		const componentName = pathParts[pathParts.length - 1] || context.componentId;

		const selectScript = `
// ===== Roopik Element Inspector =====
(function() {
	const componentId = ${JSON.stringify(context.componentId)};
	const componentName = ${JSON.stringify(componentName)};
	let selectEnabled = false;
	let selectedElement = null;
	let highlightOverlay = null;
	let marginOverlay = null;
	let paddingOverlay = null;
	let propertiesPanel = null;
	let hoverOverlay = null;

	// Create highlight overlay with box model visualization
	function createOverlays() {
		if (highlightOverlay) return;

		// Margin overlay (outermost, orange)
		marginOverlay = document.createElement('div');
		marginOverlay.id = 'roopik-margin-overlay';
		marginOverlay.style.cssText = \`
			position: fixed;
			pointer-events: none;
			background: rgba(255, 165, 0, 0.15);
			z-index: 999996;
			display: none;
		\`;
		document.body.appendChild(marginOverlay);

		// Content + padding overlay (green)
		paddingOverlay = document.createElement('div');
		paddingOverlay.id = 'roopik-padding-overlay';
		paddingOverlay.style.cssText = \`
			position: fixed;
			pointer-events: none;
			background: rgba(16, 185, 129, 0.15);
			z-index: 999997;
			display: none;
		\`;
		document.body.appendChild(paddingOverlay);

		// Content overlay (blue)
		highlightOverlay = document.createElement('div');
		highlightOverlay.id = 'roopik-select-overlay';
		highlightOverlay.style.cssText = \`
			position: fixed;
			pointer-events: none;
			background: rgba(59, 130, 246, 0.2);
			border: 2px solid #3b82f6;
			z-index: 999998;
			display: none;
			border-radius: 2px;
		\`;
		document.body.appendChild(highlightOverlay);

		// Hover preview overlay (light)
		hoverOverlay = document.createElement('div');
		hoverOverlay.id = 'roopik-hover-overlay';
		hoverOverlay.style.cssText = \`
			position: fixed;
			pointer-events: none;
			border: 1px dashed #10b981;
			background: rgba(16, 185, 129, 0.05);
			z-index: 999995;
			display: none;
			border-radius: 2px;
		\`;
		document.body.appendChild(hoverOverlay);
	}

	// Create properties panel
	function createPropertiesPanel() {
		if (propertiesPanel) return propertiesPanel;

		propertiesPanel = document.createElement('div');
		propertiesPanel.id = 'roopik-properties-panel';
		propertiesPanel.style.cssText = \`
			position: fixed;
			bottom: 16px;
			right: 16px;
			background: #1e1e1e;
			border: 1px solid #3c3c3c;
			border-radius: 8px;
			padding: 0;
			width: 320px;
			max-height: 70vh;
			overflow-y: auto;
			z-index: 999999;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			font-size: 12px;
			color: #cccccc;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
			display: none;
			cursor: default;
		\`;
		document.body.appendChild(propertiesPanel);

		// Make panel draggable
		let isDragging = false;
		let dragOffsetX = 0;
		let dragOffsetY = 0;

		propertiesPanel.addEventListener('mousedown', (e) => {
			// Only drag from header area (top 48px)
			const rect = propertiesPanel.getBoundingClientRect();
			if (e.clientY - rect.top > 48) return;

			isDragging = true;
			dragOffsetX = e.clientX - rect.left;
			dragOffsetY = e.clientY - rect.top;
			propertiesPanel.style.cursor = 'grabbing';
			e.preventDefault();
		});

		document.addEventListener('mousemove', (e) => {
			if (!isDragging) return;

			const x = e.clientX - dragOffsetX;
			const y = e.clientY - dragOffsetY;

			// Constrain to viewport
			const maxX = window.innerWidth - propertiesPanel.offsetWidth;
			const maxY = window.innerHeight - propertiesPanel.offsetHeight;

			propertiesPanel.style.left = Math.max(0, Math.min(maxX, x)) + 'px';
			propertiesPanel.style.top = Math.max(0, Math.min(maxY, y)) + 'px';
			propertiesPanel.style.right = 'auto';
			propertiesPanel.style.bottom = 'auto';
		});

		document.addEventListener('mouseup', () => {
			if (isDragging) {
				isDragging = false;
				propertiesPanel.style.cursor = 'default';
			}
		});

		return propertiesPanel;
	}

	// Update overlays to show box model
	function updateOverlays(element) {
		if (!element) return;

		const rect = element.getBoundingClientRect();
		const style = window.getComputedStyle(element);

		const marginTop = parseFloat(style.marginTop) || 0;
		const marginRight = parseFloat(style.marginRight) || 0;
		const marginBottom = parseFloat(style.marginBottom) || 0;
		const marginLeft = parseFloat(style.marginLeft) || 0;

		const paddingTop = parseFloat(style.paddingTop) || 0;
		const paddingRight = parseFloat(style.paddingRight) || 0;
		const paddingBottom = parseFloat(style.paddingBottom) || 0;
		const paddingLeft = parseFloat(style.paddingLeft) || 0;

		const borderTop = parseFloat(style.borderTopWidth) || 0;
		const borderRight = parseFloat(style.borderRightWidth) || 0;
		const borderBottom = parseFloat(style.borderBottomWidth) || 0;
		const borderLeft = parseFloat(style.borderLeftWidth) || 0;

		// Margin overlay (includes margin)
		marginOverlay.style.left = (rect.left - marginLeft) + 'px';
		marginOverlay.style.top = (rect.top - marginTop) + 'px';
		marginOverlay.style.width = (rect.width + marginLeft + marginRight) + 'px';
		marginOverlay.style.height = (rect.height + marginTop + marginBottom) + 'px';
		marginOverlay.style.display = 'block';

		// Padding overlay (border-box)
		paddingOverlay.style.left = rect.left + 'px';
		paddingOverlay.style.top = rect.top + 'px';
		paddingOverlay.style.width = rect.width + 'px';
		paddingOverlay.style.height = rect.height + 'px';
		paddingOverlay.style.display = 'block';

		// Content overlay (content area only)
		highlightOverlay.style.left = (rect.left + borderLeft + paddingLeft) + 'px';
		highlightOverlay.style.top = (rect.top + borderTop + paddingTop) + 'px';
		highlightOverlay.style.width = (rect.width - borderLeft - borderRight - paddingLeft - paddingRight) + 'px';
		highlightOverlay.style.height = (rect.height - borderTop - borderBottom - paddingTop - paddingBottom) + 'px';
		highlightOverlay.style.display = 'block';
	}

	// Update hover overlay
	function updateHoverOverlay(element) {
		if (!element || !hoverOverlay) return;
		const rect = element.getBoundingClientRect();
		hoverOverlay.style.left = rect.left + 'px';
		hoverOverlay.style.top = rect.top + 'px';
		hoverOverlay.style.width = rect.width + 'px';
		hoverOverlay.style.height = rect.height + 'px';
		hoverOverlay.style.display = 'block';
	}

	function hideHoverOverlay() {
		if (hoverOverlay) hoverOverlay.style.display = 'none';
	}

	// Get element path (breadcrumb)
	function getElementPath(element) {
		const path = [];
		let current = element;
		let depth = 0;
		const maxDepth = 5;

		while (current && current !== document.body && depth < maxDepth) {
			let selector = current.tagName.toLowerCase();

			// Add id if present
			if (current.id) {
				selector += '#' + current.id;
			}
			// Add first meaningful class (skip framework hashes)
			else {
				const meaningfulClass = Array.from(current.classList)
					.find(c => !c.includes('-') || c.length > 15 ? false : !(/^[a-z]+-[a-z0-9]{5,}$/i.test(c)));
				if (meaningfulClass) {
					selector += '.' + meaningfulClass;
				}
			}

			path.unshift(selector);
			current = current.parentElement;
			depth++;
		}

		return path;
	}

	// Parse source location from data-roopik-source attribute
	function parseSourceLocation(element) {
		// First try the element itself
		let sourceAttr = element.getAttribute('data-roopik-source');
		if (sourceAttr) {
			return parseSourceString(sourceAttr);
		}

		// Walk up to find parent with source tracking
		let parent = element.parentElement;
		while (parent && parent !== document.body) {
			sourceAttr = parent.getAttribute('data-roopik-source');
			if (sourceAttr) {
				return parseSourceString(sourceAttr);
			}
			parent = parent.parentElement;
		}

		return null;
	}

	// Parse "file:startLine:startCol:endLine:endCol" format
	// Examples:
	//   - "index.tsx:63:16:63:107" (relative path)
	//   - "C:/path/to/file.tsx:10:5:15:20" (Windows absolute)
	function parseSourceString(sourceStr) {
		if (!sourceStr) return null;

		const parts = sourceStr.split(':');
		if (parts.length < 5) return null;

		// Extract last 4 numeric parts (startLine:startCol:endLine:endCol)
		// Everything before that is the file path
		const numericParts = [];
		let filePathEndIndex = -1;

		for (let i = parts.length - 1; i >= 0 && numericParts.length < 4; i--) {
			if (/^\\d+$/.test(parts[i])) {
				numericParts.unshift(parts[i]);
			} else {
				// Found non-numeric, this is where file path ends
				filePathEndIndex = i;
				break;
			}
		}

		// If we collected 4 numbers but didn't hit a non-numeric part,
		// the file path is everything before the 4 numbers
		if (numericParts.length === 4 && filePathEndIndex === -1) {
			filePathEndIndex = parts.length - 5;
		}

		// Build file path from parts[0] to parts[filePathEndIndex]
		const filePath = filePathEndIndex >= 0 ? parts.slice(0, filePathEndIndex + 1).join(':') : '';

		if (numericParts.length !== 4 || !filePath) {
			return null;
		}

		return {
			file: filePath,
			startLine: parseInt(numericParts[0], 10),
			startCol: parseInt(numericParts[1], 10),
			endLine: parseInt(numericParts[2], 10),
			endCol: parseInt(numericParts[3], 10)
		};
	}

	// Get computed styles for display
	function getComputedStyles(element) {
		const style = window.getComputedStyle(element);

		return {
			// Layout
			display: style.display,
			position: style.position,
			flexDirection: style.flexDirection !== 'row' ? style.flexDirection : null,
			justifyContent: style.justifyContent !== 'normal' ? style.justifyContent : null,
			alignItems: style.alignItems !== 'normal' ? style.alignItems : null,
			gap: style.gap !== 'normal' ? style.gap : null,

			// Box Model
			width: style.width,
			height: style.height,
			padding: style.padding !== '0px' ? style.padding : null,
			margin: style.margin !== '0px' ? style.margin : null,
			border: style.border !== 'none' && style.borderWidth !== '0px' ? style.border : null,
			borderRadius: style.borderRadius !== '0px' ? style.borderRadius : null,

			// Colors
			color: style.color,
			backgroundColor: style.backgroundColor !== 'rgba(0, 0, 0, 0)' ? style.backgroundColor : null,

			// Typography
			fontFamily: style.fontFamily.split(',')[0].replace(/["']/g, ''),
			fontSize: style.fontSize,
			fontWeight: style.fontWeight !== '400' ? style.fontWeight : null,
			lineHeight: style.lineHeight,

			// Effects
			boxShadow: style.boxShadow !== 'none' ? style.boxShadow : null,
			opacity: style.opacity !== '1' ? style.opacity : null,
			transform: style.transform !== 'none' ? style.transform : null,
		};
	}

	// Format CSS value for display
	function formatCssValue(value) {
		if (!value) return null;
		// Shorten long values
		if (value.length > 40) {
			return value.substring(0, 37) + '...';
		}
		return value;
	}

	// RGB to Hex converter
	function rgbToHex(rgb) {
		if (!rgb || rgb === 'transparent') return null;
		const match = rgb.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
		if (!match) return rgb;
		const r = parseInt(match[1]).toString(16).padStart(2, '0');
		const g = parseInt(match[2]).toString(16).padStart(2, '0');
		const b = parseInt(match[3]).toString(16).padStart(2, '0');
		return '#' + r + g + b;
	}

	// Generate copyable CSS
	function generateCopyableCSS(element) {
		const style = window.getComputedStyle(element);
		const important = [
			'display', 'position', 'width', 'height', 'padding', 'margin',
			'background-color', 'color', 'font-family', 'font-size', 'font-weight',
			'border', 'border-radius', 'box-shadow', 'flex-direction', 'justify-content',
			'align-items', 'gap', 'line-height', 'opacity', 'transform'
		];

		const lines = [];
		for (const prop of important) {
			const value = style.getPropertyValue(prop);
			if (value && value !== 'none' && value !== 'normal' && value !== '0px' &&
				value !== 'rgba(0, 0, 0, 0)' && value !== 'auto' && value !== '400') {
				lines.push(prop + ': ' + value + ';');
			}
		}
		return lines.join('\\n');
	}

	// Copy text to clipboard (fallback for older browsers)
	async function copyToClipboard(text) {
		// Try modern clipboard API first
		if (navigator.clipboard && navigator.clipboard.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch (e) {
				// Fall through to fallback
			}
		}

		// Fallback method
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.style.position = 'fixed';
		textarea.style.left = '-9999px';
		document.body.appendChild(textarea);
		textarea.select();
		try {
			const success = document.execCommand('copy');
			document.body.removeChild(textarea);
			return success;
		} catch (e) {
			document.body.removeChild(textarea);
			return false;
		}
	}

	// Update properties panel
	function updatePropertiesPanel(element) {
		if (!propertiesPanel) createPropertiesPanel();

		const rect = element.getBoundingClientRect();
		const styles = getComputedStyles(element);
		const path = getElementPath(element);
		const computedStyle = window.getComputedStyle(element);

		// Box model values
		const margin = {
			top: parseFloat(computedStyle.marginTop) || 0,
			right: parseFloat(computedStyle.marginRight) || 0,
			bottom: parseFloat(computedStyle.marginBottom) || 0,
			left: parseFloat(computedStyle.marginLeft) || 0
		};
		const padding = {
			top: parseFloat(computedStyle.paddingTop) || 0,
			right: parseFloat(computedStyle.paddingRight) || 0,
			bottom: parseFloat(computedStyle.paddingBottom) || 0,
			left: parseFloat(computedStyle.paddingLeft) || 0
		};

		// Build path HTML
		const pathHtml = path.map((p, i) => {
			const isLast = i === path.length - 1;
			return \`<span style="color: \${isLast ? '#4fc1ff' : '#888'};">\${p}</span>\`;
		}).join('<span style="color: #555;"> › </span>');

		// Build styles HTML
		let stylesHtml = '';
		const styleGroups = [
			{ name: 'Layout', props: ['display', 'position', 'flexDirection', 'justifyContent', 'alignItems', 'gap'] },
			{ name: 'Size', props: ['width', 'height'] },
			{ name: 'Spacing', props: ['padding', 'margin'] },
			{ name: 'Colors', props: ['color', 'backgroundColor'] },
			{ name: 'Typography', props: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight'] },
			{ name: 'Border', props: ['border', 'borderRadius'] },
			{ name: 'Effects', props: ['boxShadow', 'opacity', 'transform'] }
		];

		for (const group of styleGroups) {
			const groupStyles = group.props
				.filter(p => styles[p])
				.map(p => {
					let value = styles[p];
					const formatted = formatCssValue(value);

					// Add color swatch for color values
					let swatch = '';
					if ((p === 'color' || p === 'backgroundColor') && value) {
						const hex = rgbToHex(value);
						if (hex) {
							swatch = \`<span style="display:inline-block;width:12px;height:12px;background:\${hex};border:1px solid #555;border-radius:2px;margin-right:4px;vertical-align:middle;"></span>\`;
						}
					}

					const propName = p.replace(/([A-Z])/g, '-$1').toLowerCase();
					return \`<div style="display:flex;justify-content:space-between;padding:2px 0;">
						<span style="color:#9cdcfe;">\${propName}</span>
						<span style="color:#ce9178;">\${swatch}\${formatted}</span>
					</div>\`;
				});

			if (groupStyles.length > 0) {
				stylesHtml += \`
					<div style="margin-bottom:8px;">
						<div style="color:#888;font-size:10px;text-transform:uppercase;margin-bottom:4px;">\${group.name}</div>
						\${groupStyles.join('')}
					</div>
				\`;
			}
		}

		// Box model visualization
		const boxModelHtml = \`
			<div style="display:flex;flex-direction:column;align-items:center;padding:8px;background:#252526;border-radius:4px;">
				<div style="font-size:10px;color:#888;margin-bottom:4px;">BOX MODEL</div>
				<div style="position:relative;width:200px;height:120px;">
					<!-- Margin (orange) -->
					<div style="position:absolute;inset:0;background:#f5a6231a;border:1px dashed #f5a623;display:flex;align-items:center;justify-content:center;">
						<span style="position:absolute;top:2px;left:50%;transform:translateX(-50%);font-size:9px;color:#f5a623;">\${margin.top}</span>
						<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:9px;color:#f5a623;">\${margin.bottom}</span>
						<span style="position:absolute;left:2px;top:50%;transform:translateY(-50%);font-size:9px;color:#f5a623;">\${margin.left}</span>
						<span style="position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:9px;color:#f5a623;">\${margin.right}</span>

						<!-- Padding (green) -->
						<div style="position:absolute;inset:20px;background:#10b9811a;border:1px dashed #10b981;display:flex;align-items:center;justify-content:center;">
							<span style="position:absolute;top:2px;left:50%;transform:translateX(-50%);font-size:9px;color:#10b981;">\${padding.top}</span>
							<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:9px;color:#10b981;">\${padding.bottom}</span>
							<span style="position:absolute;left:2px;top:50%;transform:translateY(-50%);font-size:9px;color:#10b981;">\${padding.left}</span>
							<span style="position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:9px;color:#10b981;">\${padding.right}</span>

							<!-- Content (blue) -->
							<div style="position:absolute;inset:18px;background:#3b82f61a;border:1px solid #3b82f6;display:flex;align-items:center;justify-content:center;">
								<span style="font-size:10px;color:#3b82f6;">\${Math.round(rect.width)}×\${Math.round(rect.height)}</span>
							</div>
						</div>
					</div>
				</div>
				<div style="display:flex;gap:12px;margin-top:8px;font-size:9px;">
					<span><span style="color:#f5a623;">■</span> margin</span>
					<span><span style="color:#10b981;">■</span> padding</span>
					<span><span style="color:#3b82f6;">■</span> content</span>
				</div>
			</div>
		\`;

		propertiesPanel.innerHTML = \`
			<!-- Header -->
			<div style="padding:12px 16px;border-bottom:1px solid #3c3c3c;background:#252526;border-radius:8px 8px 0 0;cursor:grab;">
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
					<div style="color:#dcdcaa;font-weight:600;font-size:13px;">\${componentName}</div>
					<div style="display:flex;gap:8px;align-items:center;">
						<button id="roopik-open-editor" title="Open in Editor" style="
							background:#0e639c;
							color:white;
							border:none;
							border-radius:4px;
							cursor:pointer;
							font-size:14px;
							padding:4px 8px;
							transition:background 0.2s;
							display:flex;
							align-items:center;
							gap:4px;
						">
							<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
								<path d="M13.5 1h-11C1.67 1 1 1.67 1 2.5v11c0 .83.67 1.5 1.5 1.5h11c.83 0 1.5-.67 1.5-1.5v-11c0-.83-.67-1.5-1.5-1.5zM13 13H3V3h10v10z"/>
								<path d="M5 5h6v1H5V5zm0 2h6v1H5V7zm0 2h4v1H5V9z"/>
							</svg>
							<span style="font-size:11px;">Open</span>
						</button>
						<button id="roopik-close-panel" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;padding:0 4px;line-height:1;">&times;</button>
					</div>
				</div>
				<div style="font-size:11px;overflow-x:auto;white-space:nowrap;">\${pathHtml}</div>
			</div>

			<!-- Content -->
			<div style="padding:12px 16px;">
				<!-- Box Model -->
				\${boxModelHtml}

				<!-- Computed Styles -->
				<div style="margin-top:12px;">
					<div style="color:#888;font-size:10px;text-transform:uppercase;margin-bottom:8px;">COMPUTED STYLES</div>
					\${stylesHtml}
				</div>

				<!-- Actions -->
				<div style="display:flex;gap:8px;margin-top:12px;">
					<button id="roopik-copy-styles" style="
						flex:1;
						padding:8px 12px;
						background:#0e639c;
						color:white;
						border:none;
						border-radius:4px;
						cursor:pointer;
						font-size:11px;
						transition:background 0.2s;
					">Copy Styles</button>
				</div>

				<div style="text-align:center;margin-top:8px;font-size:10px;color:#666;">
					Press ESC to close • Drag header to move
				</div>
			</div>
		\`;

		// Event handlers
		document.getElementById('roopik-close-panel')?.addEventListener('click', clearSelection);

		// Open in Editor button - use source location from element
		const openEditorBtn = document.getElementById('roopik-open-editor');
		if (openEditorBtn) {
			openEditorBtn.addEventListener('click', () => {
				const sourceLocation = parseSourceLocation(element);
				if (sourceLocation) {
					// Send source location to open specific line with highlighting
					window.parent.postMessage({
						type: 'roopik-select-open-source',
						componentId: componentId,
						sourceLocation: sourceLocation
					}, '*');
				} else {
					// Fallback to opening component file at line 1
					window.parent.postMessage({
						type: 'roopik-select-open-component',
						componentId: componentId
					}, '*');
				}
			});
			openEditorBtn.addEventListener('mouseenter', () => { openEditorBtn.style.background = '#1177bb'; });
			openEditorBtn.addEventListener('mouseleave', () => { openEditorBtn.style.background = '#0e639c'; });
		}

		const copyBtn = document.getElementById('roopik-copy-styles');
		if (copyBtn) {
			copyBtn.addEventListener('click', async () => {
				const css = generateCopyableCSS(element);
				const success = await copyToClipboard(css);
				if (success) {
					copyBtn.textContent = '✓ Copied!';
					copyBtn.style.background = '#10b981';
					setTimeout(() => {
						copyBtn.textContent = 'Copy Styles';
						copyBtn.style.background = '#0e639c';
					}, 1500);
				} else {
					copyBtn.textContent = '✗ Failed';
					copyBtn.style.background = '#dc2626';
					setTimeout(() => {
						copyBtn.textContent = 'Copy Styles';
						copyBtn.style.background = '#0e639c';
					}, 1500);
				}
			});
			copyBtn.addEventListener('mouseenter', () => { copyBtn.style.background = '#1177bb'; });
			copyBtn.addEventListener('mouseleave', () => { copyBtn.style.background = '#0e639c'; });
		}

		propertiesPanel.style.display = 'block';
	}

	// Clear selection
	function clearSelection() {
		selectedElement = null;
		if (highlightOverlay) highlightOverlay.style.display = 'none';
		if (marginOverlay) marginOverlay.style.display = 'none';
		if (paddingOverlay) paddingOverlay.style.display = 'none';
		if (propertiesPanel) propertiesPanel.style.display = 'none';
		hideHoverOverlay();

		window.parent.postMessage({
			type: 'roopik-select-cleared',
			componentId: componentId
		}, '*');
	}

	// Handle click
	function handleClick(event) {
		if (!selectEnabled) return;

		const target = event.target;
		if (target.closest('#roopik-properties-panel') ||
			target.id?.startsWith('roopik-')) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		if (target === selectedElement) {
			clearSelection();
			return;
		}

		selectedElement = target;
		updateOverlays(target);
		updatePropertiesPanel(target);
		hideHoverOverlay();
	}

	// Handle hover
	function handleMouseMove(event) {
		if (!selectEnabled || selectedElement) return;

		const target = event.target;
		if (target.closest('#roopik-properties-panel') ||
			target.id?.startsWith('roopik-')) {
			hideHoverOverlay();
			return;
		}

		updateHoverOverlay(target);
	}

	// Handle keydown
	function handleKeyDown(event) {
		if (!selectEnabled) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			clearSelection();

			window.parent.postMessage({
				type: 'roopik-select-escape',
				componentId: componentId
			}, '*');
		}
	}

	// Listen for messages
	window.addEventListener('message', function(event) {
		if (event.data?.type === 'roopik-toggle-select') {
			selectEnabled = event.data.enabled;

			if (selectEnabled) {
				createOverlays();
				createPropertiesPanel();
				document.body.style.cursor = 'crosshair';
			} else {
				clearSelection();
				document.body.style.cursor = '';
			}
		}
	});

	// Attach listeners
	document.addEventListener('click', handleClick, true);
	document.addEventListener('mousemove', handleMouseMove, true);
	document.addEventListener('keydown', handleKeyDown, true);
	document.addEventListener('mouseleave', hideHoverOverlay);
})();
// ===== End Element Inspector =====

`;
		return code + selectScript;
	}
}
