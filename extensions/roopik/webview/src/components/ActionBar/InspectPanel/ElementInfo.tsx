/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InspectedElement } from '../../../utils/inspectOverlay';
import './ElementInfo.css';

interface ElementInfoProps {
	element: InspectedElement;
	onOpenInEditor?: (file: string, line: number) => void;
}

export function ElementInfo({ element, onOpenInEditor }: ElementInfoProps) {
	return (
		<div className="element-info-section">
			<div className="element-info-title">Element</div>

		{/* Single row: Source | Component/Tag */}
		<div className="element-info-row">
			{/* Source file with open button */}
			{element.file && (
				<div className="element-source">
					<span className="element-filename">
						{element.file.split('/').pop()}
					</span>
					<button
						className="element-open-btn"
						onClick={() => {
							if (element.file && element.line && onOpenInEditor) {
								onOpenInEditor(element.file, element.line);
							}
						}}
						title="Open in editor"
					>
						<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
							<path d="M9 2L14 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
							<path d="M14 7H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
						</svg>
					</button>
				</div>
			)}

			{/* Component/Tag name */}
			<span className="element-name">
				{element.componentName !== element.tagName
					? `${element.componentName} (${element.tagName.toLowerCase()})`
					: element.tagName.toLowerCase()
				}
			</span>
		</div>

			{/* CSS Classes if available */}
			{element.className && element.className.trim() && (
				<div className="element-classes">
					<span className="element-classes-label">classes</span>
					<div className="element-classes-list">
						{element.className.trim().split(/\s+/).map((cls, idx) => (
							<span key={idx} className="element-class-badge">.{cls}</span>
						))}
					</div>
				</div>
			)}

			{/* Parent tree - Commented out for now, uncomment in future if needed */}
			{/*
			{element.parentContext && (
				<div className="element-tree">
					<span className="element-tree-label">tree</span>
					<span className="element-tree-path">
						{element.parentContext.split('|')[1] || element.parentContext}
					</span>
				</div>
			)}
			*/}
		</div>
	);
}
