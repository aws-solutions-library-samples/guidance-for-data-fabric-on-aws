import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../../models.js';
import { CreateRecipeCommand, CreateRecipeJobCommand, type DataBrewClient, StartJobRunCommand } from '@aws-sdk/client-databrew';
import { ulid } from 'ulid';

export class TransformJobTask {

    constructor(
        private log: BaseLogger,
        private dataBrewClient: DataBrewClient,
        private jobsBucket: string,
        private jobsBucketPrefix: string
    ) {
    }

    // TODO John for the transform, you will need to:
    // 1- Perform reciep creation
    // 2- Create transform job
    // 3- run job
    // I have added the following code as a place holder its up to you to flush it out and cater for other scenarios such as redshift, etc
    public async process(event: DataAssetTask): Promise<any> {
        this.log.info(`TranformJobTask > process > in > event: ${JSON.stringify(event)}`);

        const id = (event.dataAsset?.catalog?.assetId) ? event.dataAsset.catalog.assetId : event.dataAsset.id;

        // TODO @Willsia Construct the Lineage start event using the lineageRunId
        const lineageRunId = ulid().toLowerCase();

        // TODO add if condition to check for recipeId s exists before creating

        // Create the recipe if none exist
        const recipe = await this.dataBrewClient.send(new CreateRecipeCommand({
            Name: `df-${id}`,
            Steps: [], // TODO add recipe step
            Tags: {
                ...event.dataAsset.workflow?.tags,
                // Default tags that are added for lineage and enrichment purposes
                domainId: event.dataAsset.catalog.domainId,
                projectId: event.dataAsset.catalog.projectId,
                assetName: event.dataAsset.catalog.assetName,
                assetId: event.dataAsset.catalog.assetId,
                id: event.dataAsset.id,
                LineageRunId: lineageRunId,
                executionArn: event.execution.executionArn,
                executionToken: event.execution.taskToken
            }
        }));

        const jobName = `${event.dataAsset.workflow.name}-${id}-profile`;
        const outputKey = `${this.jobsBucketPrefix}/${event.dataAsset.catalog.domainId}/${event.dataAsset.catalog.projectId}/${id}`;

        // Create the Transform Job
        const res = await this.dataBrewClient.send(new CreateRecipeJobCommand({
            Name: jobName,
            DatasetName: id,
            RoleArn: event.dataAsset.workflow.roleArn,
            RecipeReference: {
                Name: recipe.Name
            },
            Outputs: [
                {
                    Location: {
                        Bucket: this.jobsBucket,
                        Key: outputKey
                    }
                }
            ],
            Tags: {
                ...event.dataAsset.workflow?.tags,
                // Default tags that are added for lineage and enrichment purposes
                domainId: event.dataAsset.catalog.domainId,
                projectId: event.dataAsset.catalog.projectId,
                assetName: event.dataAsset.catalog.assetName,
                assetId: event.dataAsset.catalog.assetId,
                id: event.dataAsset.id,
                LineageRunId: lineageRunId,
                executionArn: event.execution.executionArn,
                executionToken: event.execution.taskToken
            }

        }));

        // Run the Job if the job is on Demand
        await this.dataBrewClient.send(new StartJobRunCommand({Name: res.Name}));

        this.log.info(`TranformJobTask > process > exit:`);

    }

}
