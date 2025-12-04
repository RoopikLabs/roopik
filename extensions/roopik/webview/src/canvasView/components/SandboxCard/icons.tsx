/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

interface IconProps {
	size?: number;
	className?: string;
}

/** Six-dot drag handle icon */
export function DragIcon({ size = 14, className }: IconProps) {
	return (
		<svg
			className={className}
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
		>
			<circle cx="4" cy="4" r="1.5" fill="currentColor" />
			<circle cx="12" cy="4" r="1.5" fill="currentColor" />
			<circle cx="4" cy="8" r="1.5" fill="currentColor" />
			<circle cx="12" cy="8" r="1.5" fill="currentColor" />
			<circle cx="4" cy="12" r="1.5" fill="currentColor" />
			<circle cx="12" cy="12" r="1.5" fill="currentColor" />
		</svg>
	);
}

/** Expand/fullscreen icon with four corner arrows */
export function ExpandIcon({ size = 18 }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="rgba(255, 255, 255, 0.9)"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M2 6 L2 2 L6 2" />
			<path d="M10 2 L14 2 L14 6" />
			<path d="M14 10 L14 14 L10 14" />
			<path d="M6 14 L2 14 L2 10" />
		</svg>
	);
}

/** X/close icon */
export function CloseIcon({ size = 18 }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="rgba(255, 255, 255, 0.9)"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M4 4 L12 12" />
			<path d="M12 4 L4 12" />
		</svg>
	);
}
