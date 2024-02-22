import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type { DataAssetEvent } from './models.js';
import { CreateProfileJobCommand, CreateProfileJobCommandInput, StartJobRunCommand, type DataBrewClient } from '@aws-sdk/client-databrew';
import { DATA_ASSET_SPOKE_EVENT_SOURCE, DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT, EventBridgeEventBuilder, EventPublisher } from '@df/events';

export class JobTask {

	constructor(
		private log: BaseLogger,		
				private sfnClient: SFNClient,
				private dataBrewClient: DataBrewClient,
				private eventBusName: string,
				private eventPublisher:EventPublisher,
				private jobsBucket: string,
				private jobsBucketPrefix: string
				) {
	}


	public async process(event: DataAssetEvent): Promise<any> {
		this.log.info(`JobTask > process > in > event: ${JSON.stringify(event)}`);

		const profileCommand = await this.createProfilingJob(event);

		// Create the Job profile
		const res = await this.dataBrewClient.send(new CreateProfileJobCommand(profileCommand));

		// Run the Job if the job is on Demand
		// TODO scheduled jobs are yet to be implemented
		const run = await this.dataBrewClient.send(new StartJobRunCommand({ Name: res.Name }));
		
		const asset = event.dataAssetEvent.detail;
		asset['execution'] = {
			spokeStateMachineArn: event.execution.executionArn,
			jobRunId: run.RunId,
			jobRunStatus: 'Started'
		}

		const publishEvent = new EventBridgeEventBuilder()
            .setEventBusName(this.eventBusName)
            .setSource(DATA_ASSET_SPOKE_EVENT_SOURCE)
            .setDetailType(DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT)
            .setDetail(asset);

		await this.eventPublisher.publish(publishEvent)

		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken:event.execution.taskToken }));

		this.log.info(`JobTask > process > exit:`);
			
	}

	private async createProfilingJob(event: DataAssetEvent): Promise<CreateProfileJobCommandInput> {

		const asset = event.dataAssetEvent.detail;
		const jobName = `${asset.workflow.name}-${asset.id}-profile`;
		const outputKey = `${this.jobsBucketPrefix}/${asset.catalog.domainId}/${asset.catalog.projectId}/${asset.catalog.assetName}`

		
		// TODO allow overriding profiling config
		// TODO allow the use of recipes

		// Create default profile job
		const command:CreateProfileJobCommandInput = {
			Name: jobName,
			DatasetName: asset.id,
			RoleArn: asset.workflow.roleArn,
			OutputLocation: {
				Bucket: this.jobsBucket,
				Key: outputKey
			},
			Tags: {
				...asset.workflow?.tags,
				domainId: event.dataAssetEvent.detail.catalog.domainId,
				projectId: event.dataAssetEvent.detail.catalog.projectId,
				assetName: event.dataAssetEvent.detail.catalog.assetName,
				assetId: event.dataAssetEvent.detail.catalog.assetId
			}
					

		}

		return command;

	}
	
	// TODO this function has not yet been implemented needs further investigation current assumption is that roleArn will be provided as part of the request
	// private async createJobRole() {
	// 	
	// }
}
