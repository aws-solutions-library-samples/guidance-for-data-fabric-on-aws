import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../../models.js';
import { TaskType } from "../../models.js";
import { CustomDatasetInput, DATA_ASSET_HUB_CREATE_REQUEST_EVENT, DATA_ASSET_HUB_EVENT_SOURCE, EventBridgeEventBuilder, EventPublisher, OpenLineageBuilder, RunEvent } from '@df/events';
import { getConnectionType } from "../../../../common/utils.js";

export class StartTask {

    constructor(
        private log: BaseLogger,
        private eventBusName: string,
        private eventPublisher: EventPublisher
    ) {
    }

    public async process(event: DataAssetTask): Promise<any> {
        this.log.info(`StartTask > process > in > event: ${JSON.stringify(event)}`);

        event.dataAsset.execution = {
            hubExecutionId: event.execution.executionId,
            hubStartTime: event.execution.executionStartTime,
            hubStateMachineArn: event.execution.stateMachineArn,
            hubTaskToken: event.execution.taskToken,
        }

        const lineageEvent = this.constructLineage(event);

        this.log.info(`StartTask > process > rootStartEvent: ${JSON.stringify(lineageEvent)}`);

        // Send Job Start event
        const publishEvent = new EventBridgeEventBuilder()
            .setEventBusName(this.eventBusName)
            .setSource(DATA_ASSET_HUB_EVENT_SOURCE)
            .setDetailType(DATA_ASSET_HUB_CREATE_REQUEST_EVENT)
            .setDetail(event);

        await this.eventPublisher.publish(publishEvent)

        this.log.info(`StartTask > process > exit`);
    }

    private constructLineage(dataAssetTask: DataAssetTask): Partial<RunEvent> {
        const asset = dataAssetTask.dataAsset;
        const {workflow} = asset

        const customInput: CustomDatasetInput = {
            type: 'Custom',
            storage: {
                fileFormat: asset.workflow?.dataset?.format,
                storageLayer: getConnectionType(asset.workflow)
            },
            name: workflow.dataset.name,
            dataSource: workflow?.dataset?.dataSource,
            producer: dataAssetTask.dataAsset.execution.hubStateMachineArn,
        };

        const builder = new OpenLineageBuilder();

        return builder
            .setContext(asset.catalog.domainId, asset.catalog.domainName, asset.execution.hubStateMachineArn)
            .setJob(
                {
                    jobName: TaskType.Root,
                    assetName: asset.catalog.assetName
                })
            .setDatasetInput(customInput)
            .setStartJob(
                {
                    executionId: asset.execution.hubExecutionId,
                    startTime: asset.execution.hubStartTime
                })
            .build();
    }

}
