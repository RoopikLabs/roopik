/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useRef, useEffect } from 'react';

export function useFPS() {
	const [fps, setFps] = useState(60);
	const lastFrameTime = useRef(0);
	const frameCount = useRef(0);
	const rafIdRef = useRef<number>(0);
	const isActiveRef = useRef(true);

	useEffect(() => {
		lastFrameTime.current = Date.now();
		isActiveRef.current = true;

		const updateFps = () => {
			// Stop if component unmounted
			if (!isActiveRef.current) return;

			frameCount.current++;
			const now = Date.now();
			const elapsed = now - lastFrameTime.current;

			if (elapsed >= 1000) {
				setFps(Math.round((frameCount.current * 1000) / elapsed));
				frameCount.current = 0;
				lastFrameTime.current = now;
			}

			// Schedule next frame and store the ID
			rafIdRef.current = requestAnimationFrame(updateFps);
		};

		// Start the loop
		rafIdRef.current = requestAnimationFrame(updateFps);

		// Cleanup: stop the loop and cancel any pending frame
		return () => {
			isActiveRef.current = false;
			cancelAnimationFrame(rafIdRef.current);
		};
	}, []);

	return fps;
}
