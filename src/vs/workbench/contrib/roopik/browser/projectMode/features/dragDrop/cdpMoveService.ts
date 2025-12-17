/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IProjectModeService } from '../../../../common/projectMode/ipc.js';
import type { ILogger } from '../../../../../../../platform/log/common/log.js';
import type { MoveResult, ReferenceNodeResult, SourceLocation } from './types.js';

/**
 * Service for CDP DOM operations related to element movement
 *
 * Handles all Chrome DevTools Protocol operations for:
 * - Moving elements in the live DOM
 * - Undoing moves (moving back to original position)
 * - Getting element information
 */
export class CDPMoveService {
	constructor(
		private readonly browserService: IProjectModeService,
		private readonly logger: ILogger
	) {}

	/**
	 * Initialize DOM domain (required before any DOM operations)
	 */
	async enableDOM(browserViewId: number): Promise<void> {
		await this.browserService.sendCDPCommand(browserViewId, 'DOM.enable', {});
	}

	/**
	 * Get the document root with full DOM tree pushed to frontend
	 * CDP querySelector only works on nodes that have been "pushed"
	 */
	async getDocumentRoot(browserViewId: number): Promise<number | null> {
		const docResult = await this.browserService.sendCDPCommand(
			browserViewId,
			'DOM.getDocument',
			{ depth: -1, pierce: true }  // -1 = entire tree, pierce = go through shadow DOM
		) as { root: { nodeId: number } };

		return docResult?.root?.nodeId ?? null;
	}

	/**
	 * Get nodeId for a CSS selector
	 */
	async getNodeId(browserViewId: number, rootNodeId: number, selector: string): Promise<number | null> {
		const result = await this.browserService.sendCDPCommand(
			browserViewId,
			'DOM.querySelector',
			{ nodeId: rootNodeId, selector }
		) as { nodeId: number };

		if (!result?.nodeId || result.nodeId === 0) {
			return null;
		}
		return result.nodeId;
	}

	/**
	 * Get the currently selected element's selector from inject script
	 */
	async getSelectedElementSelector(browserViewId: number): Promise<string | null> {
		const result = await this.browserService.executeScript(
			browserViewId,
			'window.__roopikInspectResult ? window.__roopikInspectResult.selector : null'
		);
		return result as string | null;
	}

	/**
	 * Get the currently selected element's source location
	 */
	async getSelectedElementSource(browserViewId: number): Promise<SourceLocation | null> {
		const result = await this.browserService.executeScript(
			browserViewId,
			'window.__roopikInspectResult ? window.__roopikInspectResult.source : null'
		);
		return result as SourceLocation | null;
	}

	/**
	 * Get element's current parent and index (for undo tracking)
	 */
	async getElementPosition(browserViewId: number, elementSelector: string): Promise<{ parentSelector: string; index: number } | null> {
		const script = `
			(function() {
				var el = document.querySelector('${elementSelector.replace(/'/g, "\\'")}');
				if (!el || !el.parentElement) return null;

				var parent = el.parentElement;

				// Build parent selector
				var parentSelector = parent.tagName.toLowerCase();
				if (parent.id) {
					parentSelector = '#' + parent.id;
				} else if (parent.className) {
					parentSelector = parent.tagName.toLowerCase() + '.' + parent.className.trim().split(/\\s+/).join('.');
				}

				// Find index among valid siblings
				var siblings = Array.from(parent.children).filter(function(child) {
					if (child.id && child.id.startsWith('__roopik')) return false;
					if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'LINK') return false;
					return true;
				});

				var index = siblings.indexOf(el);

				return { parentSelector: parentSelector, index: index };
			})()
		`;

		const result = await this.browserService.executeScript(browserViewId, script);
		return result as { parentSelector: string; index: number } | null;
	}

