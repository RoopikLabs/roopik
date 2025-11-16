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
import { SAMPLE_SANDBOX } from './data/sampleData';
import './App.css';

// Canvas state from extension
declare global {
	interface Window {
		CANVAS_STATE: any;
	}
}

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
	const [sandboxes, setSandboxes] = useState<Sandbox[]>([SAMPLE_SANDBOX]);
	const fps = useFPS();

	// Phase 2: Vite dev server creation (currently disabled - using static HTML)
	useEffect(() => {
		console.log('[App] Phase 1: Using static compiled HTML for sandboxes');
	}, []);

	// Listen for messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;

			switch (message.type) {
				case 'sandboxServerReady':
					console.log(`[App] Vite dev server ready: ${message.devServerUrl}`);
					setSandboxes(prev => prev.map(sandbox =>
						sandbox.id === message.sandboxId
							? { ...sandbox, devServerUrl: message.devServerUrl }
							: sandbox
					));
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

	return (
		<div className="app">
			<FloatingToolbar tabName="Canvas" />

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
