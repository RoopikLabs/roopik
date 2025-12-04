/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef, useEffect } from 'react';
import { STANDARD_COLORS } from '../../../utils/colors';
import './ColorPicker.css';

// ============================================================
// Types
// ============================================================

interface ColorPickerProps {
	currentColor: string;
	onColorChange: (color: string) => void;
}

// ============================================================
// Hooks
// ============================================================

/**
 * Hook to handle click outside to close picker
 */
function useClickOutside(
	ref: React.RefObject<HTMLElement | null>,
	isOpen: boolean,
	onClose: () => void
) {
	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				onClose();
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isOpen, onClose]);
}

// ============================================================
// Sub-components
// ============================================================

interface ColorSwatchProps {
	color: string;
	name: string;
	isSelected: boolean;
	onClick: () => void;
}

function ColorSwatch({ color, name, isSelected, onClick }: ColorSwatchProps) {
	return (
		<button
			className={`color-swatch ${isSelected ? 'selected' : ''}`}
			onClick={onClick}
			title={name}
		>
			<div
				className="color-swatch-inner"
				style={{ backgroundColor: color }}
			/>
		</button>
	);
}

// ============================================================
// Main Component
// ============================================================

export function ColorPicker({ currentColor, onColorChange }: ColorPickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const pickerRef = useRef<HTMLDivElement>(null);

	useClickOutside(pickerRef, isOpen, () => setIsOpen(false));

	const handleColorSelect = (color: string) => {
		onColorChange(color);
		setIsOpen(false);
	};

	return (
		<div ref={pickerRef} className="color-picker">
			{/* Trigger button */}
			<button
				className="color-picker-trigger pattern-btn"
				onClick={() => setIsOpen(!isOpen)}
				title="Change background color"
			>
				<div
					className="color-picker-preview"
					style={{ backgroundColor: currentColor }}
				/>
			</button>

			{/* Dropdown popup */}
			{isOpen && (
				<div className="color-picker-popup">
					<div className="color-picker-grid">
						{STANDARD_COLORS.map((color) => (
							<ColorSwatch
								key={color.value}
								color={color.value}
								name={color.name}
								isSelected={currentColor === color.value}
								onClick={() => handleColorSelect(color.value)}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
