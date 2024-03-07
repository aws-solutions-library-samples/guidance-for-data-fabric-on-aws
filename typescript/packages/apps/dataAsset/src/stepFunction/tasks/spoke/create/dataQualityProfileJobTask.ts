import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type{ DataAssetTask } from '../../models.js';

export class DataQualityProfileJobTask {

	constructor(private log: BaseLogger,		
				private sfnClient: SFNClient) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.info(`DataQualityProfileJobTask > process > in > event: ${JSON.stringify(event)}`);

			await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken:event.execution.taskToken }));

			this.log.info(`DataQualityProfileJobTask > process > exit:`);
			
	}
}
