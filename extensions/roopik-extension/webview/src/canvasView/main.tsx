/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CanvasView } from './CanvasView';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<CanvasView />
	</StrictMode>
);
