/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef, useEffect } from 'react';
import { SAMPLE_COMPONENTS, type SampleComponent } from '../../data/sampleComponents';

interface FloatingToolbarProps {
	tabName?: string;
	onAddComponent: () => void;
	onLoadSample: (sample: SampleComponent) => void;
	onLoadAll: () => void;
	onClearAll: () => void;
	onTidyUp: () => void;
	sandboxCount: number;
}

/**
 * FloatingToolbar - Top toolbar for canvas actions
 * Features: Add, Samples dropdown, Load All, Clear, Tidy Up
 */
export function FloatingToolbar({
	tabName = 'Canvas',
	onAddComponent,
	onLoadSample,
	onLoadAll,
	onClearAll,
	onTidyUp,
	sandboxCount
}: FloatingToolbarProps) {
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node) &&
				buttonRef.current &&
				!buttonRef.current.contains(event.target as Node)
			) {
				setIsDropdownOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const handleSampleClick = (sample: SampleComponent) => {
		onLoadSample(sample);
		setIsDropdownOpen(false);
	};

	return (
		<div className="floating-toolbar">
			<span style={{ fontSize: '12px', fontWeight: 600, marginRight: '8px' }}>{tabName}</span>
			<div className="separator" />

			{/* Add Component Button */}
			<button onClick={onAddComponent} title="Add empty component">
				+ Add
			</button>

			{/* Samples Dropdown */}
			<div className="dropdown-container">
				<button
					ref={buttonRef}
					className={isDropdownOpen ? 'active' : ''}
					onClick={() => setIsDropdownOpen(!isDropdownOpen)}
					title="Load sample components"
				>
					Samples {isDropdownOpen ? '▲' : '▼'}
				</button>

				{isDropdownOpen && (
					<div ref={dropdownRef} className="dropdown-menu">
						<div className="dropdown-header">Sample Components</div>
						{SAMPLE_COMPONENTS.map((sample) => (
							<button
								key={sample.id}
								className="dropdown-item"
								onClick={() => handleSampleClick(sample)}
							>
								<span className="sample-name">{sample.name}</span>
								<span className="sample-category">{sample.category}</span>
							</button>
						))}
						<div className="dropdown-divider" />
						<button className="dropdown-item load-all" onClick={() => { onLoadAll(); setIsDropdownOpen(false); }}>
							Load All Samples
						</button>
					</div>
				)}
			</div>

			<div className="separator" />

			{/* Clear All Button */}
			<button
				className="danger"
				onClick={onClearAll}
				disabled={sandboxCount === 0}
				title="Clear all components"
			>
				Clear
			</button>

			<div className="separator" />

			{/* Tidy Up Button */}
			<button
				className="secondary"
				onClick={onTidyUp}
				disabled={sandboxCount === 0}
				title="Tidy Up - Reorganize all to grid"
			>
				⊞ Tidy
			</button>
		</div>
	);
}
