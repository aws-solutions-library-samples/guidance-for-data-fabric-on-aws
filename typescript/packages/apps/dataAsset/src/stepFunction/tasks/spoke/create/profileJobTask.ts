import type { BaseLogger } from 'pino';
import { type DataAssetTask, TaskType } from '../../models.js';
import { CreateProfileJobCommand, CreateProfileJobCommandInput, type DataBrewClient, DescribeJobCommand, StartJobRunCommand, UpdateProfileJobCommand } from '@aws-sdk/client-databrew';
import { ulid } from 'ulid';
import type { S3Utils } from '../../../../common/s3Utils.js';

export class ProfileJobTask {

    constructor(
        private readonly log: BaseLogger,
        private readonly dataBrewClient: DataBrewClient,
        private readonly s3Utils: S3Utils
    ) {
    }


    public async process(event: DataAssetTask): Promise<any> {
        this.log.info(`ProfileJobTask > process > in > event: ${JSON.stringify(event)}`);

        const profileCommand = await this.createProfilingJob(event);

        // Use assetId if it exists else no asset exists so use the requestId
        const id = (event.dataAsset.catalog?.assetId) ? event.dataAsset.catalog.assetId : event.dataAsset.requestId
        const jobName = `${event.dataAsset.workflow.name}-${id}-dataProfile`;
        let res = undefined;

        try {
            await this.dataBrewClient.send(new DescribeJobCommand({Name: jobName}));
            res = await this.dataBrewClient.send(new UpdateProfileJobCommand(profileCommand));
        } catch (error) {
            this.log.debug(`ProfileJobTask > process > in > event: ${JSON.stringify(error)}`);

            // Create the Job profile if no job exists
            if ((error as Error).name === 'ResourceNotFoundException') {
                res = await this.dataBrewClient.send(new CreateProfileJobCommand(profileCommand));
            }
        }

        // Run the Job if the job is on Demand
        await this.dataBrewClient.send(new StartJobRunCommand({Name: res.Name}));

        this.log.info(`ProfileJobTask > process > exit:`);

    }

    private async createProfilingJob(event: DataAssetTask): Promise<CreateProfileJobCommandInput> {

        const asset = event.dataAsset;
        // Use assetId if it exists else no asset exists so use the requestId
        const id = (asset.catalog?.assetId) ? asset.catalog.assetId : asset.requestId

        const jobName = `${asset.workflow.name}-${id}-dataProfile`;

        // Create Lineage event
        const lineageRunId = ulid().toLowerCase();
        // TODO @Willsia Construct the Lineage start event using the lineageRunId

        // Create default profile job
        const command: CreateProfileJobCommandInput = {
            Name: jobName,
            DatasetName: `${id}-profileDataSet`,
            RoleArn: asset.workflow.roleArn,
            OutputLocation: this.s3Utils.getProfilingJobOutputLocation(id, asset.catalog.domainId, asset.catalog.projectId),
            Tags: {
                ...asset.workflow?.tags,
                // Default tags that are added for lineage and enrichment purposes
                domainId: event.dataAsset.catalog.domainId,
                projectId: event.dataAsset.catalog.projectId,
                assetName: event.dataAsset.catalog.assetName,
                assetId: event.dataAsset.catalog?.assetId,
                requestId: event.dataAsset.requestId,
                LineageRunId: lineageRunId,
                executionArn: event.execution.executionArn
            }
        }

        await this.s3Utils.putTaskData(TaskType.DataProfileTask, id, event);
        // TODO Construct the Lineage COMPLETE event using the lineageRunId
        this.log.info(`ProfileJobTask > createProfilingJob > command:${JSON.stringify(command)}`);

        return command;

    }

}
