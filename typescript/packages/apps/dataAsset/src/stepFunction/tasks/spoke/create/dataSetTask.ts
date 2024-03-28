import type { BaseLogger } from 'pino';
import { SendTaskSuccessCommand, SFNClient } from '@aws-sdk/client-sfn';
import type { DataAssetTask } from '../../models.js';
import { CreateDatasetCommand, CreateDatasetCommandInput, type DataBrewClient, DescribeDatasetCommand } from '@aws-sdk/client-databrew';
import { getConnectionType } from '../../../../common/utils.js';
import { S3Utils } from "../../../../common/s3Utils.js";
import { ConnectionTask } from './connectionTask.js';

export class DataSetTask {

	constructor(private log: BaseLogger,
		private sfnClient: SFNClient,
		private dataBrewClient: DataBrewClient,
		private s3Utils: S3Utils
	) {
	}


    public async process(event: DataAssetTask): Promise<any> {
        this.log.debug(`DataSetTask > process > in > event: ${JSON.stringify(event)}`);

        const id = (event.dataAsset?.catalog?.assetId) ? event.dataAsset.catalog.assetId : event.dataAsset.id;

		// Check if DataSet has been created for this asset before
		try {
			await this.dataBrewClient.send(new DescribeDatasetCommand({
				Name: `${id}-recipeDataSet`
			}));
		} catch (error) {
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

    private constructInputCommand(event: DataAssetTask): CreateDatasetCommandInput {
        this.log.debug(`DataSetTask > constructInputCommand > in > event: ${JSON.stringify(event)}`);
        const connectionType = getConnectionType(event.dataAsset.workflow);

		const id = (event.dataAsset?.catalog?.assetId) ? event.dataAsset.catalog.assetId : event.dataAsset.id;

		let input: CreateDatasetCommandInput = {
			Name: `${id}-recipeDataSet`,
			Tags: {
				domainId: event.dataAsset.catalog.domainId,
				projectId: event.dataAsset.catalog.projectId,
				assetName: event.dataAsset.catalog.assetName,
				assetId: event.dataAsset.catalog.assetId,
				id: event.dataAsset.id
			},
			Input: {}
		};

        switch (connectionType) {
			case 'dataLake':
				input.Input = {
					S3InputDefinition: S3Utils.extractObjectDetailsFromUri(event.dataAsset.workflow.dataset.connection.dataLake.s3.path)
                }
				input.Format = event.dataAsset.workflow.dataset.format.toUpperCase()
                break;
			case 'glue':
				const glue = event.dataAsset.workflow.dataset.connection.glue;
				input.Input = {
					DataCatalogInputDefinition: {
						CatalogId: glue.accountId,
						DatabaseName: glue.databaseName,
						TableName: glue.tableName,
					}
				}
				break;
			case 'redshift':
				const dataSetTempDirectory = this.s3Utils.getRecipeDataSetTempLocation(id, event.dataAsset.catalog.domainId, event.dataAsset.catalog.projectId);
				input.Input = {
					DatabaseInputDefinition: {
						GlueConnectionName: ConnectionTask.getConnectionName(event),
						DatabaseTableName: event.dataAsset.workflow.dataset.connection.redshift.databaseTableName, // Supply or generate
						// QueryString: event.dataAsset.workflow.dataset.connection.redshift.queryString, // Optional or table name
						TempDirectory: dataSetTempDirectory
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
