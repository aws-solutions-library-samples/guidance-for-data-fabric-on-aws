import type { BaseLogger } from 'pino';
import { SendTaskSuccessCommand, SFNClient } from '@aws-sdk/client-sfn';
import { DataAssetTask, DataAssetTasks, TaskType } from '../../models.js';
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
        // Use assetId if it exists else no asset exists so use the id
        const id = (assets[0].catalog?.assetId) ? assets[0].catalog.assetId : assets[0].id;

        const profile = await this.s3Utils.getTaskData(TaskType.DataProfileTask, id);

        let mergedLineage;
        let mergedExecution;
        if (profile.dataAsset.workflow?.dataQuality) {
            const dataQualityProfile = await this.s3Utils.getTaskData(TaskType.DataQualityProfileTask, id);

            mergedLineage = merge.recursive(profile.dataAsset.lineage, dataQualityProfile.dataAsset.lineage);
            mergedExecution = merge.recursive(profile.dataAsset.execution, dataQualityProfile.dataAsset.execution);
        } else {
            mergedLineage = profile.dataAsset.lineage;
            mergedExecution = profile.dataAsset.execution;
        }

        this.log.info(`LineageTask > process > in > lineage: ${JSON.stringify(mergedLineage)}`);

        const asset: DataAssetTask = {
            dataAsset: profile.dataAsset
        };
        asset.dataAsset.lineage = mergedLineage;
        asset.dataAsset.execution = mergedExecution;

        await this.s3Utils.putTaskData(TaskType.LineageTask, id, asset);
        const signedUrl = await this.s3Utils.getTaskDataSignedUrl(TaskType.LineageTask, id, 3600);

        const response: CreateResponseEventDetails = {
            id: profile.dataAsset.id,
            catalog: profile.dataAsset.catalog,
            workflow: profile.dataAsset.workflow,
            hubTaskToken: profile.dataAsset.execution.hubTaskToken,
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


        await this.sfnClient.send(new SendTaskSuccessCommand({output: JSON.stringify(event), taskToken: event.execution.taskToken}));
        this.log.info(`LineageTask > process > exit:`);

    }


}
