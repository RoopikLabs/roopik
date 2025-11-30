/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { EditorInputCapabilities } from '../../../../common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';

const canvasTabIcon = registerIcon('roopik-canvas-tab', Codicon.paintcan, 'Icon for Component Canvas tab');

/**
 * Canvas Editor Input - Defines the component canvas tab identity
 *
 * Unlike ProjectMode (singleton), Canvas supports multiple instances.
 * Each canvas has a unique ID and can be opened in separate tabs.
 *
 * Responsibilities:
 * - Tab icon and title
 * - Canvas ID and name state
 * - Instance management per canvas ID
 */
export class CanvasInput extends EditorInput {
	static readonly ID = 'roopik.canvasInput';

	// Instance map - one instance per canvas ID (not global singleton)
	private static _instances = new Map<string, CanvasInput>();

	private readonly _canvasId: string;
	private _canvasName: string;

	/**
	 * Get or create a canvas input for the given canvas ID.
	 * Same canvas ID will return the same instance.
	 */
	static getInstance(canvasId: string, canvasName?: string): CanvasInput {
		let instance = CanvasInput._instances.get(canvasId);
		if (!instance) {
			instance = new CanvasInput(canvasId, canvasName || canvasId);
			CanvasInput._instances.set(canvasId, instance);
		} else if (canvasName && instance._canvasName !== canvasName) {
			// Update name if provided and different
			instance.setCanvasName(canvasName);
		}
		return instance;
	}

	/**
	 * Get all open canvas instances
	 */
	static getAllInstances(): CanvasInput[] {
		return Array.from(CanvasInput._instances.values());
	}

	/**
	 * Get count of open canvases
	 */
	static getOpenCount(): number {
		return CanvasInput._instances.size;
	}

	/**
	 * Constructor - prefer using getInstance()
	 * Public constructor required for VSCode's SyncDescriptor registration.
	 */
	constructor(canvasId: string = 'default', canvasName: string = 'Component Canvas') {
		super();
		this._canvasId = canvasId;
		this._canvasName = canvasName;

		// Auto-register in instances map if not already there
		if (!CanvasInput._instances.has(canvasId)) {
			CanvasInput._instances.set(canvasId, this);
		}
	}

	override get typeId(): string {
		return CanvasInput.ID;
	}

	/**
	 * Canvas can be opened in multiple tabs (one per canvas ID)
	 * Not a global singleton, but unique per canvas ID
	 */
	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.None;
	}

	override get resource(): URI {
		// Unique URI per canvas ID
		return URI.parse(`roopik-canvas://canvas/${this._canvasId}`);
	}

	override getName(): string {
		return this._canvasName || 'Component Canvas';
	}

	override getIcon() {
		return canvasTabIcon;
	}

	/**
	 * Canvas ID getter
	 */
	get canvasId(): string {
		return this._canvasId;
	}

	/**
	 * Canvas name getter
	 */
	get canvasName(): string {
		return this._canvasName;
	}

	/**
	 * Update canvas name
	 */
	setCanvasName(name: string): void {
		if (this._canvasName !== name) {
			this._canvasName = name;
			this._onDidChangeLabel.fire();
		}
	}

	override matches(other: EditorInput): boolean {
		// Match if same canvas ID
		if (other instanceof CanvasInput) {
			return other._canvasId === this._canvasId;
		}
		return false;
	}

	override dispose(): void {
		// Remove from instances map
		CanvasInput._instances.delete(this._canvasId);
		super.dispose();
	}
}
