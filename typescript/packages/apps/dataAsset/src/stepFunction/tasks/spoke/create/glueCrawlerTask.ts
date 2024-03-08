import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../../models.js';
import { GlueClient, CreateCrawlerCommand, UpdateCrawlerCommand, GetCrawlerCommand, StartCrawlerCommand ,CreateCrawlerCommandInput, CrawlerTargets } from '@aws-sdk/client-glue';
import { ulid } from 'ulid';
import { PutParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';
import { ParameterType } from '@aws-sdk/client-databrew';


export class GlueCrawlerTask {
	constructor(private log: BaseLogger,
		private glueClient: GlueClient,
		private ssmClient: SSMClient,
		private glueDatabaseName: string
	) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.debug(`GlueCrawlerTask > process > in > event: ${JSON.stringify(event)}`);

		// Use assetId if it exists else no asset exists so use the requestId
		const id = (event.dataAsset.catalog?.assetId) ? event.dataAsset.catalog.assetId : event.dataAsset.requestId;
		const crawlerName = `${event.dataAsset.workflow.name}-${id}-crawler`;

		const command = await this.createCrawlerCommandInput(event);

		let res;
		try {
			res = await this.glueClient.send(new GetCrawlerCommand({ Name: crawlerName }));
			await this.glueClient.send(new UpdateCrawlerCommand(command));
		} catch (error) {
			this.log.debug(`GlueCrawlerTask > process > in > error: ${JSON.stringify(error)}`);
			// Create the Crawler if no crawler exists
			if ((error as Error).name === 'EntityNotFoundException') {
				res = await this.glueClient.send(new CreateCrawlerCommand(command));
			}
		}
		this.log.debug(`res: ${JSON.stringify(res)}`);

		await this.glueClient.send(new StartCrawlerCommand({
			Name: crawlerName
		}))

		// We store the task token in SSM parameter using the requestId for future retrieval
		this.ssmClient.send(new PutParameterCommand({
			Name: `/df/spoke/dataAsset/stateMachineExecution/create/${event.dataAsset.requestId}`,
			Value: JSON.stringify(event),
			Type: ParameterType.String,
			Overwrite: true
		}));

		this.log.debug(`GlueCrawlerTask > process > exit:`);
	}

	private async createCrawlerCommandInput(event: DataAssetTask): Promise<CreateCrawlerCommandInput> {

		const asset = event.dataAsset;
		// Use assetId if it exists else no asset exists so use the requestId
		const id = (asset.catalog?.assetId) ? asset.catalog.assetId : asset.requestId

		const crawlerName = `${asset.workflow.name}-${id}-crawler`;

		// Create Lineage event
		const lineageRunId = ulid().toLowerCase();
		console.log(lineageRunId);
		// Create default profile job
		const command: CreateCrawlerCommandInput = {
			Name: crawlerName,
			Role: asset.workflow.roleArn,
			DatabaseName: this.glueDatabaseName,
			Targets: this.getCrawlerTargets(event),
			TablePrefix: `df-${event.dataAsset.catalog.assetName}-${id}`,
			LakeFormationConfiguration: {
				UseLakeFormationCredentials: false
			},
			Tags: {
				...asset.workflow?.tags,
				// Default tags that are added for lineage and enrichment purposes
				domainId: event.dataAsset.catalog.domainId,
				projectId: event.dataAsset.catalog.projectId,
				assetName: event.dataAsset.catalog.assetName,
				assetId: event.dataAsset.catalog.assetId,
				requestId: event.dataAsset.requestId,
				LineageRunId: lineageRunId,
				executionArn: event.execution.executionArn
			}
		}

		this.log.info(`GlueCrawlerTask > createCrawler > command:${JSON.stringify(command)}`);

		return command;

	}

	private getCrawlerTargets(event: DataAssetTask): CrawlerTargets {
		const connection = event.dataAsset.workflow.dataset.connection;

		let targets = {};
		// Get the connection key
		// We only support a single target for now
		switch (Object.keys(connection)[0]) {
			case 'dataLake':
				targets = {
					S3Targets: [
						{
							Path: event.dataAsset.workflow.dataset.connection.dataLake.s3.path
						}
					]
				}
				break;
			case 'glue':

				break;
			default:
				break;
		}

		return targets;
	}

}
