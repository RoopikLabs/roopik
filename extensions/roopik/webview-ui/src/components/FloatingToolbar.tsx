/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface FloatingToolbarProps {
	tabName?: string;
}

export function FloatingToolbar({ tabName = 'Canvas' }: FloatingToolbarProps) {
	return (
		<div className="toolbar">
			<div className="toolbar-section">
				<span className="tab-name">{tabName}</span>
			</div>
		</div>
	);
}
