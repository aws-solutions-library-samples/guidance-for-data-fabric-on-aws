import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../models.js';
import { CreateProfileJobCommand, CreateProfileJobCommandInput, StartJobRunCommand, type DataBrewClient } from '@aws-sdk/client-databrew';
import { ulid } from 'ulid';

export class ProfileJobTask {

	constructor(
		private log: BaseLogger,
		private dataBrewClient: DataBrewClient,
		private jobsBucket: string,
		private jobsBucketPrefix: string
	) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.info(`ProfileJobTask > process > in > event: ${JSON.stringify(event)}`);

		const profileCommand = await this.createProfilingJob(event);

		// Create the Job profile
		const res = await this.dataBrewClient.send(new CreateProfileJobCommand(profileCommand));

		// Run the Job if the job is on Demand
		await this.dataBrewClient.send(new StartJobRunCommand({ Name: res.Name }));
		// const eventPayload: DataAssetJobStartEvent = {
		// 	dataAsset: event.dataAsset,
		// 	job: {
		// 		assetId: event.dataAsset.requestId,
		// 		jobRunId: run.RunId,
		// 		jobRunStatus: 'Started'
		// 	}
		// }

		// const publishEvent = new EventBridgeEventBuilder()
		// 	.setEventBusName(this.eventBusName)
		// 	.setSource(DATA_ASSET_SPOKE_EVENT_SOURCE)
		// 	.setDetailType(DATA_ASSET_SPOKE_JOB_START_EVENT)
		// 	.setDetail(eventPayload);

		// await this.eventPublisher.publish(publishEvent);

		// await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken: event.execution.taskToken }));

		this.log.info(`ProfileJobTask > process > exit:`);

	}

	private async createProfilingJob(event: DataAssetTask): Promise<CreateProfileJobCommandInput> {

		const asset = event.dataAsset;
		// Use asset Id if it exists else no asset exists so use the requestId
		const id = (asset.catalog?.assetId) ? asset.catalog.assetId : asset.requestId

		const jobName = `${asset.workflow.name}-${id}-profile`;
		const outputKey = `${this.jobsBucketPrefix}/${asset.catalog.domainId}/${asset.catalog.projectId}/${id}`

		// Create Lineage event
		const lineageRunId = ulid().toLowerCase();
		// TODO @Willsia Construct the Lineage start event using the lineageRunId

		// Create default profile job
		const command: CreateProfileJobCommandInput = {
			Name: jobName,
			DatasetName: id,
			RoleArn: asset.workflow.roleArn,
			OutputLocation: {
				Bucket: this.jobsBucket,
				Key: outputKey
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
				executionArn: event.execution.executionArn,
				executionToken: event.execution.taskToken
			}
		}

		// TODO Construct the Lineage COMPLETE event using the lineageRunId

		this.log.info(`ProfileJobTask > createProfilingJob > command:${JSON.stringify(command)}`);

		return command;

	}

}
