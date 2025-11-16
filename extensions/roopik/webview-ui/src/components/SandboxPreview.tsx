/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Sandbox } from '../types';

interface SandboxPreviewProps {
	sandbox: Sandbox;
	onClick?: () => void;
}

export function SandboxPreview({ sandbox, onClick }: SandboxPreviewProps) {
	// Always show compiled HTML for now (Vite integration will come in Phase 2)
	const htmlContent = sandbox.compiled?.html || '<html><body><h1>Loading sandbox...</h1></body></html>';

	return (
		<div
			className={`sandbox ${sandbox.isSelected ? 'selected' : ''}`}
			style={{
				position: 'absolute',
				left: sandbox.position.x,
				top: sandbox.position.y,
				width: sandbox.size.width,
				height: sandbox.size.height,
			}}
			onClick={onClick}
		>
			{/* Sandbox header */}
			<div className="sandbox-header">
				<span className="sandbox-name">{sandbox.name}</span>
			</div>

			{/* Sandbox iframe with compiled HTML */}
			<iframe
				className="sandbox-iframe"
				srcDoc={htmlContent}
				sandbox="allow-scripts allow-same-origin"
				title={sandbox.name}
			/>
		</div>
	);
}
