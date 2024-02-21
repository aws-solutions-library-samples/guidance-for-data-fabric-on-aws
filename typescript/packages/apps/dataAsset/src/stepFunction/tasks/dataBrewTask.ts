import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type { DataAssetEvent } from './models.js';
import { CreateProfileJobCommand, CreateProfileJobCommandInput, type DataBrewClient } from '@aws-sdk/client-databrew';

export class DataBrewTask {

	constructor(
		private log: BaseLogger,		
				private sfnClient: SFNClient,
				private dataBrewClient: DataBrewClient,
				private jobsBucket: string,
				private jobsBucketPrefix: string
				) {
	}


	public async process(event: DataAssetEvent): Promise<any> {
		this.log.info(`DataBrewTask > process > in > event: ${JSON.stringify(event)}`);

		const profileCommand = await this.createProfilingJob(event);

		await this.dataBrewClient.send(new CreateProfileJobCommand(profileCommand));

		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken:event.execution.taskToken }));

		this.log.info(`DataBrewTask > process > exit:`);
			
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

	// private async createJobRole() {
	// 	// TODO this function has not yet been implemented needs further investigation current assumption is that roleArn will be provided as part of the request
	// }
}
