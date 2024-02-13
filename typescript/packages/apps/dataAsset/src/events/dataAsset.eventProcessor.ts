import { validateNotEmpty } from '@sdf/validators';
import type { BaseLogger } from 'pino';

export class DataAssetEventProcessor {
	constructor(
		private log: BaseLogger,
	) {
	}

	public async processDataAssetResponseEvent(dataAssetResponse: any): Promise<void> {
		this.log.info(`EventProcessor > ProcessDataAssetResponseEvent > lineage: ${JSON.stringify(dataAssetResponse)}`);

		validateNotEmpty(dataAssetResponse, 'lineage');

        return;
    }
		
	

}