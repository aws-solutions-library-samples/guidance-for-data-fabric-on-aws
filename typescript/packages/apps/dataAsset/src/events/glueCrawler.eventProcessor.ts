import type { CrawlerStateChangeEvent } from '@df/events';
import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';
// import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
// import type { RequestPresigningArguments } from '@aws-sdk/types';
import { GlueClient, GetTagsCommand, ListCrawlsCommand } from '@aws-sdk/client-glue';
import { SendTaskSuccessCommand, type SFNClient } from '@aws-sdk/client-sfn';
import { GetParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';
import type { DataAssetTask } from '../stepFunction/tasks/models';
import { OpenLineageBuilder } from '@df/events';

export class GlueCrawlerEventProcessor {
	constructor(
		private log: BaseLogger,
		private glueClient: GlueClient,
		// private eventBusName: string,
		// private eventPublisher: EventPublisher,
		// private s3Client: S3Client,
		// private bucketName: string,
		private sfnClient: SFNClient,
		private ssmClient: SSMClient,
		// private getSignedUrl: GetSignedUrl
	) {
	}


	// This event needs to move to the spoke app
	public async completionEvent(event: CrawlerStateChangeEvent): Promise<void> {
		this.log.info(`GlueCrawlerEventProcessor > completionEvent >in  event: ${JSON.stringify(event)}`);

		validateNotEmpty(event, 'Crawler completion event');


		//Get the Crawler tags
		const crawler = await this.glueClient.send(new GetTagsCommand({ ResourceArn: `arn:aws:glue:${event.region}:${event.account}:crawler/${event.detail.crawlerName}` }));

		//Get the task payload
		const param = await this.ssmClient.send(new GetParameterCommand({
			Name: `/df/spoke/dataAsset/stateMachineExecution/create/${crawler.Tags['requestId']}`
		}));
		const taskOutput: DataAssetTask = JSON.parse(param.Parameter.Value);

		taskOutput.dataAsset['glueDeltaDetected'] = false;

		//Has there been a table update if so update the task output & lineage
		if (
			event.detail.tablesCreated > 0 || event.detail.partitionsCreated > 0
			|| event.detail.tablesUpdated > 0 || event.detail.partitionsUpdated > 0
			|| event.detail.tablesDeleted > 0 || event.detail.partitionsDeleted > 0
		) {
			taskOutput.dataAsset['glueDeltaDetected'] = true;

			// Construct the data lineage
			if (!taskOutput?.dataAsset.lineage) {
				taskOutput.dataAsset.lineage = [];
			}
			const openLineageBuilder = new OpenLineageBuilder();
            openLineageBuilder.setContext(taskOutput.dataAsset.catalog.domainId, taskOutput.dataAsset.catalog.domainId, taskOutput.dataAsset.execution.hubExecutionArn, ['TODO User'])
			taskOutput.dataAsset.lineage.push(openLineageBuilder.build());

			// Update the tableName
			taskOutput.dataAsset.execution.glueTableName = await this.getTableName(event.detail.crawlerName);
		}

		// Add crawler info to the payload
		if (!taskOutput.dataAsset?.execution) {
			taskOutput.dataAsset.execution = {}
		}

		taskOutput.dataAsset.execution.crawlerRun = {
			id: event.detail.crawlerName,
			status: event.detail.state,
			message: event.detail.message,
			stopTime: event.detail.completionDate
		}




		// provide the signed url for the complete event
		// const signedUrl = await this.getSignedUrl(this.s3Client, new GetObjectCommand({ Bucket: this.bucketName, Key: taskInput.dataAsset.profile.summary.location }), { expiresIn: 3600 });

		// We supply a minimum payload with job status and asset info
		// const eventPayload: DataAssetCrawlerCompletionEvent = {
		// 	dataAsset: {
		// 		catalog: {
		// 			accountId: event.account,
		// 			assetName: crawler.Tags['assetName'],
		// 			domainId: crawler.Tags['domainId'],
		// 			projectId: crawler.Tags['projectId'],
		// 			assetId: crawler.Tags['assetId'],
		// 			environmentId: crawler.Tags['environmentId'],
		// 			region: crawler.Tags['region']
		// 		}
		// 	},
		// 	crawler: {
		// 		requestId: crawler.Tags['requestId'],
		// 		jobRunId: event.id,
		// 		jobRunStatus: event.detail.state,
		// 		jobStopTime: event.detail.completionDate.toString(),
		// 		message: event.detail.message,
		// 		// profileLocation: `s3://${this.bucketName}/${crawler.Tags['profileLocation']}`,
		// 		// profileSignedUrl: signedUrl
		// 	}
		// }

		// const publishEvent = new EventBridgeEventBuilder()
		// 	.setEventBusName(this.eventBusName)
		// 	.setSource(DATA_ASSET_SPOKE_EVENT_SOURCE)
		// 	.setDetailType(DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT)
		// 	.setDetail(eventPayload);

		// await this.eventPublisher.publish(publishEvent);

		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(taskOutput), taskToken: taskOutput.execution.taskToken }));

		this.log.info(`GlueCrawlerEventProcessor > completionEvent >exit taskOutput:${JSON.stringify(taskOutput)}`);
		return;
	}

	private async getTableName(crawlerName: string): Promise<string> {
		this.log.debug(`GlueCrawlerEventProcessor > getTableName >in`);

		const crawlResults = await this.glueClient.send(new ListCrawlsCommand({
			CrawlerName: crawlerName,
			MaxResults: 1
		}));

		const summary = JSON.parse(crawlResults.Crawls[0].Summary);
		const details = JSON.parse(summary['TABLE']['ADD']);

		this.log.debug(`GlueCrawlerEventProcessor > getTableName >exit TableName:${details['Details']['names'][0]}`);
		return details['Details']['names'][0];
	}

}

// export type GetSignedUrl = (client: S3Client, command: GetObjectCommand, options?: RequestPresigningArguments) => Promise<string>;
