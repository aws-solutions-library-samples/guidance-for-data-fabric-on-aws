import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../../models.js';


export class GlueCrawlerTask {
	constructor(private log: BaseLogger,
	) {
	}


	public async process(event: DataAssetTask): Promise<any> {
		this.log.debug(`GlueCrawlerTask > process > in > event: ${JSON.stringify(event)}`);

		// Place holder for glue crawler task

		this.log.debug(`GlueCrawlerTask > process > exit:`);

	}

}
