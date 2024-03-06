import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../../models.js';
import { DATA_ASSET_HUB_CREATE_REQUEST_EVENT, DATA_ASSET_HUB_EVENT_SOURCE,  EventBridgeEventBuilder, EventPublisher } from '@df/events';

export class StartTask {

	constructor(
		private log: BaseLogger,
		private eventBusName: string,
		private eventPublisher: EventPublisher
	) {
	}

	public async process(event: DataAssetTask): Promise<any> {
		this.log.info(`StartTask > process > in > event: ${JSON.stringify(event)}`);
		
		// Send Job Start event
		const publishEvent = new EventBridgeEventBuilder()
			.setEventBusName(this.eventBusName)
			.setSource(DATA_ASSET_HUB_EVENT_SOURCE)
            .setDetailType(DATA_ASSET_HUB_CREATE_REQUEST_EVENT)
			.setDetail(event);

		await this.eventPublisher.publish(publishEvent)
		this.log.info(`StartTask > process > exit`);

	}

}
