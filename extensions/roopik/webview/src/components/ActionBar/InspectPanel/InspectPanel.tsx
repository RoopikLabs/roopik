/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef, useEffect } from 'react';
import type { InspectedElement } from '../../../utils/inspectOverlay';
import { ElementInfo } from './ElementInfo.js';
import { StylesSection } from './StylesSection.js';
import './InspectPanel.css';

interface InspectPanelProps {
	inspectedElement: InspectedElement | null;
	isInspectMode: boolean;
	onOpenInEditor?: (file: string, line: number) => void;
	onClose: () => void;
}

export function InspectPanel({
	inspectedElement,
	isInspectMode,
	onOpenInEditor,
	onClose
}: InspectPanelProps) {
	const [isTransparent, setIsTransparent] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const panelRef = useRef<HTMLDivElement>(null);

	// Handle drag start
	const handleMouseDown = (e: React.MouseEvent) => {
		// Only allow dragging from header (not from buttons)
		if ((e.target as HTMLElement).closest('button')) {
			return;
		}

		setIsDragging(true);
		setDragStart({
			x: e.clientX - position.x,
			y: e.clientY - position.y
		});
	};

	// Handle dragging
	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (isDragging) {
				const newX = e.clientX - dragStart.x;
				const newY = e.clientY - dragStart.y;

				// Keep panel within viewport bounds
				const panel = panelRef.current;
				if (panel) {
					const rect = panel.getBoundingClientRect();
					const halfWidth = rect.width / 2;
					const halfHeight = rect.height / 2;

					// Calculate bounds from center
					const minX = -window.innerWidth / 2 + halfWidth;
					const maxX = window.innerWidth / 2 - halfWidth;
					const minY = -window.innerHeight / 2 + halfHeight;
					const maxY = window.innerHeight / 2 - halfHeight;

					setPosition({
						x: Math.max(minX, Math.min(maxX, newX)),
						y: Math.max(minY, Math.min(maxY, newY))
					});
				}
			}
		};

		const handleMouseUp = () => {
			setIsDragging(false);
		};

		if (isDragging) {
			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
		}

		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	}, [isDragging, dragStart]);

	return (
		<div
			ref={panelRef}
			className={`inspect-panel ${isTransparent ? 'transparent' : ''} ${isDragging ? 'dragging' : ''}`}
			style={{
				transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`
			}}
		>
			<div
				className="inspect-panel-header"
				onMouseDown={handleMouseDown}
				style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
			>
				<div className="inspect-panel-title">
					<svg width="16" height="16" viewBox="0 0 20 20" fill="none">
						<circle cx="10" cy="4" r="1.5" fill="currentColor" />
						<circle cx="10" cy="10" r="1.5" fill="currentColor" />
						<circle cx="10" cy="16" r="1.5" fill="currentColor" />
					</svg>
					<span>Properties</span>
				</div>
				<div className="inspect-panel-actions">
				<button
					className={`inspect-panel-toggle ${isTransparent ? 'active' : ''}`}
					onClick={() => setIsTransparent(!isTransparent)}
					aria-label="Toggle Transparency"
					title={isTransparent ? 'Make opaque' : 'Make transparent'}
				>
						<svg width="16" height="16" viewBox="0 0 20 20" fill="none">
							{isTransparent ? (
								// Eye off icon
								<>
									<path d="M3 10C3 10 6 4 10 4C14 4 17 10 17 10C17 10 14 16 10 16C6 16 3 10 3 10Z"
										stroke="currentColor" strokeWidth="1.5" fill="none"/>
									<circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
									<line x1="3" y1="17" x2="17" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
								</>
							) : (
								// Eye icon
								<>
									<path d="M3 10C3 10 6 4 10 4C14 4 17 10 17 10C17 10 14 16 10 16C6 16 3 10 3 10Z"
										stroke="currentColor" strokeWidth="1.5" fill="none"/>
									<circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
								</>
							)}
						</svg>
					</button>
					<button className="inspect-panel-close" onClick={onClose} aria-label="Close Properties Panel">
						<svg width="16" height="16" viewBox="0 0 20 20" fill="none">
							<path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
						</svg>
					</button>
				</div>
			</div>
			<div className="inspect-panel-content">
				{inspectedElement ? (
					<div className="inspect-panel-details">
						<ElementInfo
							element={inspectedElement}
							onOpenInEditor={onOpenInEditor}
						/>
						<StylesSection styles={inspectedElement.computedStyles} />
					</div>
				) : (
					<div className="inspect-panel-placeholder">
						<svg width="48" height="48" viewBox="0 0 20 20" fill="none" opacity="0.3">
							<circle cx="10" cy="4" r="1.5" fill="currentColor" />
							<circle cx="10" cy="10" r="1.5" fill="currentColor" />
							<circle cx="10" cy="16" r="1.5" fill="currentColor" />
						</svg>
						<p>{isInspectMode ? 'Hover over elements to inspect them' : 'Enable inspect mode to see element properties'}</p>
					</div>
				)}
			</div>
		</div>
	);
}
