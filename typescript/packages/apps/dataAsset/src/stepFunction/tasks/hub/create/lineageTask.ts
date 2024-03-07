import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../../models.js';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import { DATA_LINEAGE_DIRECT_INGESTION_REQUEST_EVENT, DATA_LINEAGE_HUB_EVENT_SOURCE, EventBridgeEventBuilder, type EventPublisher } from '@df/events';
export class LineageTask {

	constructor(
		private log: BaseLogger,
		private sfnClient: SFNClient,
		private eventBusName: string,
		private eventPublisher: EventPublisher
	) {
	}

	public async process(event: DataAssetTask): Promise<any> {
		this.log.info(`LineageTask > process > in > event: ${JSON.stringify(event)}`);
		
		// Construct the asset lineage for all created assets 

		// Send lineage event for each asset Placeholder
		const publishEvent = new EventBridgeEventBuilder()
			.setEventBusName(this.eventBusName)
			.setSource(DATA_LINEAGE_HUB_EVENT_SOURCE)
            .setDetailType(DATA_LINEAGE_DIRECT_INGESTION_REQUEST_EVENT)
			.setDetail(event); // 'event' needs to be replaced with proper lineage

		await this.eventPublisher.publish(publishEvent)

		this.log.info(`LineageTask > process > exit`);
		await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken: event.execution.taskToken }));

	}

}
