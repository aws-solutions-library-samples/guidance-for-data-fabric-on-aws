import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../../models.js';
import { DataZoneClient, GetDataSourceCommand } from '@aws-sdk/client-datazone';

export class VerifyDataSourceTask {

	constructor(
		private log: BaseLogger,
		private dzClient: DataZoneClient,
	) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.info(`VerifyDataSourceTask > process > in > event: ${JSON.stringify(event)}`);

		const dataSource = await this.dzClient.send( new GetDataSourceCommand({
			domainIdentifier: event.dataAsset.catalog.domainId,
			identifier: event.dataAsset.execution.dataSourceCreation.id
		}));

		event.dataAsset.execution.dataSourceCreation.status =  dataSource.status;

		this.log.info(`VerifyDataSourceTask > process > exit`);
		return event;


		

	}

}
