import type { BaseLogger } from 'pino';
// import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type { DataAssetTask } from '../../models.js';
import { type DataZoneClient, ListDataSourcesCommand, CreateDataSourceCommand, CreateDataSourceCommandInput, DataSourceConfigurationInput } from '@aws-sdk/client-datazone';
import { getConnectionType, getResourceArn } from '../../../../common/utils.js';
// import type { S3Utils } from '../../../../common/s3Utils.js';
import { SendTaskSuccessCommand, type SFNClient } from '@aws-sdk/client-sfn';
import { OpenLineageBuilder } from '@df/events';

export class CreateDataSourceTask {

	constructor(
		private log: BaseLogger,
		private dzClient: DataZoneClient,
		// private readonly s3Utils: S3Utils,
		private readonly sfnClient: SFNClient
	) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.info(`CreateDataSourceTask > process > in > event: ${JSON.stringify(event)}`);

		let dataSourceId = undefined;
		// Check to see if data source exists

		const resourceName = getResourceArn(event.dataAsset.workflow);

		const dataSources = await this.dzClient.send(new ListDataSourcesCommand({
			domainIdentifier: event.dataAsset.catalog.domainId,
			environmentIdentifier: event.dataAsset.catalog.environmentId,
			projectIdentifier: event.dataAsset.catalog.projectId,
			name: getResourceArn(event.dataAsset.workflow) //use the arn of the resource as the data source name in order to reuse the same data source for different assets
		}));

		// At the moment the ListDataSources API sometimes return a result eventhough the data source name is different.
		const existingDataSource = dataSources.items.find(o => o.name === resourceName);

		this.log.info(`CreateDataSourceTask > process > in > dataSources: ${JSON.stringify(dataSources)}`);

		// Create Data source if it does not exists
		if (!existingDataSource) {
			const params = await this.constructDataSourceCommand(event);
			const dataSource = await this.dzClient.send(new CreateDataSourceCommand(params));
			dataSourceId = dataSource.id;
		} else {
			dataSourceId = existingDataSource.dataSourceId
		}

		// We set the datasource id for future lookup 
		event.dataAsset.execution.dataSourceCreation = {
			id: dataSourceId
		}


		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken: event.execution.taskToken }));

		// We are not able tto use tags with data zone resources so we will use the runId instead
		// this.s3Utils.putTaskData(TaskType.CreateDataSourceTask,run.id, event);

		this.log.info(`CreateStartTask > process > exit`);
	}

	private async constructDataSourceCommand(event: DataAssetTask): Promise<CreateDataSourceCommandInput> {
		this.log.info(`CreateDataSourceTask > constructDataSourceCommand > in > event: ${JSON.stringify(event)}`);

		const connectionType = getConnectionType(event.dataAsset.workflow);
		const connection = event.dataAsset.workflow.dataset.connection;

		let configuration: DataSourceConfigurationInput;
		switch (connectionType) {
			case 'redshift':
				const redshiftDbType = (connection.redshift?.type) ? connection.redshift.type : 'serverless';

				let storageConf;
				// Construct the storage conf based on the database type
				if (redshiftDbType === 'serverless') {
					storageConf = {
						redshiftServerlessSource: {
							workgroupName: connection.redshift.workgroupName
						}
					}
				} else {

					storageConf = {
						redshiftClusterSource: {
							clusterName: connection.redshift.clusterName
						}
					}

				}
				configuration = {

					redshiftRunConfiguration: {
						redshiftCredentialConfiguration: {
							secretManagerArn: connection.redshift.secretArn
						},
						redshiftStorage: storageConf,
						relationalFilterConfigurations: [
							{
								databaseName: (connection.redshift.path).split('/')[0], // We use the first element of the path as the DB name
								schemaName: (connection.redshift.path).split('/')[1], // We use the second element of the path as the schema name
								filterExpressions: [{ type: 'INCLUDE', expression: (connection.redshift.path).split('/')[2] }]
							}
						]
					}
				}

				break;

			case 'glue':
				// TODO
				break;

			default:
				// we run the data source against our default glue database
				configuration = {
					glueRunConfiguration: {
						relationalFilterConfigurations: [
							{
								databaseName: event.dataAsset.execution.glueDatabaseName,
								filterExpressions: [{
									type: 'INCLUDE',
									expression: event.dataAsset.execution.glueTableName,
								}]
							}

						]
					}
				}

				break;
		}

		// Construct the Data Source based on the connection type
		const dataSource: CreateDataSourceCommandInput = {
			domainIdentifier: event.dataAsset.catalog.domainId,
			environmentIdentifier: event.dataAsset.catalog.environmentId,
			projectIdentifier: event.dataAsset.catalog.projectId,
			name: getResourceArn(event.dataAsset.workflow),
			// TODO: has to see what is the valid option
			type: connectionType === 'dataLake' ? 'GLUE' : connectionType,
			configuration,
			enableSetting: 'ENABLED',
			publishOnImport: event.dataAsset.catalog.autoPublish,
			// Construct the meta data fields
			assetFormsInput: [
				{
					formName: 'df_profile_form',
					typeIdentifier: 'df_profile_form',
					content: JSON.stringify({
						task_id: event.dataAsset.id,
						data_profile_location: event.dataAsset.execution.dataProfileJob.outputPath,
						data_quality_profile_location: event.dataAsset.execution?.dataQualityProfileJob?.outputPath,
						lineage_asset_name: event.dataAsset.catalog.assetName,
						lineage_asset_namespace: OpenLineageBuilder.getDomainNamespace({ name: event.dataAsset.catalog.domainName, id: event.dataAsset.catalog.domainId })
					})
				}
			]
		};
		this.log.info(`CreateDataSourceTask > constructDataSourceCommand > exit > dataSource: ${JSON.stringify(dataSource)}`);

		return dataSource;

	}

}
