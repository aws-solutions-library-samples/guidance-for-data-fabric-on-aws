import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../../models.js';
import { CreateProfileJobCommand, CreateProfileJobCommandInput, StartJobRunCommand, type DataBrewClient, DescribeJobCommand, UpdateProfileJobCommand } from '@aws-sdk/client-databrew';
import { ulid } from 'ulid';
import { SSMClient, PutParameterCommand, ParameterType } from '@aws-sdk/client-ssm';

export class ProfileJobTask {

	constructor(
		private log: BaseLogger,
		private dataBrewClient: DataBrewClient,
		private ssmClient: SSMClient,
		private jobsBucket: string,
		private jobsBucketPrefix: string
	) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.info(`ProfileJobTask > process > in > event: ${JSON.stringify(event)}`);

		const profileCommand = await this.createProfilingJob(event);

		// Use assetId if it exists else no asset exists so use the requestId
		const id = (event.dataAsset.catalog?.assetId) ? event.dataAsset.catalog.assetId : event.dataAsset.requestId
		const jobName = `${event.dataAsset.workflow.name}-${id}-dataProfile`;
		let res= undefined;

		try{
			await this.dataBrewClient.send( new DescribeJobCommand({ Name : jobName}));
			res = await this.dataBrewClient.send(new UpdateProfileJobCommand(profileCommand));
		} catch (error){
			this.log.debug(`ProfileJobTask > process > in > event: ${JSON.stringify(error)}`);

			// Create the Job profile if no job exists
			if((error as Error).name ==='ResourceNotFoundException'){
				res = await this.dataBrewClient.send(new CreateProfileJobCommand(profileCommand));
			}
		}
		
		// Run the Job if the job is on Demand
		await this.dataBrewClient.send(new StartJobRunCommand({ Name: res.Name }));

		this.log.info(`ProfileJobTask > process > exit:`);

	}

	private async createProfilingJob(event: DataAssetTask): Promise<CreateProfileJobCommandInput> {

		const asset = event.dataAsset;
		// Use assetId if it exists else no asset exists so use the requestId
		const id = (asset.catalog?.assetId) ? asset.catalog.assetId : asset.requestId

		const jobName = `${asset.workflow.name}-${id}-dataProfile`;
		const outputKey = `${this.jobsBucketPrefix}/${asset.catalog.domainId}/${asset.catalog.projectId}/${id}/dataProfile`

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
				executionArn: event.execution.executionArn			}
		}

		// We store the task token in SSM parameter using the requestId for future retrieval
		this.ssmClient.send(new PutParameterCommand({
			Name: `/df/spoke/dataAsset/stateMachineExecution/create/${event.dataAsset.requestId}`,
			Value: JSON.stringify(event),
			Type: ParameterType.STRING,
			Overwrite: true
		}));

		// TODO Construct the Lineage COMPLETE event using the lineageRunId

		this.log.info(`ProfileJobTask > createProfilingJob > command:${JSON.stringify(command)}`);

		return command;

	}

}
