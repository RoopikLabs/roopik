/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect } from 'react';
import type { Sandbox } from './types';
import { FloatingToolbar } from './components/FloatingToolbar';
import { InfiniteCanvas } from './components/InfiniteCanvas';
import { StatusBar } from './components/StatusBar';
import { useFPS } from './hooks/useFPS';
import { SAMPLE_COMPONENTS } from './data/sampleComponents';
import './App.css';

// VS Code API
declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

// Transform matrix for pan/zoom
interface Transform {
	x: number;
	y: number;
	scale: number;
}

// Background pattern types
type BackgroundPattern = 'grid' | 'dots' | 'plain';

function App() {
	const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
	const [pattern, setPattern] = useState<BackgroundPattern>('dots');
	const [sandboxes, _setSandboxes] = useState<Sandbox[]>([]);
	const [_sandboxTemplate, setSandboxTemplate] = useState<string | null>(null);
	const fps = useFPS();

	// Request sandbox template on mount
	useEffect(() => {
		console.log('[Canvas] Requesting sandbox template from extension');
		vscode.postMessage({ type: 'getSandboxTemplate' });

		// Listen for messages from extension
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			console.log('[Canvas] Received message from extension:', message.type);

			switch (message.type) {
				case 'sandboxTemplate':
					console.log('[Canvas] Sandbox template received');
					setSandboxTemplate(message.html);
					break;

				case 'componentReady':
					console.log('[Canvas] Component ready:', message.componentId);

					// Create new sandbox on canvas
					const newSandbox: Sandbox = {
						id: message.componentId,
						x: 100 + (sandboxes.length * 50), // Offset each new component
						y: 100 + (sandboxes.length * 50),
						width: 400,
						height: 400,
						sandboxMessage: message.sandboxMessage
					};

					_setSandboxes(prev => [...prev, newSandbox]);
					console.log('[Canvas] Sandbox added to canvas:', newSandbox.id);
					break;

				case 'componentUpdate':
					console.log('[Canvas] Component update:', message.componentId);
					// TODO: Send update message to existing sandbox iframe
					break;
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	// Zoom controls
	const handleZoomIn = () => {
		setTransform(prev => ({ ...prev, scale: Math.min(10, prev.scale * 1.2) }));
	};

	const handleZoomOut = () => {
		setTransform(prev => ({ ...prev, scale: Math.max(0.1, prev.scale / 1.2) }));
	};

	const handleResetView = () => {
		setTransform({ x: 0, y: 0, scale: 1 });
	};

	// Pattern toggle
	const handleTogglePattern = () => {
		const patterns: BackgroundPattern[] = ['grid', 'dots', 'plain'];
		const currentIndex = patterns.indexOf(pattern);
		const nextIndex = (currentIndex + 1) % patterns.length;
		setPattern(patterns[nextIndex]);
	};

	// Load sample component
	const handleLoadSample = (sampleIndex: number) => {
		const sample = SAMPLE_COMPONENTS[sampleIndex];
		if (!sample) {
			console.error('[Canvas] Sample not found:', sampleIndex);
			return;
		}

		console.log('[Canvas] Loading sample component:', sample.name);

		// Send component to extension for processing
		vscode.postMessage({
			type: 'loadComponent',
			component: {
				id: sample.id,
				code: sample.code,
				dependencies: sample.dependencies
			}
		});
	};

	return (
		<div className="app">
			<FloatingToolbar tabName="Canvas" onLoadSample={handleLoadSample} />

			<InfiniteCanvas
				sandboxes={sandboxes}
				transform={transform}
				pattern={pattern}
				onTransformChange={setTransform}
			/>

			<StatusBar
				transform={transform}
				fps={fps}
				sandboxCount={sandboxes.length}
				pattern={pattern}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onResetView={handleResetView}
				onTogglePattern={handleTogglePattern}
			/>
		</div>
	);
}

export default App;
