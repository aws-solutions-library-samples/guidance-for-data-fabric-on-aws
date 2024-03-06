import { type CrawlerStateChangeEvent, DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT, EventBridgeEventBuilder, EventPublisher, DATA_ASSET_SPOKE_EVENT_SOURCE, DataAssetCrawlerCompletionEvent } from '@df/events';
import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { RequestPresigningArguments } from '@aws-sdk/types';
import { GlueClient, GetTagsCommand } from '@aws-sdk/client-glue';

export class GlueCrawlerEventProcessor {
	constructor(
		private log: BaseLogger,
		private glueClient: GlueClient,
		private eventBusName: string,
		private eventPublisher: EventPublisher,
		private s3Client: S3Client,
		private bucketName: string,
		private getSignedUrl: GetSignedUrl
	) {
	}


	// This event needs to move to the spoke app
	public async enrichmentEvent(event: CrawlerStateChangeEvent): Promise<void> {
		this.log.info(`GlueCrawlerEventProcessor > enrichmentEvent >in  event: ${JSON.stringify(event)}`);

		validateNotEmpty(event, 'Crawler enrichment event');


		//Get the Crawler tags
		const crawler = await this.glueClient.send(new GetTagsCommand({ ResourceArn:  `arn:aws:glue:${event.region}:${event.account}:crawler/${event.detail.crawlerName}`}));
		
		// provide profiling information from S3 objects 
		const signedUrl = await this.getSignedUrl(this.s3Client, new GetObjectCommand({ Bucket: this.bucketName, Key: crawler.Tags['profileLocation'] }), { expiresIn: 3600 });

		// We supply a minimum payload with job status and asset info
		const eventPayload: DataAssetCrawlerCompletionEvent = {
			dataAsset: {
				catalog: {
					accountId: event.account,
					assetName: crawler.Tags['assetName'],
					domainId: crawler.Tags['domainId'],
					projectId: crawler.Tags['projectId'],
					assetId: crawler.Tags['assetId'],
					environmentId: crawler.Tags['environmentId'],
					region: crawler.Tags['region']
				}
			},
			crawler: {
				requestId: crawler.Tags['requestId'],
				jobRunId: event.id,
				jobRunStatus: event.detail.state,
				jobStopTime: event.detail.stopTime.toString(),
				jobStartTime: event.detail.startTime.toString(),
				message: event.detail.message,
				profileLocation: `s3://${this.bucketName}/${crawler.Tags['profileLocation']}`,
				profileSignedUrl: signedUrl
			}
		}

		const publishEvent = new EventBridgeEventBuilder()
			.setEventBusName(this.eventBusName)
			.setSource(DATA_ASSET_SPOKE_EVENT_SOURCE)
			.setDetailType(DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT)
			.setDetail(eventPayload);

		await this.eventPublisher.publish(publishEvent);

		this.log.info(`GlueCrawlerEventProcessor > enrichmentEvent >exit`);
		return;
	}
}

export type GetSignedUrl = (client: S3Client, command: GetObjectCommand, options?: RequestPresigningArguments) => Promise<string>;
