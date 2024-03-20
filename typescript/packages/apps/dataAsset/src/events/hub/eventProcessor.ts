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

        validateNotEmpty(event.detail, 'event.detail');

        // Get the full payload
        const res = await axios.get(event.detail.fullPayloadSignedUrl);
        const payload: DataAssetTask = res.data;

        try {
            await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(payload), taskToken: payload.dataAsset.execution.hubTaskToken }));
        } catch (err) {
            if (err instanceof Error && err.name === 'TaskTimedOut') {
                this.log.warn(`EventProcessor> processSpokeCompletionEvent> exit > StepFunction task timed out, error: ${JSON.stringify(err)}`);
            } else {
                throw err;
            }
        }

        this.log.info(`EventProcessor > processSpokeCompletionEvent >exit`);
        return;
    }
}
