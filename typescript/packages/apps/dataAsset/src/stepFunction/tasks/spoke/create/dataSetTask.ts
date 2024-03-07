import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type { DataAssetTask } from '../../models.js';
import { CreateDatasetCommand, CreateDatasetCommandInput, DescribeDatasetCommand, type DataBrewClient } from '@aws-sdk/client-databrew';
import { extractObjectDetailsFromUri } from '../../../../common/s3Utils.js';
import { getConnectionType } from '../../../../common/utils.js';

export class DataSetTask {

	constructor(private log: BaseLogger,
		private sfnClient: SFNClient,
		private dataBrewClient: DataBrewClient
	) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.debug(`DataSetTask > process > in > event: ${JSON.stringify(event)}`);

		const id = (event.dataAsset?.catalog?.assetId) ? event.dataAsset.catalog.assetId : event.dataAsset.requestId;

		// Check if DataSet has been created for this asset before
		try{
			await this.dataBrewClient.send(new DescribeDatasetCommand({
				Name: id
			}));
		}catch (error){
			this.log.debug(`DataSetTask > process > in > event: ${JSON.stringify(error)}`);
			// Create the data set if none is found
			if((error as Error).name ==='ResourceNotFoundException'){
				const input = this.constructInputCommand(event);
				await this.dataBrewClient.send(new CreateDatasetCommand(input));
			}
		}
		
		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken: event.execution.taskToken }));

		this.log.debug(`DataSetTask > process > exit:`);

	}

	// TODO Edmund, you need to create a new data set for redshift here, 
	// once the data set is created the profileJobTask should be able to profile the redshift database
	// Recipe jobs for Redshift are another story, I havent played around with that cordinate with John to figure how it should work

	private constructInputCommand(event: DataAssetTask): CreateDatasetCommandInput {
		this.log.debug(`DataSetTask > constructInputCommand > in > event: ${JSON.stringify(event)}`);
		const connectionType = getConnectionType(event.dataAsset.workflow);

		// use asset id as the id if available
		const id = (event.dataAsset?.catalog?.assetId) ? event.dataAsset.catalog.assetId : event.dataAsset.requestId;
		let input: CreateDatasetCommandInput = {
			Name: id,
			Tags: {
				domainId: event.dataAsset.catalog.domainId,
				projectId: event.dataAsset.catalog.projectId,
				assetName: event.dataAsset.catalog.assetName,
				assetId: event.dataAsset.catalog.assetId,
				requestId: event.dataAsset.requestId
			},
			Format: event.dataAsset.workflow.dataset.format.toUpperCase(),
			Input: {}
		};

		switch (connectionType) {
			case 'dataLake':
				input.Input = {
					S3InputDefinition: extractObjectDetailsFromUri(event.dataAsset.workflow.dataset.connection.dataLake.s3.path)
				}
				break;
			case 'glue':
				const glue = event.dataAsset.workflow.dataset.connection.glue;
				input.Input = {
					DataCatalogInputDefinition: {
						CatalogId: glue.accountId,
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
