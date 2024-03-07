import type { BaseLogger } from "pino";
import { SFNClient, SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import { StartJobRunCommand, type DataBrewClient, CreateRecipeJobCommand, CreateRecipeCommand, PublishRecipeCommand } from '@aws-sdk/client-databrew';
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

    let recipeName;
    let recipeVersion = "1.0"; // default published version is 1.0

	// if the request specifies an existing recipe, use that, otherwise, create a new recipe
    if (event.dataAsset.workflow.transforms?.recipeReference) {
      recipeName = event.dataAsset.workflow.transforms.recipeReference.name;
      recipeVersion = event.dataAsset.workflow.transforms.recipeReference.version;
      this.log.debug(`using existing recipe: recipeName: ${recipeName}, recipeVersion: ${recipeVersion}`);
    } else {
      // TODO: Check if recipe exists? Would we update and version it if this is the case?
      const recipe = await this.dataBrewClient.send(
        new CreateRecipeCommand({
          Name: `df-${id}`,
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

      await this.dataBrewClient.send(new PublishRecipeCommand({ Name: recipeName }));
      this.log.debug(`using created recipe: recipeName: ${recipeName}, recipeVersion: ${recipeVersion}`);
    }

    const jobName = `${event.dataAsset.workflow.name}-${id}-transform`;
    const outputKey = `${this.jobsBucketPrefix}/${event.dataAsset.catalog.domainId}/${event.dataAsset.catalog.projectId}/${id}/`;

    // Create the Transform Job
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

    this.log.debug(`recipeJob: ${JSON.stringify(recipeJob)}`);

    // Run the Job if the job is on Demand
    await this.dataBrewClient.send(new StartJobRunCommand({ Name: recipeJob.Name }));

    await this.sfnClient.send(
		new SendTaskSuccessCommand(
			{ output: JSON.stringify(event), taskToken: event.execution.taskToken }
		)
	);

    this.log.info(`RecipeJobTask > process > exit:`);
  }
}
