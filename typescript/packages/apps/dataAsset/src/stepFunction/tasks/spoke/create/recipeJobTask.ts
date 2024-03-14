import type { BaseLogger } from "pino";
import { CreateRecipeCommand, CreateRecipeJobCommand, type DataBrewClient, DeleteJobCommand, DescribeRecipeCommand, PublishRecipeCommand, StartJobRunCommand, TagResourceCommand, UpdateRecipeCommand } from '@aws-sdk/client-databrew';
import { type DataAssetTask, TaskType } from "../../models.js";
import { ulid } from 'ulid';
import type { S3Utils } from '../../../../common/s3Utils.js';

export class RecipeJobTask {
    constructor(
        private log: BaseLogger,
        private s3Utils: S3Utils,
        private dataBrewClient: DataBrewClient,
    ) {
    }

    public async process(event: DataAssetTask): Promise<any> {
        this.log.info(`RecipeJobTask > process > in > event: ${JSON.stringify(event)}`);

        const id = event.dataAsset?.catalog?.assetId ? event.dataAsset.catalog.assetId : event.dataAsset.requestId;

        // TODO @Willsia Construct the Lineage start event using the lineageRunId
        const lineageRunId = ulid().toLowerCase();

        let recipeName = `df-${id}`;
        let recipeVersion = '1.0'; // default published version is 1.0 (string)

        // if the request specifies an existing recipe, use that, otherwise, create a new recipe
        if (event.dataAsset.workflow.transforms?.recipeReference) {
            recipeName = event.dataAsset.workflow.transforms.recipeReference.name;
            recipeVersion = event.dataAsset.workflow.transforms.recipeReference.version;
            this.log.debug(`using existing recipe: recipeName: ${recipeName}, recipeVersion: ${recipeVersion}`);
        } else {
            this.log.debug(`using recipe defined in request`);
            let recipe;
            try {
                recipe = await this.dataBrewClient.send(
                    new DescribeRecipeCommand({
                        Name: recipeName
                    })
                );
                this.log.debug(`found recipe ${recipe.Name}, updating`);
                // update recipe
                await this.dataBrewClient.send(
                    new UpdateRecipeCommand({
                        Name: recipeName,
                        Steps: event.dataAsset.workflow.transforms.recipe.steps,
                    })
                );
                // update tags
                await this.dataBrewClient.send(
                    new TagResourceCommand({
                        ResourceArn: recipe.ResourceArn,
                        Tags: {
                            ...event.dataAsset.workflow?.tags,
                            // Default tags that are added for lineage and enrichment purposes
                            domainId: event.dataAsset.catalog.domainId,
                            projectId: event.dataAsset.catalog.projectId,
                            assetName: event.dataAsset.catalog.assetName,
                            assetId: event.dataAsset.catalog.assetId,
                            requestId: event.dataAsset.requestId,
                            LineageRunId: lineageRunId,
                            executionArn: event.execution.executionArn,
                            executionToken: event.execution.taskToken,
                        },
                    })
                );
                recipeVersion = this.incrementRecipeVersion(recipe.RecipeVersion);
            } catch (error) {
                if ((error as Error).name === 'ResourceNotFoundException') {
                    this.log.debug(`recipe: ${recipeName} does not exist, creating new recipe`);
                    recipe = await this.dataBrewClient.send(
                        new CreateRecipeCommand({
                            Name: recipeName,
                            Steps: event.dataAsset.workflow.transforms.recipe.steps,
                            Tags: {
                                ...event.dataAsset.workflow?.tags,
                                // Default tags that are added for lineage and enrichment purposes
                                domainId: event.dataAsset.catalog.domainId,
                                projectId: event.dataAsset.catalog.projectId,
                                assetName: event.dataAsset.catalog.assetName,
                                assetId: event.dataAsset.catalog.assetId,
                                requestId: event.dataAsset.requestId,
                                LineageRunId: lineageRunId,
                                executionArn: event.execution.executionArn,
                                executionToken: event.execution.taskToken,
                            },
                        })
                    );
                    recipeName = recipe.Name;
                } else {
                    this.log.error(`error creating recipe: ${JSON.stringify(error)}`);
                    throw error;
                }
            }

            await this.dataBrewClient.send(new PublishRecipeCommand({Name: recipeName}));
            this.log.debug(`using created recipe: recipeName: ${recipeName}, recipeVersion: ${recipeVersion}`);
        }

        const jobName = `${event.dataAsset.workflow.name}-${id}-transform`;

        // Recipe Jobs cannot be updated with new recipes or versions of recipes. If the job exists it will have to be deleted and then recreated.
        // Attempt to delete the recipe job instead of fetching. If found or not found we create the job after.
        try {
            await this.dataBrewClient.send(new DeleteJobCommand({Name: jobName}));
            this.log.debug(`deleted job ${jobName}, recreating`);
        } catch (error) {
            if ((error as Error).name === 'ResourceNotFoundException') {
                this.log.debug(`job: ${jobName} did not exist, creating`);
            } else {
                this.log.error(`error deleting job: ${JSON.stringify(error)}`);
                throw error;
            }
        }

        // now create/recreate job
        const recipeJob = await this.dataBrewClient.send(
            new CreateRecipeJobCommand({
                Name: jobName,
                DatasetName: id,
                RoleArn: event.dataAsset.workflow.roleArn,
                RecipeReference: {
                    Name: recipeName,
                    RecipeVersion: recipeVersion,
                },
                Outputs: [
                    {
                        Location: this.s3Utils.getRecipeJobOutputLocation(id, event.dataAsset.catalog.domainId, event.dataAsset.catalog.projectId),
                        Format: event.dataAsset.workflow.transforms?.targetFormat ? event.dataAsset.workflow.transforms.targetFormat.toUpperCase() : undefined,
                        CompressionFormat: event.dataAsset.workflow.transforms?.targetCompression ? event.dataAsset.workflow.transforms.targetCompression.toUpperCase() : undefined,
                        Overwrite: true,
                        MaxOutputFiles: 1
                    },
                ],
                Tags: {
                    ...event.dataAsset.workflow?.tags,
                    // Default tags that are added for lineage and enrichment purposes
                    domainId: event.dataAsset.catalog.domainId,
                    projectId: event.dataAsset.catalog.projectId,
                    assetName: event.dataAsset.catalog.assetName,
                    assetId: event.dataAsset.catalog.assetId,
                    requestId: event.dataAsset.requestId,
                    LineageRunId: lineageRunId,
                    executionArn: event.execution.executionArn,
                    executionToken: event.execution.taskToken,
                },
            })
        );

        this.log.debug(`recipeJob: ${JSON.stringify(recipeJob)}`);

        // Run the Job
        await this.dataBrewClient.send(
            new StartJobRunCommand({Name: recipeJob.Name})
        );

        // Update task data in S3 for next task
        await this.s3Utils.putTaskData(TaskType.DataProfileTask, id, event);

        this.log.info(`RecipeJobTask > process > exit:`);
    }

    private incrementRecipeVersion(currentRecipeVersion: string): string {
        this.log.debug(`RecipeJobTask > incrementRecipeVersion > currentRecipeVersion: ${currentRecipeVersion}`);
        // Convert the input string to a number
        const currentVersionNum = parseFloat(currentRecipeVersion);

        // Check if the input string is a valid number
        if (isNaN(currentVersionNum)) {
            throw new Error('Invalid input! Please provide a number with one decimal place.');
        }

        // Increment the number by 1.0
        const newVersionNum = currentVersionNum + 1.0;

        this.log.debug(`RecipeJobTask > incrementRecipeVersion > exit: ${newVersionNum.toFixed(1)}`);
        return newVersionNum.toFixed(1);
    }
}
