import { useState, useRef, useEffect } from 'react';
import './App.css';

// Canvas state from extension
declare global {
	interface Window {
		CANVAS_STATE: any;
	}
}

// Transform matrix for pan/zoom
interface Transform {
	x: number;      // Pan X offset
	y: number;      // Pan Y offset
	scale: number;  // Zoom level (1.0 = 100%)
}

// Background pattern types
type BackgroundPattern = 'grid' | 'dots' | 'plain';

function App() {
	const canvasRef = useRef<HTMLDivElement>(null);
	const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
	const [isPanning, setIsPanning] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [fps, setFps] = useState(60);
	const [pattern, setPattern] = useState<BackgroundPattern>('dots');

	const lastFrameTime = useRef(0);
	const frameCount = useRef(0);

	// FPS monitoring
	useEffect(() => {
		lastFrameTime.current = Date.now();

		const updateFps = () => {
			frameCount.current++;
			const now = Date.now();
			const elapsed = now - lastFrameTime.current;

			if (elapsed >= 1000) {
				setFps(Math.round((frameCount.current * 1000) / elapsed));
				frameCount.current = 0;
				lastFrameTime.current = now;
			}

			requestAnimationFrame(updateFps);
		};

		const rafId = requestAnimationFrame(updateFps);
		return () => cancelAnimationFrame(rafId);
	}, []);

	// Mouse down - start panning
	const handleMouseDown = (e: React.MouseEvent) => {
		if (e.button === 0 || e.button === 1) { // Left or middle mouse button
			setIsPanning(true);
			setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
			e.preventDefault();
		}
	};

	// Mouse move - pan the canvas
	const handleMouseMove = (e: React.MouseEvent) => {
		if (isPanning) {
			const newX = e.clientX - dragStart.x;
			const newY = e.clientY - dragStart.y;
			setTransform(prev => ({ ...prev, x: newX, y: newY }));
		}
	};

	// Mouse up - stop panning
	const handleMouseUp = () => {
		setIsPanning(false);
	};

	// Wheel - zoom in/out
	const handleWheel = (e: React.WheelEvent) => {
		e.preventDefault();

		const delta = -e.deltaY;
		const zoomIntensity = 0.001;
		const newScale = Math.max(0.1, Math.min(10, transform.scale + delta * zoomIntensity));

		// Zoom towards mouse cursor
		const rect = canvasRef.current?.getBoundingClientRect();
		if (rect) {
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			const scaleRatio = newScale / transform.scale;
			const newX = mouseX - (mouseX - transform.x) * scaleRatio;
			const newY = mouseY - (mouseY - transform.y) * scaleRatio;

			setTransform({ x: newX, y: newY, scale: newScale });
		}
	};

	// Reset view
	const resetView = () => {
		setTransform({ x: 0, y: 0, scale: 1 });
	};

	// Zoom controls
	const zoomIn = () => {
		setTransform(prev => ({ ...prev, scale: Math.min(10, prev.scale * 1.2) }));
	};

	const zoomOut = () => {
		setTransform(prev => ({ ...prev, scale: Math.max(0.1, prev.scale / 1.2) }));
	};

	// Cycle through patterns
	const togglePattern = () => {
		const patterns: BackgroundPattern[] = ['grid', 'dots', 'plain'];
		const currentIndex = patterns.indexOf(pattern);
		const nextIndex = (currentIndex + 1) % patterns.length;
		setPattern(patterns[nextIndex]);
	};

	// Generate background pattern based on type
	const getBackgroundStyle = (): React.CSSProperties => {
		const gridSize = 20 * transform.scale;
		const offsetX = transform.x % gridSize;
		const offsetY = transform.y % gridSize;

		if (pattern === 'grid') {
			return {
				backgroundImage: `
					linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
					linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)
				`,
				backgroundSize: `${gridSize}px ${gridSize}px`,
				backgroundPosition: `${offsetX}px ${offsetY}px`,
			};
		} else if (pattern === 'dots') {
			return {
				backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.15) 1px, transparent 1px)`,
				backgroundSize: `${gridSize}px ${gridSize}px`,
				backgroundPosition: `${offsetX}px ${offsetY}px`,
			};
		} else {
			return {};
		}
	};

	return (
		<div className="app">
			{/* Toolbar */}
			<div className="toolbar">
				<div className="toolbar-section">
					<h1 className="toolbar-title">Roopik Canvas</h1>
					<span className="canvas-name">
						{window.CANVAS_STATE?.name || 'Untitled Canvas'}
					</span>
				</div>

				<div className="toolbar-section">
					<button onClick={zoomOut} className="toolbar-btn" title="Zoom Out">−</button>
					<span className="zoom-level">{Math.round(transform.scale * 100)}%</span>
					<button onClick={zoomIn} className="toolbar-btn" title="Zoom In">+</button>
					<button onClick={resetView} className="toolbar-btn" title="Reset View">⟲</button>
					<button onClick={togglePattern} className="toolbar-btn" title="Toggle Pattern">
						{pattern === 'grid' ? '⊞' : pattern === 'dots' ? '⋮' : '▢'}
					</button>
				</div>

				<div className="toolbar-section">
					<span className="fps-counter">{fps} FPS</span>
					<span className="coordinates">
						X: {Math.round(transform.x)} Y: {Math.round(transform.y)}
					</span>
				</div>
			</div>

			{/* Infinite Canvas */}
			<div
				ref={canvasRef}
				className={`canvas ${isPanning ? 'panning' : ''}`}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				onWheel={handleWheel}
				style={getBackgroundStyle()}
			>
				{/* Canvas content with transform */}
				<div
					className="canvas-content"
					style={{
						transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
						transformOrigin: '0 0',
					}}
				>
					{/* Placeholder components will be rendered here */}
					<div className="placeholder-component" style={{ left: 100, top: 100 }}>
						Component 1
					</div>
					<div className="placeholder-component" style={{ left: 300, top: 150 }}>
						Component 2
					</div>
					<div className="placeholder-component" style={{ left: 200, top: 300 }}>
						Component 3
					</div>
				</div>
			</div>

			{/* Status Bar */}
			<div className="status-bar">
				<span>Pattern: {pattern}</span>
				<span>•</span>
				<span>Scale: {transform.scale.toFixed(2)}x</span>
				<span>•</span>
				<span>Position: ({Math.round(transform.x)}, {Math.round(transform.y)})</span>
				<span>•</span>
				<span>Components: {window.CANVAS_STATE?.components?.length || 0}</span>
			</div>
		</div>
	);
}

export default App;
