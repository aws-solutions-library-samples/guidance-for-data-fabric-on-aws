import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../../models.js';
import { TaskType } from "../../models.js";
import {
    CustomDatasetInput,
    DATA_ASSET_HUB_CREATE_REQUEST_EVENT,
    DATA_ASSET_HUB_EVENT_SOURCE,
    DATA_LINEAGE_DIRECT_HUB_INGESTION_REQUEST_EVENT,
    DATA_LINEAGE_HUB_EVENT_SOURCE,
    DataFabricInput,
    EventBridgeEventBuilder,
    EventPublisher,
    OpenLineageBuilder,
    RunEvent
} from '@df/events';
import { getConnectionType } from "../../../../common/utils.js";
import { type DataZoneClient, GetListingCommand } from '@aws-sdk/client-datazone';
import type { DataZoneInput, OpenLineageInput } from '../../../../api/dataAssetTask/schemas.js';
import type { DataZoneUserAuthClientFactory } from '../../../../plugins/module.awilix.js';

export class StartTask {

    constructor(
        private log: BaseLogger,
        private eventBusName: string,
        private eventPublisher: EventPublisher,
        private dataZoneUserAuthClientFactory: DataZoneUserAuthClientFactory
    ) {
    }

    public async process(event: DataAssetTask): Promise<any> {
        this.log.info(`StartTask > process > in > event: ${JSON.stringify(event)}`);

        const userAuthDzClient: DataZoneClient = await this.dataZoneUserAuthClientFactory.create(event.dataAsset.idcUserId, event.dataAsset.catalog.domainId);

        event.dataAsset.execution = {
            hubExecutionId: event.execution.executionId,
            hubStartTime: event.execution.executionStartTime,
            hubStateMachineArn: event.execution.stateMachineArn,
            hubTaskToken: event.execution.taskToken,
        }

        const externalInputs = await this.assembleExternalInputs(event.dataAsset.workflow.externalInputs, userAuthDzClient);
        const lineageRunStartEventPayload = this.constructLineage(event, externalInputs);
        if (!event.dataAsset.lineage) {
            event.dataAsset.lineage = {
                root: lineageRunStartEventPayload,
                /**
                 * The other lineages will be populated by the state machine in the spoke accounts
                 */
                dataProfile: {},
                dataQualityProfile: {}
            }
        }

        const openLineageEvent = new EventBridgeEventBuilder()
            .setEventBusName(this.eventBusName)
            .setSource(DATA_ASSET_HUB_EVENT_SOURCE)
            .setDetailType(DATA_ASSET_HUB_CREATE_REQUEST_EVENT)
            .setDetail(event);

        // Send Job Start event
        const publishEvent = new EventBridgeEventBuilder()
            .setEventBusName(this.eventBusName)
            .setSource(DATA_LINEAGE_HUB_EVENT_SOURCE)
            .setDetailType(DATA_LINEAGE_DIRECT_HUB_INGESTION_REQUEST_EVENT)
            .setDetail(lineageRunStartEventPayload);

        await Promise.all([
            this.eventPublisher.publish(publishEvent),
            this.eventPublisher.publish(openLineageEvent)
        ])

        this.log.info(`StartTask > process > exit`);
    }


    private async assembleExternalInputs(inputs: DataZoneInput[] | OpenLineageInput[], dzClient: DataZoneClient): Promise<DataFabricInput[]> {
        this.log.info(`StartTask > assembleExternalInputs > in > inputs: ${JSON.stringify(inputs)}`);

        const externalInputs: DataFabricInput[] = []
        if (inputs && inputs.length > 0) {
            if (inputs[0].hasOwnProperty('assetName') && inputs[0].hasOwnProperty('assetNamespace')) {
                return inputs.map(o => ({type: 'DataFabric', ...o}))
            } else {
                const getListingFutures = inputs.map(o => {
                    return dzClient.send(new GetListingCommand({domainIdentifier: o.domainId, identifier: o.assetListingId, listingRevision: o.revision}))
                })

                // TODO: add pLimit
                const results = await Promise.all(getListingFutures);
                results.forEach(r => {
                    if (r.item?.assetListing?.forms) {
                        const form = JSON.parse(r.item?.assetListing?.forms);
                        // The lineage asset name and namespace is stored inside df_profile_form
                        if (form['df_profile_form']['lineage_asset_name'] && form['df_profile_form']['lineage_asset_namespace']) {
                            externalInputs.push({
                                type: 'DataFabric',
                                assetName: form['df_profile_form']['lineage_asset_name'],
                                assetNamespace: form['df_profile_form']['lineage_asset_namespace']
                            })
                        }
                    }
                })
            }
        }
        this.log.info(`StartTask > assembleExternalInputs > exit > externalInputs: ${JSON.stringify(externalInputs)}`);
        return externalInputs;
    }


    private constructLineage(dataAssetTask: DataAssetTask, externalInputs: DataFabricInput[]): Partial<RunEvent> {
        this.log.info(`StartTask > constructLineage > in > dataAssetTask: ${JSON.stringify(dataAssetTask)}, externalInputs: ${JSON.stringify(externalInputs)}`);

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

        builder
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

        for (const externalInput of externalInputs) {
            builder.setDatasetInput(externalInput);
        }

        this.log.info(`StartTask > constructLineage > exit >`);

        return builder.build();
    }

}
