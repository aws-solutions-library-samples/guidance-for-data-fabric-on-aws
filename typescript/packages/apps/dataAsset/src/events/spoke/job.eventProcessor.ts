import {  DATA_LINEAGE_DIRECT_SPOKE_INGESTION_REQUEST_EVENT, EventBridgeEventBuilder, EventPublisher, type JobStateChangeEvent, OpenLineageBuilder, ProfilingResult, type RunEvent, DATA_LINEAGE_SPOKE_EVENT_SOURCE } from '@df/events';
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
        private s3Client: S3Client,
        private hubEventBusName: string,
        private eventPublisher: EventPublisher
    ) {
    }

    public async processJobCompletionEvent(event: JobStateChangeEvent): Promise<void> {
        this.log.info(`JobEventProcessor > processJobCompletionEvent >in  event: ${JSON.stringify(event)}`);

        validateNotEmpty(event, 'Job enrichment event');

        // Get the relevant Job and tags to link it back to the Data Zone asset
        const job = await this.dataBrewClient.send(new DescribeJobCommand({Name: event.detail.jobName}));
        const id = (job.Tags?.['assetId']) ? job.Tags['assetId'] : job.Tags['id'];

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
                outputPath: this.s3Utils.getProfilingJobOutputPath(id, taskInput.dataAsset.catalog.domainId, taskInput.dataAsset.catalog.projectId),
            }

            const outputLocation = run.Outputs[0].Location;
            const response = await this.s3Client.send(new GetObjectCommand({Key: outputLocation.Key, Bucket: outputLocation.Bucket}))
            const profilingResult: ProfilingResult = JSON.parse(await response.Body.transformToString());
            const profilingJobArn = `arn:aws:databrew:${event.region}:${event.account}:job/${event.detail.jobName}`

            taskInput.dataAsset.lineage.dataProfile = this.constructLineage(taskInput.dataAsset.lineage.dataProfile, profilingJobArn, profilingResult);

            const openLineageEvent = new EventBridgeEventBuilder()
                .setEventBusName(this.hubEventBusName)
                .setSource(DATA_LINEAGE_SPOKE_EVENT_SOURCE)
                .setDetailType(DATA_LINEAGE_DIRECT_SPOKE_INGESTION_REQUEST_EVENT)
                .setDetail(taskInput.dataAsset.lineage.dataProfile);

            await this.eventPublisher.publish(openLineageEvent);

            this.log.info(`JobEventProcessor > processJobCompletionEvent > jobProfileTaskCompleteEvent: ${JSON.stringify(taskInput.dataAsset.lineage.dataProfile)}`);

            await this.s3Utils.putTaskData(TaskType.DataProfileTask, id, taskInput);
        }

        await this.sfnClient.send(new SendTaskSuccessCommand({output: JSON.stringify(taskInput), taskToken: taskInput.execution.taskToken}));

        this.log.info(`JobEventProcessor > processJobCompletionEvent >exit ${JSON.stringify(taskInput)}`);
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
