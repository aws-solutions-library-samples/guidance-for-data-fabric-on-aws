import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';

export class DataAssetEventProcessor {
	constructor(
		private log: BaseLogger
	) {
	}

	public async processDataAssetSpokeCreateResponseEvent(dataAssetResponse: any): Promise<void> {
		this.log.info(`EventProcessor > processDataAssetSpokeCreateResponseEvent > lineage: ${JSON.stringify(dataAssetResponse)}`);

		validateNotEmpty(dataAssetResponse, 'lineage');

        return;
    }
		
	

}