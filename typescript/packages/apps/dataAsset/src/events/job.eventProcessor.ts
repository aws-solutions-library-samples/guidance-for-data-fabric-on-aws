import { type DataAssetJobStartEvent, type DataAssetJobCompletionEvent, type JobStateChangeEvent, DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT, EventBridgeEventBuilder, EventPublisher } from '@df/events';
import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';
import type { DataAssetService } from '../api/dataAsset/service';
import { DataBrewClient, DescribeJobCommand, DescribeJobRunCommand } from '@aws-sdk/client-databrew';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

export class JobEventProcessor {
	constructor(
		private log: BaseLogger,
		private dataAssetService: DataAssetService,
		private dataBrewClient: DataBrewClient,
		private eventBusName: string,
		private eventPublisher: EventPublisher,
		private s3Client: S3Client,
	) {
	}

	public async jobStartEvent(event: DataAssetJobStartEvent): Promise<void> {
		this.log.info(`JobEventProcessor > jobStartEvent > event: ${JSON.stringify(event)}`);

		validateNotEmpty(event, 'Job start event');

		const dataAsset = await this.dataAssetService.get(event.dataAsset.id);
		if( !dataAsset?.execution ){
			dataAsset['execution'] = {};
		}
		dataAsset.execution.jobRunId = event.job.jobRunId;
		dataAsset.execution.jobRunStatus = event.job.jobRunStatus;
		dataAsset.execution.jobStartTime = event.job.jobStartTime;
		await this.dataAssetService.update(dataAsset.id,dataAsset);
		this.log.info(`JobEventProcessor > jobStartEvent > exit  event: ${JSON.stringify(dataAsset)}`);
        return;
    }
		

	// This event needs to move to the spoke app
	public async jobEnrichmentEvent(event: JobStateChangeEvent): Promise<void> {
		this.log.info(`JobEventProcessor > jobEnrichmentEvent > event: ${JSON.stringify(event)}`);

		validateNotEmpty(event, 'Job enrichment event');

		// Get the relevant Job and tags to link it back to the Data Zone asset
		const job = await this.dataBrewClient.send(new DescribeJobCommand({Name: event.detail.jobName}));
		this.log.info(`JobEventProcessor > jobEnrichmentEvent > DescribeJobCommand job:${JSON.stringify(job)}`);

		//Get the Job startTime
		const run = await this.dataBrewClient.send(new DescribeJobRunCommand({RunId:event.detail.jobRunId, Name: event.detail.jobName}));
		this.log.info(`JobEventProcessor > jobEnrichmentEvent > GetJobRunCommand: ${JSON.stringify(run)}`);

		// Append profiling information from S3 objects 
		// TODO we will need to deal with multiple output files, need to figure out how to correctly target the profiling jobs
		await this.constructProfile(job.Outputs[0].Location.Bucket, run.Outputs[0].Location.Key);
		


		// We supply a minimum payload with job status and asset info
		const eventPayload : DataAssetJobCompletionEvent ={
			dataAsset:{
				catalog:{
					accountId: event.account,
					assetName: job.Tags['assetName'],
					domainId: job.Tags['domainId'],
					projectId: job.Tags['projectId'],
					assetId: job.Tags['assetId'],
					autoPublish:true

				}
			},
			job:{
				jobRunId: event.detail.jobRunId,
				jobRunStatus: event.detail.state,
				jobStopTime: run.CompletedOn.toString(),
				jobStartTime: run.ExecutionTime.toString(),
				message: event.detail.message

			}
		}

		const publishEvent = new EventBridgeEventBuilder()
            .setEventBusName(this.eventBusName)
            .setSource(DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT)
            .setDetailType(DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT)
            .setDetail(eventPayload);

		await this.eventPublisher.publish(publishEvent)
        return;
    }

	private async constructProfile(jobBucket:string, key:string  ){
		this.log.info(`JobEventProcessor > constructProfile > in jobBucket: ${jobBucket}, key: ${key}`);

		// Do nothing for now
		await this.s3Client.send(new GetObjectCommand({Bucket: jobBucket, Key:key}))
	}
	

}