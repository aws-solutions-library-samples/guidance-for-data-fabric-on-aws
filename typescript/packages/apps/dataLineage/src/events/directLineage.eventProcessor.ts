import { validateNotEmpty } from '@sdf/validators';
import type { MarquezClient, Lineage } from '@sdf/clients';
import type { BaseLogger } from 'pino';

export class DirectLineageEventProcessor {
	constructor(
		private log: BaseLogger,
		private marquezClient: MarquezClient,
	) {
	}

	public async processDirectLineageIngestionEvent(lineage: Lineage): Promise<void> {
		this.log.info(`EventProcessor > DirectLineageIngestion > lineage: ${JSON.stringify(lineage)}`);

		validateNotEmpty(lineage, 'lineage');
		await this.marquezClient.recordLineage(lineage);

        return;
    }
		
	

}
