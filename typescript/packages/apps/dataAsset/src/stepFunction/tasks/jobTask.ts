import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type { DataAssetEvent } from './models.js';
import { CreateProfileJobCommand, CreateProfileJobCommandInput, StartJobRunCommand, type DataBrewClient } from '@aws-sdk/client-databrew';
import { DATA_ASSET_SPOKE_EVENT_SOURCE, DATA_ASSET_SPOKE_JOB_START_EVENT, DataAssetJobStartEvent, EventBridgeEventBuilder, EventPublisher } from '@df/events';

export class JobTask {

	constructor(
		private log: BaseLogger,
		private sfnClient: SFNClient,
		private dataBrewClient: DataBrewClient,
		private eventBusName: string,
		private eventPublisher: EventPublisher,
		private jobsBucket: string,
		private jobsBucketPrefix: string
	) {
	}


	public async process(event: DataAssetEvent): Promise<any> {
		this.log.info(`JobTask > process > in > event: ${JSON.stringify(event)}`);

		const profileCommand = await this.createProfilingJob(event);

		// Create the Job profile
		const res = await this.dataBrewClient.send(new CreateProfileJobCommand(profileCommand));

		// TODO scheduled jobs are yet to be implemented
		
		// Run the Job if the job is on Demand
		const run = await this.dataBrewClient.send(new StartJobRunCommand({ Name: res.Name }));
		const eventPayload: DataAssetJobStartEvent = {
			dataAsset: event.dataAssetEvent.detail,
			job: {
				assetId: event.dataAssetEvent.detail.id,
				jobRunId: run.RunId,
				jobRunStatus: 'Started'
			}
		}

		const publishEvent = new EventBridgeEventBuilder()
			.setEventBusName(this.eventBusName)
			.setSource(DATA_ASSET_SPOKE_EVENT_SOURCE)
			.setDetailType(DATA_ASSET_SPOKE_JOB_START_EVENT)
			.setDetail(eventPayload);

		await this.eventPublisher.publish(publishEvent)

		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken: event.execution.taskToken }));

		this.log.info(`JobTask > process > exit:`);

	}

	private async createProfilingJob(event: DataAssetEvent): Promise<CreateProfileJobCommandInput> {

		const asset = event.dataAssetEvent.detail;
		const jobName = `${asset.workflow.name}-${asset.id}-profile`;
		const outputKey = `${this.jobsBucketPrefix}/${asset.catalog.domainId}/${asset.catalog.projectId}/${asset.id}`

		// TODO allow overriding profiling config
		// TODO allow the use of recipes

		// Create default profile job
		const command: CreateProfileJobCommandInput = {
			Name: jobName,
			DatasetName: asset.id,
			RoleArn: asset.workflow.roleArn,
			OutputLocation: {
				Bucket: this.jobsBucket,
				Key: outputKey
			},
			Tags: {
				...asset.workflow?.tags,
				// Default tags that are added for lineage and enrichment purposes
				domainId: event.dataAssetEvent.detail.catalog.domainId,
				projectId: event.dataAssetEvent.detail.catalog.projectId,
				assetName: event.dataAssetEvent.detail.catalog.assetName,
				assetId: event.dataAssetEvent.detail.id
			}
		}

		this.log.info(`JobTask > createProfilingJob > command:${JSON.stringify(command)}`);

		return command;

	}

}
