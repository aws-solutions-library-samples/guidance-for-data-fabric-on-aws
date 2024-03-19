import type { BaseLogger } from 'pino';
import { SendTaskSuccessCommand, SFNClient } from '@aws-sdk/client-sfn';
import type { DataAssetEvent } from '../../models.js';
import { TaskType } from "../../models.js";
import type { S3Utils } from "../../../../common/s3Utils.js";

export class StartTask {


    constructor(private readonly log: BaseLogger,
                private readonly sfnClient: SFNClient,
                private readonly s3Utils: S3Utils) {
    }

    // This step just normalizes the event
    public async process(event: DataAssetEvent): Promise<any> {
        this.log.info(`StartTask > process > in > event: ${JSON.stringify(event)}`);

        const dataAsset = event.dataAssetEvent;

        const {catalog} = dataAsset;

        const id = (catalog?.assetId) ? catalog.assetId : dataAsset.id;

        await Promise.all([
            this.s3Utils.putTaskData(TaskType.Root, id, {dataAsset, execution: event.execution}),
            this.sfnClient.send(new SendTaskSuccessCommand({output: JSON.stringify(event), taskToken: event.execution.taskToken}))
        ])

        this.log.info(`StartTask > process > exit:`);
    }
}
