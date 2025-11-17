/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef } from 'react';
import { SAMPLE_COMPONENTS } from '../data/sampleComponents';

interface FloatingToolbarProps {
	tabName?: string;
	onLoadSample?: (sampleIndex: number) => void;
}

// Icon mapping for component types
const getComponentIcon = (name: string): string => {
	if (name.toLowerCase().includes('button')) return '🔘';
	if (name.toLowerCase().includes('counter')) return '🔢';
	if (name.toLowerCase().includes('card')) return '🎨';
	if (name.toLowerCase().includes('login')) return '🔐';
	if (name.toLowerCase().includes('onboarding')) return '👋';
	return '📦';
};

export function FloatingToolbar({ tabName = 'Canvas', onLoadSample }: FloatingToolbarProps) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const [showLeftArrow, setShowLeftArrow] = useState(false);
	const [showRightArrow, setShowRightArrow] = useState(true);

	const handleScroll = () => {
		if (!scrollContainerRef.current) return;
		const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
		setShowLeftArrow(scrollLeft > 0);
		setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 5);
	};

	const scrollLeft = () => {
		if (scrollContainerRef.current) {
			scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
		}
	};

	const scrollRight = () => {
		if (scrollContainerRef.current) {
			scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
		}
	};

	return (
		<div className="toolbar">
			<div className="toolbar-section">
				<span className="tab-name">{tabName}</span>
			</div>
			{onLoadSample && (
				<div className="toolbar-section toolbar-samples">
					{showLeftArrow && (
						<button
							className="scroll-arrow scroll-arrow-left"
							onClick={scrollLeft}
							title="Scroll Left"
						>
							◀
						</button>
					)}
					<div
						ref={scrollContainerRef}
						onScroll={handleScroll}
						className="samples-scroll-container"
					>
						{SAMPLE_COMPONENTS.map((sample, index) => (
							<button
								key={sample.id}
								className="toolbar-button"
								onClick={() => onLoadSample(index)}
								title={`Load ${sample.name}`}
							>
								{getComponentIcon(sample.name)} {sample.name}
							</button>
						))}
					</div>
					{showRightArrow && (
						<button
							className="scroll-arrow scroll-arrow-right"
							onClick={scrollRight}
							title="Scroll Right"
						>
							▶
						</button>
					)}
				</div>
			)}
		</div>
	);
}
