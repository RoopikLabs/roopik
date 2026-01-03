/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import './Toast.css';

export interface ToastProps {
	message: string;
	duration?: number;
	onClose: () => void;
}

export function Toast({ message, duration = 1000, onClose }: ToastProps) {
	const [isVisible, setIsVisible] = useState(true);

	useEffect(() => {
		const timer = setTimeout(() => {
			setIsVisible(false);
			setTimeout(onClose, 300); // Wait for fade out animation
		}, duration);

		return () => clearTimeout(timer);
	}, [duration, onClose]);

	return (
		<div className={`toast ${isVisible ? 'toast-visible' : 'toast-hidden'}`}>
			{message}
		</div>
	);
}
