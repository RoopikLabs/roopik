/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './StylesSection.css';

interface StylesSectionProps {
	styles: Record<string, string>;
}

export function StylesSection({ styles }: StylesSectionProps) {
	if (!styles || Object.keys(styles).length === 0) {
		return null;
	}

	return (
		<div className="styles-section">
			<div className="styles-section-title">
				Styles ({Object.keys(styles).length})
			</div>
			<div className="styles-list">
			{Object.entries(styles).map(([key, value]) => {
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
				}					return (
						<div key={key} className="style-item">
							<span className="style-property">{displayKey}</span>
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
