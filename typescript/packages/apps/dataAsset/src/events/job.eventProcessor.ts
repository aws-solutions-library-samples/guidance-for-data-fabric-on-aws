import { type DataAssetJobStartEvent, type DataAssetJobCompletionEvent, type JobStateChangeEvent, DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT, EventBridgeEventBuilder, EventPublisher, DataAssetSpokeJobCompletionEvent } from '@df/events';
import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';
import type { DataAssetService } from '../api/dataAsset/service';
import { DataBrewClient, DescribeJobCommand, DescribeJobRunCommand } from '@aws-sdk/client-databrew';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { RequestPresigningArguments } from '@aws-sdk/types';
import axios from 'axios';
import type { DataProfile, ProfileColumns } from '../api/dataAsset/schemas';

export class JobEventProcessor {
	constructor(
		private log: BaseLogger,
		private dataAssetService: DataAssetService,
		private dataBrewClient: DataBrewClient,
		private eventBusName: string,
		private eventPublisher: EventPublisher,
		private s3Client: S3Client,
		private getSignedUrl: GetSignedUrl
	) {
	}

	public async jobStartEvent(event: DataAssetJobStartEvent): Promise<void> {
		this.log.info(`JobEventProcessor > jobStartEvent > event: ${JSON.stringify(event)}`);

		validateNotEmpty(event, 'Job start event');

		const dataAsset = await this.dataAssetService.get(event.dataAsset.id);
		if (!dataAsset?.execution) {
			dataAsset['execution'] = {};
		}
		dataAsset.execution.jobRunId = event.job.jobRunId;
		dataAsset.execution.jobRunStatus = event.job.jobRunStatus;
		dataAsset.execution.jobStartTime = event.job.jobStartTime;
		await this.dataAssetService.update(dataAsset.id, dataAsset);
		
		this.log.info(`JobEventProcessor > jobStartEvent > exit`);
		return;
	}

	public async jobCompletionEvent(event: DataAssetSpokeJobCompletionEvent): Promise<void> {
		this.log.info(`JobEventProcessor > jobCompletionEvent > event: ${JSON.stringify(event)}`);

		validateNotEmpty(event, 'Job completion event');

		const dataAsset = await this.dataAssetService.get(event.detail.dataAsset.catalog.assetId);

		// Update data zone meta data with profiling data
		
		const profile = await this.constructProfile(event);
		await this.dataAssetService.updateDataZoneProfile(dataAsset, profile);

		// TODO Update data lineage of the asset

		// Update the asset with the job status
		if (!dataAsset?.execution){
			dataAsset.execution = {}
		}
		dataAsset.execution['jobRunId'] = event.detail.job.jobRunId;
		dataAsset.execution['jobRunStatus'] = event.detail.job.jobRunStatus;
		dataAsset.execution['jobStartTime'] = event.detail.job.jobStartTime;
		dataAsset.execution['jobStopTime'] = event.detail.job.jobStopTime;
		await this.dataAssetService.update(dataAsset.id, dataAsset);

		this.log.info(`JobEventProcessor > jobCompletionEvent > exit`);
		return;
	}


