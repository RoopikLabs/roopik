/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef, useEffect } from 'react';

export function useFPS() {
	const [fps, setFps] = useState(60);
	const lastFrameTime = useRef(0);
	const frameCount = useRef(0);

	useEffect(() => {
		lastFrameTime.current = Date.now();

		const updateFps = () => {
			frameCount.current++;
			const now = Date.now();
			const elapsed = now - lastFrameTime.current;

			if (elapsed >= 1000) {
				setFps(Math.round((frameCount.current * 1000) / elapsed));
				frameCount.current = 0;
				lastFrameTime.current = now;
			}

			requestAnimationFrame(updateFps);
		};

		const rafId = requestAnimationFrame(updateFps);
		return () => cancelAnimationFrame(rafId);
	}, []);

	return fps;
}
