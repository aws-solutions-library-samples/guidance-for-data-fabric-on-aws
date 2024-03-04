import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type { DataAssetEvent } from './models.js';
import { CreateDatasetCommand, CreateDatasetCommandInput, type DataBrewClient } from '@aws-sdk/client-databrew';
import { extractObjectDetailsFromUri } from '../../common/s3Utils.js';
import { getConnectionType } from '../../common/utils.js';

export class DataSetTask {

	constructor(private log: BaseLogger,
		private sfnClient: SFNClient,
		private dataBrewClient: DataBrewClient
	) {
	}


	public async process(event: DataAssetEvent): Promise<any> {
		this.log.debug(`DataSetTask > process > in > event: ${JSON.stringify(event)}`);

		const input = this.constructInputCommand(event);

		await this.dataBrewClient.send(new CreateDatasetCommand(input));

		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken: event.execution.taskToken }));

		this.log.debug(`DataSetTask > process > exit:`);

	}

	private constructInputCommand(event:DataAssetEvent): CreateDatasetCommandInput{
		this.log.debug(`DataSetTask > constructInputCommand > in > event: ${JSON.stringify(event)}`);
		const connectionType = getConnectionType(event.dataAssetEvent.detail.workflow);

		let  input: CreateDatasetCommandInput = {
			Name: event.dataAssetEvent.detail.id,
			Tags:{
				domainId: event.dataAssetEvent.detail.catalog.domainId,
				projectId: event.dataAssetEvent.detail.catalog.projectId,
				assetName: event.dataAssetEvent.detail.catalog.assetName,
				assetId: event.dataAssetEvent.detail.catalog.assetId
			},
			Format: event.dataAssetEvent.detail.workflow.dataset.format.toUpperCase(),
			Input:{}
		};

		switch(connectionType){
			case 'dataLake':
				input.Input = {
					S3InputDefinition: extractObjectDetailsFromUri(event.dataAssetEvent.detail.workflow.dataset.connection.dataLake.s3.path)
				} 
				break;
			case 'glue':
				const glue = event.dataAssetEvent.detail.workflow.dataset.connection.glue;
				input.Input = {
					DataCatalogInputDefinition: {
						CatalogId:  glue.accountId,
						DatabaseName: glue.databaseName,
						TableName: glue.tableName
					}
				}
				break;

			// Support for other connection types is to be implemented
			default:
				this.log.error(`Connection Type: ${connectionType} is not supported !!!`)
				break;

		}
		this.log.debug(`DataSetTask > constructInputCommand > exit`);
		return input;

	}

}
