/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect } from 'react';
import './StylesSection.css';

interface StylesSectionProps {
	styles: Record<string, string>;
}

export function StylesSection({ styles }: StylesSectionProps) {
	// Track pinned properties (persists during session, resets on reload)
	const [pinnedProperties, setPinnedProperties] = useState<Set<string>>(new Set());
	const [copied, setCopied] = useState(false);

	if (!styles || Object.keys(styles).length === 0) {
		return null;
	}

	// Toggle pin state for a property
	const togglePin = (propertyKey: string) => {
		setPinnedProperties((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(propertyKey)) {
				newSet.delete(propertyKey);
			} else {
				newSet.add(propertyKey);
			}
			return newSet;
		});
	};

	// Auto-reset copied state after 0.5 second
	useEffect(() => {
		if (copied) {
			const timer = setTimeout(() => setCopied(false), 500);
			return () => clearTimeout(timer);
		}
	}, [copied]);

	// Copy all styles to clipboard
	const copyAllStyles = () => {
		const cssText = Object.entries(styles)
			.map(([key, value]) => {
				const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
				return `${cssKey}: ${value};`;
			})
			.join('\n');
		navigator.clipboard.writeText(cssText);
		setCopied(true);
	};

	// Sort styles: pinned first (in order they were pinned), then rest in original order
	const sortedEntries = Object.entries(styles).sort(([keyA], [keyB]) => {
		const aIsPinned = pinnedProperties.has(keyA);
		const bIsPinned = pinnedProperties.has(keyB);

		if (aIsPinned && !bIsPinned) return -1;
		if (!aIsPinned && bIsPinned) return 1;
		return 0; // Keep original order within each group
	});

	return (
		<div className="styles-section">
			<div className="styles-section-title">
				<span>
					Styles ({Object.keys(styles).length})
					{pinnedProperties.size > 0 && (
						<span className="pinned-count"> • {pinnedProperties.size} pinned</span>
					)}
				</span>
				<button
					className={`copy-styles-btn ${copied ? 'copied' : ''}`}
					onClick={copyAllStyles}
					title={copied ? 'Copied!' : 'Copy all styles'}
				>
					<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
						<path d="M4 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4z"/>
						<path d="M6 0h8a2 2 0 0 1 2 2v8a1 1 0 0 1-1 1h-1V4a2 2 0 0 0-2-2H6a1 1 0 0 1-1-1V1a1 1 0 0 1 1-1z"/>
					</svg>
				</button>
			</div>
			<div className="styles-list">
			{sortedEntries.map(([key, value]) => {
				// Special handling for color and background properties
				const isColorProp = key.includes('color') || key.includes('Color');
				// Both background and backgroundImage can contain gradients
				const isBackgroundProp = key === 'background' || key === 'backgroundImage';
				const isGradient = isBackgroundProp && String(value).includes('gradient');

				// Convert camelCase to kebab-case for display
				let displayKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
				// Show "background" instead of "background-image" for better CSS understanding
				if (displayKey === 'background-image') {
					displayKey = 'background';
				}

				const isPinned = pinnedProperties.has(key);

				return (
						<div
							key={key}
							className={`style-item ${isPinned ? 'pinned' : ''}`}
						>
							<span
								className="style-property"
								onClick={() => togglePin(key)}
								title={isPinned ? 'Click to unpin' : 'Click to pin to top'}
							>
								{displayKey}
							</span>
							{isColorProp && !isGradient ? (
								<div className="style-value">
									<span
										className="style-color-swatch"
										style={{ backgroundColor: String(value) }}
									/>
									<span className="style-text">{String(value)}</span>
								</div>
							) : isGradient ? (
								<div className="style-value">
									<span
										className="style-color-swatch"
										style={{ background: String(value) }}
									/>
									<span className="style-text">
										{String(value).length > 50 ? String(value).substring(0, 50) + '...' : String(value)}
									</span>
								</div>
							) : (
								<span className="style-value style-text">
									{String(value)}
								</span>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
