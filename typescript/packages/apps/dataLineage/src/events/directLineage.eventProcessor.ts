import { validateNotEmpty } from '@df/validators';
import type { MarquezClient } from '@df/clients';
import type { BaseLogger } from 'pino';
import type { RunEvent } from '@df/events';

export class DirectLineageEventProcessor {
	constructor(
		private log: BaseLogger,
		private marquezClient: MarquezClient,
	) {
	}

	public async processDirectLineageIngestionEvent(lineage: RunEvent): Promise<void> {
		this.log.info(`EventProcessor > DirectLineageIngestion > lineage: ${JSON.stringify(lineage)}`);

		validateNotEmpty(lineage, 'lineage');
		await this.marquezClient.recordLineage(lineage);

        return;
    }
		
	

}
