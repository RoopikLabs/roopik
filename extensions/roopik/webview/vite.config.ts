/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
	plugins: [react()],
	build: {
		outDir: 'build',
		rollupOptions: {
			input: {
				componentView: resolve(__dirname, 'componentView.html'),
				// projectView: resolve(__dirname, 'projectView.html')
			},
			output: {
				entryFileNames: 'assets/[name].js',
				chunkFileNames: 'assets/[name].js',
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
