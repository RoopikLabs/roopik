/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef, useEffect, useCallback } from 'react';
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
// Color Picker Icon SVG
// ============================================================

function ColorPickerIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<circle cx="13.5" cy="6.5" r="2.5" />
			<circle cx="17.5" cy="10.5" r="2.5" />
			<circle cx="8.5" cy="7.5" r="2.5" />
			<circle cx="6.5" cy="12.5" r="2.5" />
			<path d="M12 22c-4.97 0-9-2.24-9-5v-3.5C3 16.74 7.03 19 12 19s9-2.26 9-5.5V17c0 2.76-4.03 5-9 5z" />
			<path d="M12 14c-4.97 0-9-2.24-9-5s4.03-5 9-5 9 2.24 9 5-4.03 5-9 5z" />
		</svg>
	);
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
	const colorInputRef = useRef<HTMLInputElement>(null);

	useClickOutside(pickerRef, isOpen, () => setIsOpen(false));

	const handleColorSelect = (color: string) => {
		onColorChange(color);
		setIsOpen(false);
	};

	const handleCustomColorClick = useCallback(() => {
		colorInputRef.current?.click();
	}, []);

	const handleNativeColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		onColorChange(e.target.value);
	}, [onColorChange]);

	return (
		<div ref={pickerRef} className="color-picker">
			{/* Trigger button - shows color picker icon */}
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
					{/* Preset colors grid */}
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

					{/* Divider */}
					<div className="color-picker-divider" />

					{/* Custom color picker row */}
					<div className="color-picker-custom">
						<button
							className="custom-color-btn"
							onClick={handleCustomColorClick}
							title="Pick custom color"
						>
							<ColorPickerIcon />
							<span>Custom</span>
						</button>
						<input
							ref={colorInputRef}
							type="color"
							value={currentColor}
							onChange={handleNativeColorChange}
							className="native-color-input"
						/>
						<span className="current-color-hex">{currentColor.toUpperCase()}</span>
					</div>
				</div>
			)}
		</div>
	);
}
