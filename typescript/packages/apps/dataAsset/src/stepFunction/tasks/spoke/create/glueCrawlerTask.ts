import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../../models.js';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';


export class GlueCrawlerTask {
	constructor(private log: BaseLogger,
		private sfnClient: SFNClient,
	) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.debug(`GlueCrawlerTask > process > in > event: ${JSON.stringify(event)}`);

		// Place holder for glue crawler task


		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken: event.execution.taskToken }));

		this.log.debug(`GlueCrawlerTask > process > exit:`);
	}

}
