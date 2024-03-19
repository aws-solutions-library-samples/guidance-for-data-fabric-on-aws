import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';
import { SendTaskSuccessCommand, type SFNClient } from '@aws-sdk/client-sfn';
import { TaskType } from '../../stepFunction/tasks/models.js';
// import { DATA_LINEAGE_DIRECT_INGESTION_REQUEST_EVENT, DATA_LINEAGE_HUB_EVENT_SOURCE } from '@df/events/dist/index.js';
import type { S3Utils } from '../../common/s3Utils.js';

export class DataZoneEventProcessor {
    constructor(
        private log: BaseLogger,
        private sfnClient: SFNClient,
        private s3Utils: S3Utils
    ) {
    }

    public async dataSourceRunCompletionEvent(event: any): Promise<void> {
        this.log.info(`DataZoneEventProcessor > dataSourceRunCompletionEvent >in  event: ${JSON.stringify(event)}`);

        validateNotEmpty(event.detail, 'eventDetails is not empty');

        // Get the relevant Job and tags to link it back to the Data Zone asset



        const taskInput = await this.s3Utils.getTaskData(TaskType.DataProfileTask, event.detail.id);

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
