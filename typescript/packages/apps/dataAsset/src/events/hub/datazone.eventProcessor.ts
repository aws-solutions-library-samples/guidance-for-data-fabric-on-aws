import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';
import { SendTaskSuccessCommand, type SFNClient } from '@aws-sdk/client-sfn';
import { TaskType } from '../../stepFunction/tasks/models.js';
import type { S3Utils } from '../../common/s3Utils.js';
import { ListDataSourceRunActivitiesCommand, type DataZoneClient } from '@aws-sdk/client-datazone';
import type { DataSourceRunStateChangeEvent } from '@df/events';

export class DataZoneEventProcessor {
    constructor(
        private log: BaseLogger,
        private sfnClient: SFNClient,
        private s3Utils: S3Utils,
        private dzClient:DataZoneClient
    ) {
    }

    public async dataSourceRunCompletionEvent(event: DataSourceRunStateChangeEvent): Promise<void> {
        this.log.info(`DataZoneEventProcessor > dataSourceRunCompletionEvent >in  event: ${JSON.stringify(event)}`);

        validateNotEmpty(event.detail, 'eventDetails is not empty');

        const runId =event.detail.metadata.id;

        // Get the relevant run info using the run id
        const taskInput = await this.s3Utils.getTaskData(TaskType.RunDataSourceTask, runId);

        // Get the created asset
        const activities = await this.dzClient.send(new ListDataSourceRunActivitiesCommand({
            domainIdentifier: taskInput.dataAsset.catalog.domainId,
            identifier: runId
        }));

        this.log.info(`DataZoneEventProcessor > dataSourceRunCompletionEvent >activities: ${JSON.stringify(activities)}`);
        
        //update the taskEvent with the new assetId
        const assets = activities.items[0];
        taskInput.dataAsset.catalog['assetId'] = assets.dataAssetId;


            // TODO publish lineage
            //     for ( const lineage of payload.dataAsset.lineage){
            //         // Send lineage event for each asset Placeholder
            // const publishEvent = new EventBridgeEventBuilder()
            // .setEventBusName(this.eventBusName)
            // .setSource(DATA_LINEAGE_HUB_EVENT_SOURCE)
            // .setDetailType(DATA_LINEAGE_DIRECT_INGESTION_REQUEST_EVENT)
            // .setDetail(event); // 'event' needs to be replaced with proper lineage

            // await this.eventPublisher.publish(publishEvent)

        // }


        await this.sfnClient.send(new SendTaskSuccessCommand({output: JSON.stringify(taskInput), taskToken: taskInput.execution.taskToken}));

        this.log.info(`DataZoneEventProcessor > dataSourceRunCompletionEvent >exit`);
        return;
    }
}
