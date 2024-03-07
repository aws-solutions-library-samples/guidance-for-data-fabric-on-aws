import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type{ DataAssetEvent } from '../../models.js';

export class StartTask {

	constructor(private log: BaseLogger,		
				private sfnClient: SFNClient) {
	}

	// This step just normalizes the event
	public async process(event: DataAssetEvent): Promise<any> {
		this.log.info(`StartTask > process > in > event: ${JSON.stringify(event)}`);
		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken:event.execution.taskToken }));
		this.log.info(`StartTask > process > exit:`);
			
	}
}
