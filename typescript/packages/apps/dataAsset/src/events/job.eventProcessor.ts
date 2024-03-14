import type { JobStateChangeEvent } from '@df/events';
import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';
import { DataBrewClient, DescribeJobCommand, DescribeJobRunCommand, JobType } from '@aws-sdk/client-databrew';
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
        const taskInput: DataAssetTask = await this.s3Utils.getTaskData(TaskType.DataProfileTask, id);

        if (job.Type === JobType.RECIPE) {
            taskInput.dataAsset.execution = {
                recipeJob: {
                    id: event.detail.jobRunId,
                    status: event.detail.state,
                    stopTime: run.CompletedOn.toString(),
                    startTime: run.ExecutionTime.toString(),
                    message: event.detail.message,
                }
            }
        } else if (job.Type === JobType.PROFILE) {
            taskInput.dataAsset.execution = {
                dataProfileJob: {
                    id: event.detail.jobRunId,
                    status: event.detail.state,
                    stopTime: run.CompletedOn.toString(),
                    startTime: run.ExecutionTime.toString(),
                    message: event.detail.message,
                }
            }
        }

        await this.sfnClient.send(new SendTaskSuccessCommand({output: JSON.stringify(taskInput), taskToken: taskInput.execution.taskToken}));

        this.log.info(`JobEventProcessor > processJobCompletionEvent >exit`);
        return;
    }

    // private async constructProfile(event: DataAssetSpokeJobCompletionEvent): Promise<DataProfile> {
    // 	this.log.info(`JobEventProcessor > constructProfile > in`);

    // 	const signedUrl = event.detail.job.profileSignedUrl;
    // 	const response = await axios.get(signedUrl);
    // 	const profileData = response.data;
    // 	const extractedColumnData = await this.extractColumnProfiles(profileData);
    // 	const dataProfile: DataProfile = {
    // 		summary: {
    // 			sampleSize: profileData?.['sampleSize'],
    // 			columnCount: profileData?.['columns'].length,
    // 			duplicateRowsCount: profileData?.['duplicateRowsCount'],
    // 			location: event.detail.job.profileLocation,
    // 			totalMissingValues: extractedColumnData.totalMissingValues
    // 		},
    // 		columns: extractedColumnData.columns
    // 	}
    // 	this.log.info(`JobEventProcessor > constructProfile > exit`);
    // 	return dataProfile;
    // }

    // private async extractColumnProfiles(profileData: any): Promise<ExtractedColumns> {
    // 	this.log.info(`JobEventProcessor > extractColumnProfiles > in`);
    // 	const profileColumns: ProfileColumns = [];
    // 	let totalMissingValues = 0;
    // 	if (profileData?.['columns']) {
    // 		for (let column of profileData?.['columns']) {
    // 			profileColumns.push({
    // 				name: column['name'] as string,
    // 				type: column['type'] as string,
    // 				distinctValuesCount: column?.['distinctValuesCount'] as number,
    // 				uniqueValuesCount: column?.['uniqueValuesCount'] as number,
    // 				missingValuesCount: column?.['missingValuesCount'] as number,
    // 				mostCommonValues: ((column?.['mostCommonValues'])? column?.['mostCommonValues'] : []).slice(0, 5),
    // 				max: column?.['max'] as number,
    // 				min: column?.['min'] as number,
    // 				mean: column?.['mean'] as number
    // 			});
    // 			totalMissingValues += (!column?.['missingValuesCount']) ? 0 : (column?.['missingValuesCount'] as number);
    // 			this.log.info(`JobEventProcessor > extractColumnProfiles > exit`);
    // 		}

    // 	}
    // 	this.log.info(`JobEventProcessor > extractColumnProfiles > exit ${JSON.stringify(profileColumns)}, totalMissingValues:${totalMissingValues}`);
    // 	return { columns: profileColumns, totalMissingValues };
    // }


}

// type ExtractedColumns = {
// 	totalMissingValues: number,
// 	columns: ProfileColumns
// }

// export type GetSignedUrl = (client: S3Client, command: GetObjectCommand, options?: RequestPresigningArguments) => Promise<string>;
