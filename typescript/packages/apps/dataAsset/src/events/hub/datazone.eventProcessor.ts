import type { CreateResponseEvent } from '@df/events';
import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';
import { SendTaskSuccessCommand, type SFNClient } from '@aws-sdk/client-sfn';
import type { DataAssetTask } from '../../stepFunction/tasks/models.js';
import axios from 'axios';

export class EventProcessor {
    constructor(
        private log: BaseLogger,
        private sfnClient: SFNClient
    ) {
    }

    public async processRunCompletionEvent(event: CreateResponseEvent): Promise<void> {
        this.log.info(`DataZoneEventProcessor > processRunCompletionEvent >in  event: ${JSON.stringify(event)}`);

        validateNotEmpty(event.detail, 'eventDetails is not empty');

        // Get the full payload
        const res = await axios.get(event.detail.fullPayloadSignedUrl);  
        const payload:DataAssetTask = res.data;    

        // TODO publish lineage

        await this.sfnClient.send(new SendTaskSuccessCommand({output: JSON.stringify(payload), taskToken: payload.dataAsset.execution.hubTaskToken}));

        this.log.info(`DataZoneEventProcessor > processRunCompletionEvent >exit`);
        return;
    }
}
