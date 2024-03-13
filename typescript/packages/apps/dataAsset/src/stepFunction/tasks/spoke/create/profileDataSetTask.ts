import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type { DataAssetTask } from '../../models.js';
import { CreateDatasetCommand, CreateDatasetCommandInput, DescribeDatasetCommand, type DataBrewClient } from '@aws-sdk/client-databrew';

export class ProfileDataSetTask {

	constructor(private log: BaseLogger,
		private sfnClient: SFNClient,
		private dataBrewClient: DataBrewClient,
		private GlueDbName: string
	) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.debug(`ProfileDataSetTask > process > in > event: ${JSON.stringify(event)}`);

		const id = (event.dataAsset?.catalog?.assetId) ? event.dataAsset.catalog.assetId : event.dataAsset.requestId;

		// Check if DataSet has been created for this asset before
		try{
			this.log.debug(`ProfileDataSetTask > process > before DescribeDatasetCommand`);
			await this.dataBrewClient.send(new DescribeDatasetCommand({
				Name: id
			}));
		}catch (error){
			this.log.debug(`ProfileDataSetTask > process > in > event: ${JSON.stringify(error)}`);
			// Create the data set if none is found
			if((error as Error).name ==='ResourceNotFoundException'){
				const input = this.constructInputCommand(event);
				this.log.debug(`ProfileDataSetTask > process > before CreateDatasetCommand`);
				await this.dataBrewClient.send(new CreateDatasetCommand(input));
			}
		}
		
		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken: event.execution.taskToken }));

		this.log.debug(`ProfileDataSetTask > process > exit:`);

	}

	
	private constructInputCommand(event: DataAssetTask): CreateDatasetCommandInput {
		this.log.debug(`ProfileDataSetTask > constructInputCommand > in > event: ${JSON.stringify(event)}`);

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
			Input: { 
				DataCatalogInputDefinition: {
				// CatalogId: event.dataAsset.catalog.accountId,
				DatabaseName: this.GlueDbName,
				TableName: event.dataAsset.execution.glueTableName
			}}
		};

		this.log.debug(`ProfileDataSetTask > constructInputCommand > exit`);
		return input;

	}

}
