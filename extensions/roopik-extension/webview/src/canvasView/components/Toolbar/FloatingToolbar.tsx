/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

interface FloatingToolbarProps {
	tabName?: string;
	onAddComponent: () => void;
	onTidyUp: () => void;
}

/**
 * FloatingToolbar - Top toolbar for canvas actions
 * Independent component following modular architecture
 */
export function FloatingToolbar({
	tabName = 'Canvas',
	onAddComponent,
	onTidyUp
}: FloatingToolbarProps) {
	return (
		<div className="floating-toolbar">
			<span style={{ fontSize: '12px', fontWeight: 600, marginRight: '8px' }}>{tabName}</span>
			<div className="separator" />
			<button onClick={onAddComponent}>
				+ Add Component
			</button>
			<div className="separator" />
			<button className="secondary" onClick={onTidyUp} title="Tidy Up - Reorganize all to grid">
				⊞ Tidy Up
			</button>
		</div>
	);
}
