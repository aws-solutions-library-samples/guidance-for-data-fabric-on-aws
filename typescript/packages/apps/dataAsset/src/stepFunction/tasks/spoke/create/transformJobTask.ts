import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../../models.js';
import { CreateRecipeJobCommand, type DataBrewClient, StartJobRunCommand } from '@aws-sdk/client-databrew';

export class TransformJobTask {

    constructor(
        private log: BaseLogger,
        private dataBrewClient: DataBrewClient,
        private jobsBucket: string,
        private jobsBucketPrefix: string
    ) {
    }

    public async process(event: DataAssetTask): Promise<any> {
        this.log.info(`TranformJobTask > process > in > event: ${JSON.stringify(event)}`);

        const id = (event.dataAsset?.catalog?.assetId) ? event.dataAsset.catalog.assetId : event.dataAsset.id;
        const recipeName = `df-${id}`;

        const jobName = `${event.dataAsset.workflow.name}-${id}-profile`;
        const outputKey = `${this.jobsBucketPrefix}/${event.dataAsset.catalog.domainId}/${event.dataAsset.catalog.projectId}/${id}`;

        // Create the Transform Job
        const res = await this.dataBrewClient.send(new CreateRecipeJobCommand({
            Name: jobName,
            DatasetName: id,
            RoleArn: event.dataAsset.workflow.roleArn,
            RecipeReference: {
                Name: recipeName
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
                executionId: event.execution.executionId,
                executionToken: event.execution.taskToken
            }

        }));

        // Run the Job if the job is on Demand
        await this.dataBrewClient.send(new StartJobRunCommand({Name: res.Name}));

        this.log.info(`TranformJobTask > process > exit:`);

    }

}
