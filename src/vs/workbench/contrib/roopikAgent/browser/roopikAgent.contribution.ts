/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IChatAgentService, IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentHistoryEntry } from '../../chat/common/chatAgents.js';
import { ChatAgentLocation, ChatModeKind } from '../../chat/common/constants.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IChatProgress } from '../../chat/common/chatService.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { CreateComponentTool, CreateComponentToolId } from './roopikTools.js';

// Define the Agent ID
export const ROOPIK_AGENT_ID = 'roopik.agent';

class RoopikAgentContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.registerAgent();
	}

	private registerAgent() {
		const agentData: IChatAgentData = {
			id: ROOPIK_AGENT_ID,
			name: 'roopik',
			extensionId: new ExtensionIdentifier('roopik.agent'),
			extensionVersion: '1.0.0',
			publisherDisplayName: 'RoopikLabs',
			extensionDisplayName: 'Roopik Agent',
			extensionPublisherId: 'roopik',
			isCore: true,
			locations: [ChatAgentLocation.Chat],
			metadata: {},
			slashCommands: [
				{
					name: 'generate',
					description: 'Generate a UI component',
				}
			],
			modes: [ChatModeKind.Ask, ChatModeKind.Agent],
			disambiguation: []
		};

		const agentImpl: IChatAgentImplementation = {
			invoke: async (request: IChatAgentRequest, progress: (parts: IChatProgress[]) => void, history: IChatAgentHistoryEntry[], token: CancellationToken) => {
				return this.handleRequest(request, progress, token);
			},
			provideFollowups: async () => {
				return [];
			}
		};

		this._register(this.chatAgentService.registerAgent(ROOPIK_AGENT_ID, agentData));
		this._register(this.chatAgentService.registerAgentImplementation(ROOPIK_AGENT_ID, agentImpl));
	}

	private async handleRequest(request: IChatAgentRequest, progress: (parts: IChatProgress[]) => void, token: CancellationToken): Promise<IChatAgentResult> {
		const message = request.message || '';
		const command = request.command;

		// MOCK BRAIN LOGIC
		if (command === 'generate' || message.includes('generate')) {
			progress([{
				kind: 'markdownContent',
				content: { value: 'I am generating the component for you...' }
			}]);

			// Instantiate the tool
			const tool = this.instantiationService.createInstance(CreateComponentTool);

			// Hardcoded "AI Thought"
			const filename = 'RoopikButton.tsx';
			const code = `import React from 'react';

export const RoopikButton = () => {
    return (
        <button style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
        }}>
            Roopik Button
        </button>
    );
};`;

			// Invoke the tool
			try {
				const result = await tool.invoke({
					callId: 'mock-call-id',
					toolId: CreateComponentToolId,
					parameters: { filename, code },
					context: undefined
				}, null as any, null as any, token);

				// Report success
				progress([{
					kind: 'markdownContent',
					content: { value: `✅ **Success!** I have created \`${filename}\`.\n\n${result.content[0].value}` }
				}]);

			} catch (err) {
				progress([{
					kind: 'markdownContent',
					content: { value: `❌ **Error:** Failed to create component. ${err}` }
				}]);
			}

			return { errorDetails: undefined };
		}

		// Default response
		progress([{
			kind: 'markdownContent',
			content: { value: 'Hello! I am **Roopik Agent**. Type `/generate` to create a component.' }
		}]);

		return { errorDetails: undefined };
	}
}// Register the contribution
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(RoopikAgentContribution, LifecyclePhase.Restored);
