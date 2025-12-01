/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sandbox Pipeline Usage Examples
 *
 * This file demonstrates how to use the sandbox pipeline service.
 */

import { SandboxPipelineService, ComponentInput } from './index.js';

/**
 * Example 1: Process a simple React component from AI
 */
async function example1_AIGeneratedComponent() {
	const pipeline = new SandboxPipelineService();

	// AI generates this code
	const aiCode = `
import React from 'react';

export default function Button() {
	return (
		<button style={{ padding: '10px 20px', background: '#007acc', color: 'white' }}>
			Click me
		</button>
	);
}
`;

	// Process the component
	const jobId = await pipeline.processComponent({
		id: 'button-123',
		source: 'ai',
		files: new Map([
			['Button.jsx', aiCode]
		])
	});

	console.log('Job queued:', jobId);

	// Wait for completion
	const result = await pipeline.waitForCompletion(jobId);

	console.log('Transformation completed!');
	console.log('Framework:', result.framework);
	console.log('CDN URLs:', result.cdnUrls);
	console.log('Code size:', result.metadata.size, 'bytes');
	console.log('Transform time:', result.metadata.transformTime, 'ms');
	console.log('Bundled code:', result.bundledCode);

	pipeline.dispose();
}

/**
 * Example 2: Process a multi-file Vue component
 */
async function example2_MultiFileComponent() {
	const pipeline = new SandboxPipelineService();

	const vueCode = `
<template>
	<div class="header">
		<h1>{{ title }}</h1>
	</div>
</template>

<script setup>
import { ref } from 'vue';
const title = ref('My Header');
</script>

<style src="./Header.css"></style>
`;

	const cssCode = `
.header {
	background: #333;
	color: white;
	padding: 20px;
}
`;

	// Process multi-file component
	const jobId = await pipeline.processComponent({
		id: 'header-456',
		source: 'user',
		framework: 'vue', // Explicitly specify framework
		files: new Map([
			['Header.vue', vueCode],
			['Header.css', cssCode]
		]),
		entryFile: 'Header.vue'
	});

	const result = await pipeline.waitForCompletion(jobId);
	console.log('Multi-file component processed:', result);

	pipeline.dispose();
}

/**
 * Example 3: Process with priority
 */
async function example3_PriorityProcessing() {
	const pipeline = new SandboxPipelineService();

	// Queue multiple jobs with different priorities
	const lowPriorityJob = await pipeline.processComponent({
		id: 'comp-1',
		source: 'ai',
		priority: 'low',
		files: new Map([['Comp1.jsx', 'export default () => <div>Low</div>']])
	});

	const highPriorityJob = await pipeline.processComponent({
		id: 'comp-2',
		source: 'user',
		priority: 'high', // This will be processed first!
		files: new Map([['Comp2.jsx', 'export default () => <div>High</div>']])
	});

	const normalPriorityJob = await pipeline.processComponent({
		id: 'comp-3',
		source: 'ai',
		priority: 'normal',
		files: new Map([['Comp3.jsx', 'export default () => <div>Normal</div>']])
	});

	// Check queue status
	const status = pipeline.getQueueStatus();
	console.log('Queue status:', status);

	// Wait for all
	await Promise.all([
		pipeline.waitForCompletion(lowPriorityJob),
		pipeline.waitForCompletion(highPriorityJob),
		pipeline.waitForCompletion(normalPriorityJob)
	]);

	console.log('All jobs completed!');

	pipeline.dispose();
}

/**
 * Example 4: Listen to events
 */
async function example4_EventListening() {
	const pipeline = new SandboxPipelineService();

	// Listen to events
	pipeline.onJobQueued(job => {
		console.log('Job queued:', job.id);
	});

	pipeline.onJobStarted(job => {
		console.log('Job started:', job.id);
	});

	pipeline.onJobCompleted(job => {
		console.log('Job completed:', job.id, 'in', job.result?.metadata.transformTime, 'ms');
	});

	pipeline.onJobFailed(job => {
		console.error('Job failed:', job.id, job.error);
	});

	// Process a component
	const jobId = await pipeline.processComponent({
		id: 'test-789',
		source: 'ai',
		files: new Map([['Test.jsx', 'export default () => <div>Test</div>']])
	});

	await pipeline.waitForCompletion(jobId);

	pipeline.dispose();
}

/**
 * Example 5: Validation before processing
 */
async function example5_Validation() {
	const pipeline = new SandboxPipelineService();

	const input: ComponentInput = {
		id: 'invalid-comp',
		source: 'ai',
		files: new Map() // Empty files - invalid!
	};

	// Validate before processing
	const validation = pipeline.validateComponent(input);

	if (!validation.valid) {
		console.error('Validation failed:', validation.errors);
		return;
	}

	// Process if valid
	const jobId = await pipeline.processComponent(input);
	await pipeline.waitForCompletion(jobId);

	pipeline.dispose();
}

/**
 * Example 6: Cancel a job
 */
async function example6_CancelJob() {
	const pipeline = new SandboxPipelineService();

	// Queue a job
	const jobId = await pipeline.processComponent({
		id: 'cancel-test',
		source: 'ai',
		files: new Map([['Test.jsx', 'export default () => <div>Test</div>']])
	});

	// Cancel it immediately
	const cancelled = pipeline.cancelJob(jobId);
	console.log('Job cancelled:', cancelled);

	const job = pipeline.getJobStatus(jobId);
	console.log('Job status:', job?.status); // Should be 'failed'

	pipeline.dispose();
}

// Export examples for testing
export {
	example1_AIGeneratedComponent,
	example2_MultiFileComponent,
	example3_PriorityProcessing,
	example4_EventListening,
	example5_Validation,
	example6_CancelJob
};
