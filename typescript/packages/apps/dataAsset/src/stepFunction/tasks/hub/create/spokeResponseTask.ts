import type { BaseLogger } from 'pino';
import type { DataAssetEvent } from '../../models.js';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
export class SpokeResponseTask {

	constructor(
		private log: BaseLogger,
		private sfnClient: SFNClient
	) {
	}

	public async process(event: DataAssetEvent): Promise<any> {
		this.log.info(`SpokeResponseTask > process > in > event: ${JSON.stringify(event)}`);
		
		// This task will wait for the spoke event with the specified 

		this.log.info(`SpokeResponseTask > process > exit`);
		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken: event.execution.taskToken }));

	}

}
