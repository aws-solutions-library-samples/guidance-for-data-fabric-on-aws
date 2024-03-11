import type { BaseLogger } from "pino";
import { SFNClient, SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import { StartJobRunCommand, type DataBrewClient, CreateRecipeJobCommand, CreateRecipeCommand, DescribeJobCommand, DescribeRecipeCommand, PublishRecipeCommand, TagResourceCommand, UpdateRecipeCommand, UpdateRecipeJobCommand } from '@aws-sdk/client-databrew';
import type { DataAssetTask } from "../../models.js";
import { ulid } from 'ulid';

export class RecipeJobTask {
  constructor(
		private log: BaseLogger,
		private sfnClient: SFNClient,
		private dataBrewClient: DataBrewClient,
		private jobsBucket: string,
		private jobsBucketPrefix: string
	) {}

  public async process(event: DataAssetTask): Promise<any> {
    this.log.info(`RecipeJobTask > process > in > event: ${JSON.stringify(event)}`);

    const id = event.dataAsset?.catalog?.assetId ? event.dataAsset.catalog.assetId : event.dataAsset.requestId;

    // TODO @Willsia Construct the Lineage start event using the lineageRunId
    const lineageRunId = ulid().toLowerCase();

    let recipeName = `df-${id}`;
    let recipeVersion = "1.0"; // default published version is 1.0

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
      		if ((error as Error).name === "ResourceNotFoundException") {
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

		await this.dataBrewClient.send(new PublishRecipeCommand({ Name: recipeName }));
		this.log.debug(`using created recipe: recipeName: ${recipeName}, recipeVersion: ${recipeVersion}`);
    }

    const jobName = `${event.dataAsset.workflow.name}-${id}-transform`;
    const outputKey = `${this.jobsBucketPrefix}/${event.dataAsset.catalog.domainId}/${event.dataAsset.catalog.projectId}/${id}/`;

	// TODO: Recipe Jobs cannot be updated with new recipes or versions of recipes. If the job exists it will have to be deleted and recreated.
	//       Possibly the first thing to do would be attempt to delete it and then always create.

    // Attempt to fetch the recipe job. If it is not found, create it. If it is found, update it.
    // Note: In order to update tags we need the ARN of the job. So we would need to fetch it anyway.
    let recipeJob;
    try {
      recipeJob = await this.dataBrewClient.send(new DescribeJobCommand({ Name: jobName }));
      this.log.debug(`found job ${jobName}, updating`);
      // update job
      await this.dataBrewClient.send(
        new UpdateRecipeJobCommand({
          Name: jobName,
          RoleArn: event.dataAsset.workflow.roleArn,
          Outputs: [
            {
              Location: {
                Bucket: this.jobsBucket,
                Key: outputKey,
              },
            },
          ],
        })
      );
      // update tags
      await this.dataBrewClient.send(
        new TagResourceCommand({
          ResourceArn: recipeJob.ResourceArn,
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
    } catch (error) {
      if ((error as Error).name === "ResourceNotFoundException") {
        this.log.debug(`job: ${jobName} does not exist, creating new job`);
        recipeJob = await this.dataBrewClient.send(
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
                Location: {
                  Bucket: this.jobsBucket,
                  Key: outputKey,
                },
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
      } else {
        this.log.error(`error creating job: ${JSON.stringify(error)}`);
        throw error;
      }
    }

    this.log.debug(`recipeJob: ${JSON.stringify(recipeJob)}`);

    // Run the Job if the job is on Demand
    await this.dataBrewClient.send(
      new StartJobRunCommand({ Name: recipeJob.Name })
    );

    await this.sfnClient.send(
      new SendTaskSuccessCommand({
        output: JSON.stringify(event),
        taskToken: event.execution.taskToken,
      })
    );

    this.log.info(`RecipeJobTask > process > exit:`);
  }

  private incrementRecipeVersion(currentRecipeVersion: string): string {
		// Convert the input string to a number
		const currentVersionNum = parseFloat(currentRecipeVersion);

		// Check if the input string is a valid number
		if (isNaN(currentVersionNum)) {
			throw new Error('Invalid input! Please provide a number with one decimal place.');
		}

		// Increment the number by 1.0
		const newVersionNum = currentVersionNum + 1.0;

		return newVersionNum.toFixed(1);
	}
}
