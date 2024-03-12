import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type { DataAssetTask } from '../../models.js';
import { type DataZoneClient, ListDataSourcesCommand, CreateDataSourceCommand, StartDataSourceRunCommand } from '@aws-sdk/client-datazone';
import { getConnectionType, getResourceArn } from '../../../../common/utils.js';

export class CreateDataSourceTask {

	constructor(
		private log: BaseLogger,
		private dzClient: DataZoneClient,
		private sfnClient: SFNClient
	) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.info(`CreateDataSourceTask > process > in > event: ${JSON.stringify(event)}`);

		const connectionType = getConnectionType(event.dataAsset.workflow);
		let dataSourceId = undefined; 
		// Check to see if data source exists
		const dataSources = await this.dzClient.send(new ListDataSourcesCommand({
			domainIdentifier: event.dataAsset.catalog.domainId,
			environmentIdentifier: event.dataAsset.catalog.environmentId,
			projectIdentifier: event.dataAsset.catalog.projectId,
			name: getResourceArn(event.dataAsset.workflow) //use the arn of the data source in order to reuse the same data source for different assets
		}));

		// Create Data source if it does not exists
		this.constructDataSourceFilter()
		if (!dataSources?.items[0] ){
			const dataSource = await this.dzClient.send(new CreateDataSourceCommand({
				domainIdentifier: event.dataAsset.catalog.domainId,
				environmentIdentifier: event.dataAsset.catalog.environmentId,
				projectIdentifier: event.dataAsset.catalog.projectId,
				name: getResourceArn(event.dataAsset.workflow),
				type: connectionType,
			}));

			dataSourceId= dataSource.id;
		} else {
			dataSourceId = dataSources?.items[0];
		}

		// Run data source

		const run = await this.dzClient.send(new StartDataSourceRunCommand({
			dataSourceIdentifier: dataSourceId,
			domainIdentifier: event.dataAsset.catalog.domainId,
			
		}))
		event.dataAsset['execution']['dataSourceRun'] = {
			id: run.id,
			startTime: run.startedAt.toDateString(),
			status: run.status
		}
		this.log.info(`CreateStartTask > process > exit`);
		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken: event.execution.taskToken }));

	}

	private constructDataSourceFilter(): void{

	}

}
