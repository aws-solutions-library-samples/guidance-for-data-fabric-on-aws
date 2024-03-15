import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import { DataAssetTasks, TaskType, DataAssetTask } from '../../models.js';
import type { CreateResponseEventDetails, EventPublisher } from '@df/events';
import { DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT, DATA_ASSET_SPOKE_EVENT_SOURCE, EventBridgeEventBuilder } from '@df/events';
import merge from 'merge';
import type { S3Utils } from '../../../../common/s3Utils.js';


export class LineageTask {

	constructor(private log: BaseLogger,
				private sfnClient: SFNClient,
				private eventBusName: string,
				private eventPublisher: EventPublisher,
				private readonly s3Utils: S3Utils
				) {
	}

	// Finalize the lineage payload and publish the response event
	public async process(event: DataAssetTasks): Promise<any> {
		this.log.info(`LineageTask > process > in > event: ${JSON.stringify(event)}`);

		const assets = event.dataAssets;
		const mergedLineage = merge.recursive(assets[0].lineage, assets[1].lineage);
		this.log.info(`LineageTask > process > in > lineage: ${JSON.stringify(mergedLineage)}`);

		const asset:DataAssetTask = {
			dataAsset: assets[0]
		};
		asset.dataAsset.lineage = mergedLineage;

		// Use assetId if it exists else no asset exists so use the requestId
        const id = (asset.dataAsset.catalog?.assetId) ? asset.dataAsset.catalog.assetId : asset.dataAsset.requestId;
		await this.s3Utils.putTaskData(TaskType.lineageTask, id, asset);
		const signedUrl = await this.s3Utils.getTaskDataSignedUrl(TaskType.lineageTask, id, 3600);

		const response: CreateResponseEventDetails = {
			requestId: assets[0].requestId,
			catalog: assets[0].catalog,
			workflow: assets[0].workflow,
			hubTaskToken: assets[0].execution.hubTaskToken,
			fullPayloadSignedUrl: signedUrl,
			dataProfileSignedUrl: signedUrl,
			dataQualityProfileSignedUrl: signedUrl
		}


		const publishEvent = new EventBridgeEventBuilder()
			.setEventBusName(this.eventBusName)
			.setSource(DATA_ASSET_SPOKE_EVENT_SOURCE)
			.setDetailType(DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT)
			.setDetail(response);

		await this.eventPublisher.publish(publishEvent);


		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken:event.execution.taskToken }));
		this.log.info(`LineageTask > process > exit:`);

	}


}
