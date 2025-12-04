/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Multi-entry Vite configuration
 *
 * Supports multiple entry points for future UIs:
 * - canvasView: Infinite canvas for component building
 * - projectView: Future project preview UI
 * - settingsView: Future settings panel
 *
 * Each entry point builds to its own JS/CSS bundle
 */
export default defineConfig({
	plugins: [react()],
	build: {
		outDir: 'dist',
		emptyDirOnBuildStart: true,
		rollupOptions: {
			input: {
				canvasView: resolve(__dirname, 'canvasView.html'),
				// Future entry points:
				// projectView: resolve(__dirname, 'projectView.html'),
				// settingsView: resolve(__dirname, 'settingsView.html'),
			},
			output: {
				entryFileNames: 'assets/[name].js',
				chunkFileNames: 'assets/[name]-chunk.js',
				assetFileNames: 'assets/[name].[ext]'
			}
		}
	},
	server: {
		port: 3001,
		hmr: {
			host: 'localhost'
		}
	}
});