	/**
	 * Find the reference node for insertBefore operation
	 */
	async findReferenceNode(
		browserViewId: number,
		parentSelector: string,
		elementSelector: string,
		targetIndex: number
	): Promise<ReferenceNodeResult> {
		const script = `
			(function() {
				var parent = document.querySelector('${parentSelector.replace(/'/g, "\\'")}');
				var selectedEl = document.querySelector('${elementSelector.replace(/'/g, "\\'")}');
				if (!parent) return { error: 'Parent not found' };
				if (!selectedEl) return { error: 'Selected element not found' };

				// Get all raw children
				var allChildren = Array.from(parent.children);

				// Filter to valid children (excluding our UI elements)
				var validChildren = allChildren.filter(function(el) {
					if (el.id && el.id.startsWith('__roopik')) return false;
					if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') return false;
					return true;
				});

				// Check if selected element is in this parent
				var selectedInSameParent = selectedEl.parentElement === parent;
				var selectedIndexInValid = validChildren.indexOf(selectedEl);

				// Get siblings (valid children EXCLUDING selected element)
				var siblingsWithoutSelected = validChildren.filter(function(el) {
					return el !== selectedEl;
				});

				// Debug info
				var debugInfo = {
					validCount: validChildren.length,
					siblingsCount: siblingsWithoutSelected.length,
					selectedInSameParent: selectedInSameParent,
					selectedIndexInValid: selectedIndexInValid,
					targetIndex: ${targetIndex}
				};

				// If inserting at or past the end, append (no insertBefore needed)
				if (${targetIndex} >= siblingsWithoutSelected.length) {
					debugInfo.action = 'append';
					return { insertBefore: null, debug: JSON.stringify(debugInfo) };
				}

				// Get the sibling at target index
				var referenceNode = siblingsWithoutSelected[${targetIndex}];
				if (!referenceNode) {
					debugInfo.action = 'append_noref';
					return { insertBefore: null, debug: JSON.stringify(debugInfo) };
				}

				// Find reference node position in CURRENT DOM for nth-child selector
				var refIndexInAllChildren = allChildren.indexOf(referenceNode);
				debugInfo.refIndexInAll = refIndexInAllChildren;

				// nth-child is 1-based
				var nthChildIndex = refIndexInAllChildren + 1;
				var selector = '${parentSelector.replace(/'/g, "\\'")} > :nth-child(' + nthChildIndex + ')';

				debugInfo.action = 'insertBefore';
				debugInfo.selector = selector;

				return {
					insertBeforeSelector: selector,
					debug: JSON.stringify(debugInfo)
				};
			})()
		`;

		const result = await this.browserService.executeScript(browserViewId, script);
		return result as ReferenceNodeResult;
	}

	/**
	 * Move an element to a new position using CDP DOM.moveTo
	 */
	async moveElement(
		browserViewId: number,
		elementSelector: string,
		parentSelector: string,
		targetIndex: number
	): Promise<MoveResult> {
		try {
			this.logger.info('[CDPMove] Starting move:', { elementSelector, parentSelector, targetIndex });

			// 1. Enable DOM domain
			await this.enableDOM(browserViewId);

			// 2. Get document root
			const rootNodeId = await this.getDocumentRoot(browserViewId);
			if (!rootNodeId) {
				return { success: false, error: 'Failed to get document root' };
			}

			// 3. Get element nodeId
			const elementNodeId = await this.getNodeId(browserViewId, rootNodeId, elementSelector);
			if (!elementNodeId) {
				return { success: false, error: 'Element not found' };
			}

			// 4. Get parent nodeId
			const parentNodeId = await this.getNodeId(browserViewId, rootNodeId, parentSelector);
			if (!parentNodeId) {
				return { success: false, error: 'Target parent not found' };
			}

			// 5. Find reference node for insertBefore
			const refResult = await this.findReferenceNode(browserViewId, parentSelector, elementSelector, targetIndex);
			this.logger.info('[CDPMove] Reference result:', refResult);

			if (refResult.error) {
				return { success: false, error: refResult.error };
			}

			let insertBeforeNodeId: number | undefined;
			if (refResult.insertBeforeSelector) {
				insertBeforeNodeId = await this.getNodeId(browserViewId, rootNodeId, refResult.insertBeforeSelector) ?? undefined;
			}

			// 6. Execute DOM.moveTo
			const moveParams: { nodeId: number; targetNodeId: number; insertBeforeNodeId?: number } = {
				nodeId: elementNodeId,
				targetNodeId: parentNodeId
			};

			if (insertBeforeNodeId !== undefined) {
				moveParams.insertBeforeNodeId = insertBeforeNodeId;
			}

			const moveResult = await this.browserService.sendCDPCommand(
				browserViewId,
				'DOM.moveTo',
				moveParams
			) as { nodeId?: number };

			if (!moveResult || typeof moveResult.nodeId !== 'number') {
				return { success: false, error: 'DOM.moveTo did not return nodeId' };
			}

			this.logger.info('[CDPMove] Move successful, new nodeId:', moveResult.nodeId);
			return { success: true, newNodeId: moveResult.nodeId };

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error('[CDPMove] Move failed:', errorMessage);
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * Undo a move by moving element back to original position
	 */
	async undoMove(
		browserViewId: number,
		elementSelector: string,
		originalParent: string,
		originalIndex: number
	): Promise<MoveResult> {
		this.logger.info('[CDPMove] Undoing move:', { elementSelector, originalParent, originalIndex });
		return this.moveElement(browserViewId, elementSelector, originalParent, originalIndex);
	}

	/**
	 * Re-select the moved element to update overlays
	 */
	async reselectElement(browserViewId: number): Promise<void> {
		await this.browserService.executeScript(
			browserViewId,
			`(function() {
				if (typeof window.__roopikReselectElement === 'function') {
					window.__roopikReselectElement();
				}
			})()`
		);
	}

	/**
	 * Show toast feedback in browser
	 */
	async showToast(browserViewId: number, message: string): Promise<void> {
		await this.browserService.executeScript(
			browserViewId,
			`(function() {
				if (typeof window.__roopikShowToast === 'function') {
					window.__roopikShowToast('${message.replace(/'/g, "\\'")}');
				}
			})()`
		);
	}
}