	// This event needs to move to the spoke app
	public async jobEnrichmentEvent(event: JobStateChangeEvent): Promise<void> {
		this.log.info(`JobEventProcessor > jobEnrichmentEvent >in  event: ${JSON.stringify(event)}`);

		validateNotEmpty(event, 'Job enrichment event');

		// Get the relevant Job and tags to link it back to the Data Zone asset
		const job = await this.dataBrewClient.send(new DescribeJobCommand({ Name: event.detail.jobName }));

		//Get the Job startTime
		const run = await this.dataBrewClient.send(new DescribeJobRunCommand({ RunId: event.detail.jobRunId, Name: event.detail.jobName }));

		// provide profiling information from S3 objects 
		// TODO we will need to deal with multiple output files, need to figure out how to correctly target the profiling jobs
		const signedUrl = await this.getSignedUrl(this.s3Client, new GetObjectCommand({ Bucket: job.Outputs[0].Location.Bucket, Key: run.Outputs[0].Location.Key }), { expiresIn: 300 });

		// We supply a minimum payload with job status and asset info
		const eventPayload: DataAssetJobCompletionEvent = {
			dataAsset: {
				catalog: {
					accountId: event.account,
					assetName: job.Tags['assetName'],
					domainId: job.Tags['domainId'],
					projectId: job.Tags['projectId'],
					assetId: job.Tags['assetId'],
					autoPublish: true

				}
			},
			job: {
				jobRunId: event.detail.jobRunId,
				jobRunStatus: event.detail.state,
				jobStopTime: run.CompletedOn.toString(),
				jobStartTime: run.ExecutionTime.toString(),
				message: event.detail.message,
				profileLocation: `s3://${job.Outputs[0].Location.Bucket}/${run.Outputs[0].Location.Key}`,
				profileSignedUrl: signedUrl
			}
		}

		const publishEvent = new EventBridgeEventBuilder()
			.setEventBusName(this.eventBusName)
			.setSource(DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT)
			.setDetailType(DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT)
			.setDetail(eventPayload);

		await this.eventPublisher.publish(publishEvent);

		// TODO Publish Data Lineage event
		await this.constructDataLineage();

		this.log.info(`JobEventProcessor > jobEnrichmentEvent >exit`);
		return;
	}

	private async constructProfile(event: DataAssetSpokeJobCompletionEvent): Promise<DataProfile> {
		this.log.info(`JobEventProcessor > constructProfile > in`);
		
		const signedUrl = event.detail.job.profileSignedUrl;
		const response = await axios.get(signedUrl);
		const profileData = response.data;
		const extractedColumnData = await this.extractColumnProfiles(profileData);
		const dataProfile: DataProfile = {
			summary: {
				sampleSize: profileData?.['sampleSize'],
				columnCount: profileData?.['columns'].length,
				duplicateRowsCount: profileData?.['duplicateRowsCount'],
				location: event.detail.job.profileLocation,
				totalMissingValues: extractedColumnData.totalMissingValues
			},
			columns: extractedColumnData.columns
		}
		this.log.info(`JobEventProcessor > constructProfile > exit`);
		return dataProfile;
	}

	private async extractColumnProfiles(profileData: any): Promise<ExtractedColumns> {
		this.log.info(`JobEventProcessor > extractColumnProfiles > in`);
		const profileColumns: ProfileColumns = [];
		let totalMissingValues = 0;
		if (profileData?.['columns']) {
			for (let column of profileData?.['columns']) {
				profileColumns.push({
					name: column['name'] as string,
					type: column['type'] as string,
					distinctValuesCount: column?.['distinctValuesCount'] as number,
					uniqueValuesCount: column?.['uniqueValuesCount'] as number,
					missingValuesCount: column?.['missingValuesCount'] as number,
					mostCommonValues: ((column?.['mostCommonValues'])? column?.['mostCommonValues'] : []).slice(0, 5),
					max: column?.['max'] as number,
					min: column?.['min'] as number,
					mean: column?.['mean'] as number
				});
				totalMissingValues += (!column?.['missingValuesCount']) ? 0 : (column?.['missingValuesCount'] as number);
				this.log.info(`JobEventProcessor > extractColumnProfiles > exit`);
			}

		}
		this.log.info(`JobEventProcessor > extractColumnProfiles > exit ${JSON.stringify(profileColumns)}, totalMissingValues:${totalMissingValues}`);
		return { columns: profileColumns, totalMissingValues };
	}

	private async constructDataLineage(): Promise<void> {
		this.log.info(`JobEventProcessor > constructDataLineage > in`);
		// Do nothing for now
	}


}

type ExtractedColumns = {
	totalMissingValues: number,
	columns: ProfileColumns
}

export type GetSignedUrl = (client: S3Client, command: GetObjectCommand, options?: RequestPresigningArguments) => Promise<string>;
