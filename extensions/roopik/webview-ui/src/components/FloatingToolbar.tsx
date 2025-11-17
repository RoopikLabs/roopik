/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface FloatingToolbarProps {
	tabName?: string;
	onLoadSample?: (sampleIndex: number) => void;
}

export function FloatingToolbar({ tabName = 'Canvas', onLoadSample }: FloatingToolbarProps) {
	return (
		<div className="toolbar">
			<div className="toolbar-section">
				<span className="tab-name">{tabName}</span>
			</div>
			{onLoadSample && (
				<div className="toolbar-section" style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
					<button
						className="toolbar-button"
						onClick={() => onLoadSample(0)}
						title="Load Button Sample"
					>
						🔘 Button
					</button>
					<button
						className="toolbar-button"
						onClick={() => onLoadSample(1)}
						title="Load Counter Sample"
					>
						🔢 Counter
					</button>
					<button
						className="toolbar-button"
						onClick={() => onLoadSample(2)}
						title="Load Card Sample"
					>
						🎨 Card
					</button>
				</div>
			)}
		</div>
	);
}
