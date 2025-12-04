/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sandbox Pipeline - Browser Client Example
 *
 * Demonstrates how to use the pipeline from browser code.
 */

import { ISandboxPipelineService } from '../common/sandboxPipeline/sandboxPipelineService.js';

/**
 * Example: Using the pipeline from browser code
 */
export async function exampleBrowserUsage(
	pipelineService: ISandboxPipelineService
) {
	// AI generates a React component
	const aiCode = `
import React, { useState } from 'react';

export default function Counter() {
	const [count, setCount] = useState(0);

	return (
		<div>
			<h1>Count: {count}</h1>
			<button onClick={() => setCount(count + 1)}>
				Increment
			</button>
		</div>
	);
}
	`;

	// Process the component
	// This call goes: Browser → IPC → Main Process → ESBuild → IPC → Browser
	const jobId = await pipelineService.processComponent({
		id: 'counter-component',
		source: 'ai',
		files: {
			'Counter.jsx': aiCode
		},
		dependencies: {
			'react': '19.0.0', // AI can specify any version!
			'react-dom': '19.0.0'
		}
	});

	console.log('Job queued:', jobId);

	// Wait for transformation to complete
	const result = await pipelineService.waitForCompletion(jobId);

	console.log('Transformation complete!');
	console.log('Framework:', result.framework);
	console.log('CDN URLs:', result.cdnUrls);
	console.log('Bundled code size:', result.metadata.size, 'bytes');
	console.log('Transform time:', result.metadata.transformTime, 'ms');

	// Now you can send result.bundledCode to an iframe!
	return result;
}

/**
 * Example: Polling job status
 */
export async function exampleJobStatusPolling(
	pipelineService: ISandboxPipelineService,
	jobId: string
) {
	const job = await pipelineService.getJobStatus(jobId);

	if (!job) {
		console.error('Job not found:', jobId);
		return;
	}

	console.log('Job status:', job.status);

	if (job.status === 'completed') {
		console.log('Result:', job.result);
	} else if (job.status === 'failed') {
		console.error('Error:', job.error);
	} else {
		console.log('Job is still processing...');
	}
}

/**
 * Example: Queue monitoring
 */
export async function exampleQueueMonitoring(
	pipelineService: ISandboxPipelineService
) {
	const status = await pipelineService.getQueueStatus();

	console.log('Queue Status:');
	console.log('- Queued:', status.queued);
	console.log('- Processing:', status.processing);
	console.log('- Completed:', status.completed);
	console.log('- Failed:', status.failed);
}
