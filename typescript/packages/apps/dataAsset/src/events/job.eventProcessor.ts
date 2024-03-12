import type { JobStateChangeEvent, DataAssetSpokeJobCompletionEvent } from '@df/events';
import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';
import { DataBrewClient, DescribeJobCommand, DescribeJobRunCommand } from '@aws-sdk/client-databrew';
// import type { RequestPresigningArguments } from '@aws-sdk/types';
// import type { ProfileColumns } from '../api/dataAsset/schemas';
import { SendTaskSuccessCommand, type SFNClient } from '@aws-sdk/client-sfn';
import { GetParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';
import type { DataAssetTask } from '../stepFunction/tasks/models';

export class JobEventProcessor {
	constructor(
		private log: BaseLogger,
		private dataBrewClient: DataBrewClient,
		private sfnClient: SFNClient,
		private ssmClient: SSMClient,
	) {
	}

	// TODO remove this function in the future
	// public async jobStartEvent(event: DataAssetJobStartEvent): Promise<void> {
		// this.log.info(`JobEventProcessor > jobStartEvent > event: ${JSON.stringify(event)}`);

		// validateNotEmpty(event, 'Job start event');

		// const dataAsset = await this.dataAssetService.get(event.dataAsset.id);
		// if (!dataAsset?.execution) {
		// 	dataAsset['execution'] = {};
		// }
		// dataAsset.execution.profilingJob.jobRunId = event.job.jobRunId;
		// dataAsset.execution.profilingJob.jobRunStatus = event.job.jobRunStatus;
		// dataAsset.execution.profilingJob.jobStartTime = event.job.jobStartTime;

		// // TODO we dont need Job start event or this lookup anymore
		// await this.dataAssetService.update(dataAsset.id, dataAsset);
		
	// 	this.log.info(`JobEventProcessor > jobStartEvent > exit`);
	// 	return;
	// }

	// public async jobCompletionEvent(event: DataAssetSpokeJobCompletionEvent): Promise<void> {
	// 	this.log.info(`JobEventProcessor > jobCompletionEvent > event: ${JSON.stringify(event)}`);

	// 	validateNotEmpty(event, 'Job completion event');

	// 	const dataAsset = await this.dataAssetService.get(event.detail.dataAsset.catalog.assetId);

	// 	// Update data zone meta data with profiling data
		
	// 	const profile = await this.constructProfile(event);
	// 	await this.dataAssetService.updateDataZoneProfile(dataAsset, profile);

	// 	// TODO Update data lineage of the asset

	// 	// Update the asset with the job status
	// 	if (!dataAsset?.execution){
	// 		dataAsset.execution = {}
	// 	}
	// 	dataAsset.execution['jobRunId'] = event.detail.job.jobRunId;
	// 	dataAsset.execution['jobRunStatus'] = event.detail.job.jobRunStatus;
	// 	dataAsset.execution['jobStartTime'] = event.detail.job.jobStartTime;
	// 	dataAsset.execution['jobStopTime'] = event.detail.job.jobStopTime;
	// 	await this.dataAssetService.update(dataAsset.requestId, dataAsset);

	// 	this.log.info(`JobEventProcessor > jobCompletionEvent > exit`);
	// 	return;
	// }


	// TODO John: you need to add the event process for the recipe jobs here. this file will be modified and the name of the functions will be refactored.
	// Feel free to split it into another event file
	public async recipeJobCompletionEvent(event: DataAssetSpokeJobCompletionEvent): Promise<void> {
		this.log.info(`JobEventProcessor > recipeJobCompletionEvent > in ${JSON.stringify(event)}`);
	}

	// This event needs to move to the spoke app
	public async profileJobCompletionEvent(event: JobStateChangeEvent): Promise<void> {
		this.log.info(`JobEventProcessor > profileJobCompletionEvent >in  event: ${JSON.stringify(event)}`);

		validateNotEmpty(event, 'Job enrichment event');

		// Get the relevant Job and tags to link it back to the Data Zone asset
		const job = await this.dataBrewClient.send(new DescribeJobCommand({ Name: event.detail.jobName }));

		//Get the Job startTime
		const run = await this.dataBrewClient.send(new DescribeJobRunCommand({ RunId: event.detail.jobRunId, Name: event.detail.jobName }));
		
		//Get the task payload
		const param = await this.ssmClient.send( new GetParameterCommand({
			Name: `/df/spoke/dataAsset/stateMachineExecution/create/${job.Tags['requestId']}`
		}));

		const taskInput:DataAssetTask = JSON.parse(param.Parameter.Value); 

		taskInput.dataAsset.execution= {
			dataProfileJob: {
				id: event.detail.jobRunId,
				status: event.detail.state,
				stopTime: run.CompletedOn.toString(),
				startTime: run.ExecutionTime.toString(),
				message: event.detail.message,
			}
		}

		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(taskInput), taskToken: taskInput.execution.taskToken }));

		// TODO Publish Data Lineage event
		await this.constructDataLineage();

		this.log.info(`JobEventProcessor > profileJobCompletionEvent >exit`);
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

	private async constructDataLineage(): Promise<void> {
		this.log.info(`JobEventProcessor > constructDataLineage > in`);
		// Do nothing for now
	}


}

// type ExtractedColumns = {
// 	totalMissingValues: number,
// 	columns: ProfileColumns
// }

// export type GetSignedUrl = (client: S3Client, command: GetObjectCommand, options?: RequestPresigningArguments) => Promise<string>;
