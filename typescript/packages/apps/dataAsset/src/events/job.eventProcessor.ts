import { OpenLineageBuilder, type CustomDatasetInput, type JobStateChangeEvent, type RunEvent } from '@df/events';
import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';
import { DataBrewClient, DescribeJobCommand, DescribeJobRunCommand, DescribeJobRunCommandOutput, JobType } from '@aws-sdk/client-databrew';
import { SendTaskSuccessCommand, type SFNClient } from '@aws-sdk/client-sfn';
import type { S3Utils } from '../common/s3Utils.js';
import { type DataAssetTask, TaskType } from '../stepFunction/tasks/models.js';

export class JobEventProcessor {
    constructor(
        private log: BaseLogger,
        private dataBrewClient: DataBrewClient,
        private sfnClient: SFNClient,
        private s3Utils: S3Utils
    ) {
    }

    public async processJobCompletionEvent(event: JobStateChangeEvent): Promise<void> {
        this.log.info(`JobEventProcessor > processJobCompletionEvent >in  event: ${JSON.stringify(event)}`);

        validateNotEmpty(event, 'Job enrichment event');

        // Get the relevant Job and tags to link it back to the Data Zone asset
        const job = await this.dataBrewClient.send(new DescribeJobCommand({Name: event.detail.jobName}));
        const id = (job.Tags?.['assetId']) ? job.Tags['assetId'] : job.Tags['requestId'];

        //Get the Job startTime
        const run = await this.dataBrewClient.send(new DescribeJobRunCommand({RunId: event.detail.jobRunId, Name: event.detail.jobName}));

        //Get the task payload
        let  taskInput: DataAssetTask ;

        if (job.Type === JobType.RECIPE) {
            taskInput = await this.s3Utils.getTaskData(TaskType.RecipeTask, id);
            taskInput.dataAsset.execution = {
                recipeJob: {
                    id: event.detail.jobRunId,
                    status: event.detail.state,
                    stopTime: run.CompletedOn.toString(),
                    startTime: run.ExecutionTime.toString(),
                    message: event.detail.message,
                }
            }
            // taskInput.dataAsset.lineage[`${TaskType.RecipeTask}-${id}`] = this.constructLineage(id, taskInput, event, job.Type, run );
        } else if (job.Type === JobType.PROFILE) {
            taskInput = await this.s3Utils.getTaskData(TaskType.DataProfileTask, id);
            taskInput.dataAsset.execution = {
                dataProfileJob: {
                    id: event.detail.jobRunId,
                    status: event.detail.state,
                    stopTime: run.CompletedOn.toString(),
                    startTime: run.ExecutionTime.toString(),
                    message: event.detail.message,
                }
            }
            taskInput.dataAsset.lineage[`${TaskType.DataProfileTask}-${id}`] = this.constructLineage(id, taskInput, event, job.Type, run);
        }

        

        await this.sfnClient.send(new SendTaskSuccessCommand({output: JSON.stringify(taskInput), taskToken: taskInput.execution.taskToken}));

        this.log.info(`JobEventProcessor > processJobCompletionEvent >exit`);
        return;
    }

    private constructLineage(id: string, dataAssetTask: DataAssetTask, event: JobStateChangeEvent, jobType:string, run: DescribeJobRunCommandOutput ): Partial<RunEvent> {
        const asset = dataAssetTask.dataAsset;

        const builder = new OpenLineageBuilder();
        const jobPrefix = (jobType == JobType.PROFILE) ? TaskType.DataProfileTask: TaskType.RecipeTask;
        const res =  builder
            .setContext(asset.catalog.domainId, asset.catalog.domainName, asset.execution.hubExecutionArn)
            .setJob(
                {
                    // Supplied by StateMachine task
                    jobName: `${jobPrefix}_${id}`,
                    // Supplied by user
                    assetName: asset.catalog.assetName
                })
            .setStartJob(
                {
                    executionId: event.detail.jobName,
                    startTime: run.StartedOn.toISOString()
                })
            .setEndJob({
                endTime: run.CompletedOn.toISOString(),
                eventType: 'COMPLETE'
            });

            if (jobType == JobType.PROFILE){

                const customInput: CustomDatasetInput = {
                    type: 'Custom',
                    dataSource: {
                        url: `${asset.execution.glueDatabaseName}/${asset.execution.glueTableName}`,
                        name: asset.catalog.assetName
                    },
                    storage: {
                        storageLayer: 'glue'
                    },
                    name: asset.execution.glueTableName,
                    producer: 'TODO User info'
                };
                const location = this.s3Utils.getProfilingJobOutputLocation(id, dataAssetTask.dataAsset.catalog.domainId, dataAssetTask.dataAsset.catalog.projectId)
                res
                .setDatasetInput(customInput)
                .setDatasetOutput({
                    name: `s3://${location.Bucket}/${location.Key}`,
                    storageLayer: 's3',
                })
            }

            return res.build()

    }
}
