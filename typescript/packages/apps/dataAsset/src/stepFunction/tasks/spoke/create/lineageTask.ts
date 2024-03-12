import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type{ DataAssetTask } from '../../models.js';
import type { EventPublisher } from '@df/events/dist/publisher.js';
import { DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT, DATA_ASSET_SPOKE_EVENT_SOURCE, EventBridgeEventBuilder } from '@df/events';

export class LineageTask {

	constructor(private log: BaseLogger,		
				private sfnClient: SFNClient,
				private eventBusName: string,
				private eventPublisher: EventPublisher) {
	}

	// Finalize the lineage payload and publish the response event
	public async process(event: DataAssetTask): Promise<any> {
		this.log.info(`LineageTask > process > in > event: ${JSON.stringify(event)}`);

		const asset = event.dataAsset;

		const publishEvent = new EventBridgeEventBuilder()
			.setEventBusName(this.eventBusName)
			.setSource(DATA_ASSET_SPOKE_EVENT_SOURCE)
			.setDetailType(DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT)
			.setDetail(asset);

		await this.eventPublisher.publish(publishEvent);


		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken:event.execution.taskToken }));
		this.log.info(`LineageTask > process > exit:`);
			
	}
}
