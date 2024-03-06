import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type { DataAssetTask } from '../../models.js';
import { DataZoneClient, GetDataSourceRunCommand } from '@aws-sdk/client-datazone';

export class CheckRunTask {

	constructor(
		private log: BaseLogger,
		private dzClient: DataZoneClient,
		private sfnClient: SFNClient,
	) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.info(`CheckRunTask > process > in > event: ${JSON.stringify(event)}`);

		 const run = await this.dzClient.send( new GetDataSourceRunCommand({
			domainIdentifier: event.dataAsset.catalog.domainId,
			identifier: event.dataAsset.execution.dataSourceRun.jobRunId
		}));

		event.dataAsset['execution']['dataSourceRun'] = {
			jobRunId: run.id,
			jobStartTime: run.startedAt.toDateString(),
			jobRunStatus: run.status,
			
		}
		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken: event.execution.taskToken }));

		this.log.info(`CheckRunTask > process > exit`);

	}

}
