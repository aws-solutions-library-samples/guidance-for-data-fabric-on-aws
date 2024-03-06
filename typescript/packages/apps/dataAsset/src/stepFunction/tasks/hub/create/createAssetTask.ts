import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type { DataAssetEvent } from '../../models.js';

export class CreateAssetTask {

	constructor(
		private log: BaseLogger,
		private sfnClient: SFNClient,
	) {
	}


	public async process(event: DataAssetEvent): Promise<any> {
		this.log.info(`CreateAssetTask > process > in > event: ${JSON.stringify(event)}`);

		// Create Asset place holder

		this.log.info(`CreateAssetTask > process > exit`);
		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken: event.execution.taskToken }));

	}

}
