/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef, useEffect } from 'react';
import { STANDARD_COLORS } from '../utils/colors';

interface ColorPickerProps {
	currentColor: string;
	onColorChange: (color: string) => void;
}export function ColorPicker({ currentColor, onColorChange }: ColorPickerProps) {
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
						borderRadius: '8px',
						padding: '8px',
						boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
						animation: 'color-picker-slide-up 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
						zIndex: 10000,
					}}
				>
					{/* Color swatches grid */}
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(5, 1fr)',
							gap: '6px',
						}}
					>
						{STANDARD_COLORS.map((color) => (
							<button
								key={color.value}
								onClick={() => handleColorSelect(color.value)}
								title={color.name}
								style={{
									padding: '0',
									background: 'transparent',
									border: currentColor === color.value
										? '2px solid #4fc3f7'
										: '2px solid transparent',
									borderRadius: '6px',
									cursor: 'pointer',
									transition: 'all 0.15s ease',
									position: 'relative',
								}}
								onMouseEnter={(e) => {
									if (currentColor !== color.value) {
										e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
									}
								}}
								onMouseLeave={(e) => {
									if (currentColor !== color.value) {
										e.currentTarget.style.borderColor = 'transparent';
									}
								}}
							>
								{/* Color swatch */}
								<div
									style={{
										width: '24px',
										height: '24px',
										borderRadius: '4px',
										backgroundColor: color.value,
										boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
									}}
								/>
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
