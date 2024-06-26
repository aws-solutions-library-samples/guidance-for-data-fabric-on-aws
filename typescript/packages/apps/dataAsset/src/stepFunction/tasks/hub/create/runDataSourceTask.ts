import type { BaseLogger } from 'pino';
import { TaskType, type DataAssetTask } from '../../models.js';
import { StartDataSourceRunCommand } from '@aws-sdk/client-datazone';
import type { S3Utils } from '../../../../common/s3Utils.js';
import type { DataZoneUserAuthClientFactory } from '../../../../plugins/module.awilix.js';

export class RunDataSourceTask {

	constructor(
		private log: BaseLogger,
        private dataZoneClientFactory: DataZoneUserAuthClientFactory,
		private readonly s3Utils: S3Utils
	) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.info(`RunDataSourceTask > process > in > event: ${JSON.stringify(event)}`);


		let dataSourceId = event.dataAsset.execution.dataSourceCreation.id;

		// Run data source
		const dataZoneClient = await this.dataZoneClientFactory.create(event.dataAsset.idcUserId, event.dataAsset.catalog.domainId);
		const run = await dataZoneClient.send(new StartDataSourceRunCommand({
			dataSourceIdentifier: dataSourceId,
			domainIdentifier: event.dataAsset.catalog.domainId,
		}));


		event.dataAsset.execution['dataSourceRun'] = {
			id: run.id,
			status: run.status
		}


		// We are not able to use tags with data zone resources so we will use the runId instead to store the data
		await this.s3Utils.putTaskData(TaskType.RunDataSourceTask, run.id, event);

		this.log.info(`RunDataSourceTask > process > exit`);
	}

}
