import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type{ DataAssetTask } from '../../models.js';

export class RecipeJobTask {

	constructor(private log: BaseLogger,		
				private sfnClient: SFNClient) {
	}


	// John please add the the Transformer job creation and execution here
	public async process(event: DataAssetTask): Promise<any> {
		this.log.info(`RecipeJobTask > process > in > event: ${JSON.stringify(event)}`);

			await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken:event.execution.taskToken }));

			this.log.info(`RecipeJobTask > process > exit:`);
			
	}
}
