/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef, useEffect } from 'react';

interface ColorPickerProps {
	currentColor: string;
	onColorChange: (color: string) => void;
}

// Standard professional color palette
const STANDARD_COLORS = [
	{ name: 'Midnight Black', value: '#000000' },
	{ name: 'Charcoal', value: '#1a1a1a' },
	{ name: 'Dark Slate', value: '#2d3748' },
	{ name: 'Navy Blue', value: '#1e293b' },
	{ name: 'Deep Purple', value: '#1e1b4b' },
	{ name: 'Dark Teal', value: '#134e4a' },
	{ name: 'Forest Green', value: '#14532d' },
	{ name: 'Burgundy', value: '#4c0519' },
];

export function ColorPicker({ currentColor, onColorChange }: ColorPickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const pickerRef = useRef<HTMLDivElement>(null);

	// Close picker when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [isOpen]);

	const handleColorSelect = (color: string) => {
		onColorChange(color);
		setIsOpen(false);
	};

	return (
		<div ref={pickerRef} style={{ position: 'relative' }}>
			{/* Color picker button */}
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="pattern-btn"
				title="Change background color"
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					gap: '4px',
					position: 'relative',
				}}
			>
				{/* Color swatch */}
				<div
					style={{
						width: '16px',
						height: '16px',
						borderRadius: '4px',
						backgroundColor: currentColor,
						border: '1px solid rgba(255, 255, 255, 0.3)',
						boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
					}}
				/>
			</button>

			{/* Color picker popup */}
			{isOpen && (
				<div
					style={{
						position: 'absolute',
						bottom: 'calc(100% + 8px)',
						right: '0',
						background: 'linear-gradient(135deg, rgba(40, 40, 45, 0.98) 0%, rgba(30, 30, 35, 0.98) 100%)',
						backdropFilter: 'blur(20px) saturate(180%)',
						WebkitBackdropFilter: 'blur(20px) saturate(180%)',
						border: '1px solid rgba(255, 255, 255, 0.1)',
						borderRadius: '12px',
						padding: '12px',
						minWidth: '200px',
						boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
						animation: 'color-picker-slide-up 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
						zIndex: 10000,
					}}
				>
					{/* Title */}
					<div
						style={{
							fontSize: '12px',
							fontWeight: 600,
							color: 'rgba(255, 255, 255, 0.7)',
							marginBottom: '8px',
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
						}}
					>
						Background Color
					</div>

					{/* Color swatches */}
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: '4px',
						}}
					>
						{STANDARD_COLORS.map((color) => (
							<button
								key={color.value}
								onClick={() => handleColorSelect(color.value)}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: '10px',
									padding: '8px 10px',
									background: currentColor === color.value
										? 'rgba(255, 255, 255, 0.12)'
										: 'transparent',
									border: currentColor === color.value
										? '1px solid rgba(255, 255, 255, 0.2)'
										: '1px solid transparent',
									borderRadius: '6px',
									cursor: 'pointer',
									transition: 'all 0.15s ease',
									width: '100%',
									textAlign: 'left',
								}}
								onMouseEnter={(e) => {
									if (currentColor !== color.value) {
										e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
										e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
									}
								}}
								onMouseLeave={(e) => {
									if (currentColor !== color.value) {
										e.currentTarget.style.background = 'transparent';
										e.currentTarget.style.borderColor = 'transparent';
									}
								}}
							>
								{/* Color swatch */}
								<div
									style={{
										width: '28px',
										height: '28px',
										borderRadius: '6px',
										backgroundColor: color.value,
										border: '2px solid rgba(255, 255, 255, 0.2)',
										boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
										flexShrink: 0,
									}}
								/>

								{/* Color name */}
								<span
									style={{
										fontSize: '13px',
										fontWeight: 500,
										color: currentColor === color.value
											? 'rgba(255, 255, 255, 0.95)'
											: 'rgba(255, 255, 255, 0.8)',
									}}
								>
									{color.name}
								</span>

								{/* Selected indicator */}
								{currentColor === color.value && (
									<svg
										width="16"
										height="16"
										viewBox="0 0 16 16"
										fill="none"
										style={{ marginLeft: 'auto' }}
									>
										<path
											d="M13 4L6 11L3 8"
											stroke="#4fc3f7"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								)}
							</button>
						))}
					</div>
				</div>
			)}

			<style>{`
				@keyframes color-picker-slide-up {
					from {
						opacity: 0;
						transform: translateY(10px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
			`}</style>
		</div>
	);
}
