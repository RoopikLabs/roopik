/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef } from 'react';
import { SAMPLE_COMPONENTS } from '../../../data/sampleComponents';
import '../../styles/floatingToolbar.css';

// ============================================================
// Types
// ============================================================

export interface FloatingToolbarProps {
	tabName?: string;
	onLoadSample?: (sampleIndex: number) => void;
}

// ============================================================
// Constants
// ============================================================

const SCROLL_AMOUNT = 200;

/** Map component names to emoji icons */
const COMPONENT_ICONS: Record<string, string> = {
	button: '🔘',
	counter: '🔢',
	card: '🎨',
	login: '🔐',
	onboarding: '👋',
};

function getComponentIcon(name: string): string {
	const lowerName = name.toLowerCase();
	for (const [key, icon] of Object.entries(COMPONENT_ICONS)) {
		if (lowerName.includes(key)) return icon;
	}
	return '📦';
}

// ============================================================
// Hooks
// ============================================================

/**
 * Hook to manage horizontal scroll state and navigation
 */
function useHorizontalScroll() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [showLeftArrow, setShowLeftArrow] = useState(false);
	const [showRightArrow, setShowRightArrow] = useState(true);

	const updateArrowVisibility = () => {
		const el = scrollRef.current;
		if (!el) return;

		const { scrollLeft, scrollWidth, clientWidth } = el;
		setShowLeftArrow(scrollLeft > 0);
		setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 5);
	};

	const scrollLeft = () => {
		scrollRef.current?.scrollBy({ left: -SCROLL_AMOUNT, behavior: 'smooth' });
	};

	const scrollRight = () => {
		scrollRef.current?.scrollBy({ left: SCROLL_AMOUNT, behavior: 'smooth' });
	};

	return {
		scrollRef,
		showLeftArrow,
		showRightArrow,
		onScroll: updateArrowVisibility,
		scrollLeft,
		scrollRight,
	};
}

// ============================================================
// Sub-components
// ============================================================

interface ScrollArrowProps {
	direction: 'left' | 'right';
	onClick: () => void;
}

function ScrollArrow({ direction, onClick }: ScrollArrowProps) {
	return (
		<button
			className={`scroll-arrow scroll-arrow-${direction}`}
			onClick={onClick}
			title={`Scroll ${direction === 'left' ? 'Left' : 'Right'}`}
		>
			{direction === 'left' ? '◀' : '▶'}
		</button>
	);
}

interface SampleButtonProps {
	name: string;
	onClick: () => void;
}

function SampleButton({ name, onClick }: SampleButtonProps) {
	return (
		<button
			className="toolbar-button"
			onClick={onClick}
			title={`Load ${name}`}
		>
			{getComponentIcon(name)} {name}
		</button>
	);
}

// ============================================================
// Main Component
// ============================================================

export function FloatingToolbar({
	tabName = 'Canvas',
	onLoadSample,
}: FloatingToolbarProps) {
	const {
		scrollRef,
		showLeftArrow,
		showRightArrow,
		onScroll,
		scrollLeft,
		scrollRight,
	} = useHorizontalScroll();

	return (
		<div className="toolbar">
			{/* Tab Name */}
			<div className="toolbar-section">
				<span className="tab-name">{tabName}</span>
			</div>

			{/* Sample Components (only if handler provided) */}
			{onLoadSample && (
				<div className="toolbar-section toolbar-samples">
					{showLeftArrow && (
						<ScrollArrow direction="left" onClick={scrollLeft} />
					)}

					<div
						ref={scrollRef}
						onScroll={onScroll}
						className="samples-scroll-container"
					>
						{SAMPLE_COMPONENTS.map((sample, index) => (
							<SampleButton
								key={sample.id}
								name={sample.name}
								onClick={() => onLoadSample(index)}
							/>
						))}
					</div>

					{showRightArrow && (
						<ScrollArrow direction="right" onClick={scrollRight} />
					)}
				</div>
			)}
		</div>
	);
}
