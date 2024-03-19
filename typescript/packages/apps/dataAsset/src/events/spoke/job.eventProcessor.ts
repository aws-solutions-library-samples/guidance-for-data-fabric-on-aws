import { type JobStateChangeEvent, OpenLineageBuilder, ProfilingResult, type RunEvent } from '@df/events';
import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';
import { DataBrewClient, DescribeJobCommand, DescribeJobRunCommand, JobType } from '@aws-sdk/client-databrew';
import { SendTaskSuccessCommand, type SFNClient } from '@aws-sdk/client-sfn';
import type { S3Utils } from '../../common/s3Utils.js';
import { type DataAssetTask, TaskType } from '../../stepFunction/tasks/models.js';
import type { S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export class JobEventProcessor {
    constructor(
        private log: BaseLogger,
        private dataBrewClient: DataBrewClient,
        private sfnClient: SFNClient,
        private s3Utils: S3Utils,
        private s3Client: S3Client
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
        let taskInput: DataAssetTask;

        if (job.Type === JobType.RECIPE) {
            taskInput = await this.s3Utils.getTaskData(TaskType.RecipeTask, id);
            taskInput.dataAsset.execution.recipeJob = {
                id: event.detail.jobRunId,
                status: event.detail.state,
                stopTime: run.CompletedOn.toString(),
                startTime: run.ExecutionTime.toString(),
                message: event.detail.message,
            }
        } else if (job.Type === JobType.PROFILE) {

            taskInput = await this.s3Utils.getTaskData(TaskType.DataProfileTask, id);

            taskInput.dataAsset.execution.dataProfileJob = {
                id: event.detail.jobRunId,
                status: event.detail.state,
                stopTime: run.CompletedOn.toString(),
                startTime: run.ExecutionTime.toString(),
                message: event.detail.message,
            }

            const location = this.s3Utils.getProfilingJobOutputLocation(id, taskInput.dataAsset.catalog.domainId, taskInput.dataAsset.catalog.domainId)
            const response = await this.s3Client.send(new GetObjectCommand(location))
            const profilingResult: ProfilingResult = JSON.parse(await response.Body.transformToString());
            const profilingJobArn = `arn:aws:databrew:${event.region}:${event.account}:job/${event.detail.jobName}`

            taskInput.dataAsset.lineage.dataProfile = this.constructLineage(taskInput.dataAsset.lineage.dataProfile, profilingJobArn, profilingResult);

            this.log.info(`JobEventProcessor > processJobCompletionEvent > profileJobTaskCompleteEvent: ${taskInput.dataAsset.lineage.dataProfile}`);
        }

        await this.sfnClient.send(new SendTaskSuccessCommand({output: JSON.stringify(taskInput), taskToken: taskInput.execution.taskToken}));

        this.log.info(`JobEventProcessor > processJobCompletionEvent >exit`);
        return;
    }

    private constructLineage(lineageEvent: Partial<RunEvent>, dataBrewJobArn: string, profilingResult: ProfilingResult): Partial<RunEvent> {
        this.log.info(`JobEventProcessor > constructLineage > in > event: ${JSON.stringify(lineageEvent)}, dataBrewJobArn: ${dataBrewJobArn},  profilingResult: ${JSON.stringify(profilingResult)}`);

        const builder = new OpenLineageBuilder();

        const res = builder
            .setOpenLineageEvent(lineageEvent)
            .setProfilingResult({
                producer: dataBrewJobArn,
                result: profilingResult
            })
            .setEndJob({
                endTime: new Date().toISOString(),
                eventType: 'COMPLETE'
            });

        this.log.info(`JobEventProcessor > constructLineage > exit>`);

        return res.build()
    }
}
