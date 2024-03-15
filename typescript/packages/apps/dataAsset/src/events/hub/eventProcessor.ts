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

    public async processSpokeCompletionEvent(event: CreateResponseEvent): Promise<void> {
        this.log.info(`EventProcessor > processSpokeCompletionEvent >in  event: ${JSON.stringify(event)}`);

        validateNotEmpty(event.detail, 'eventDetails is not empty');

        // Get the full payload
        const fullPayload:DataAssetTask = await axios.get(event.detail.fullPayloadSignedUrl);       
        this.log.info(`EventProcessor > processSpokeCompletionEvent >  fullPayload: ${fullPayload}`);
        this.log.info(`EventProcessor > processSpokeCompletionEvent >  fullPayload: ${JSON.stringify(fullPayload)}`);

        await this.sfnClient.send(new SendTaskSuccessCommand({output: JSON.stringify(fullPayload), taskToken: fullPayload.execution.taskToken}));

        this.log.info(`EventProcessor > processSpokeCompletionEvent >exit`);
        return;
    }
}
