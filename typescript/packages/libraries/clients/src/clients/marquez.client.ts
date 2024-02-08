import { ClientServiceBase } from '../common/common.js';
import type { Lineage } from './openLineage.models.js';
import type { BaseLogger } from 'pino';
import axios from 'axios';
import { COMMON_HEADERS } from '../common/utils.js'

export class MarquezClient extends ClientServiceBase {
	private readonly marquezUrl: string;
	private readonly log: BaseLogger;

	constructor(log: BaseLogger, marquezUrl: string) {
		super();
		this.marquezUrl = marquezUrl;
		this.log = log;
	}

	public async recordLineage(lineage: Lineage): Promise<void> {
		this.log.debug(`MarquezClient > recordLineage > in > request: ${JSON.stringify(lineage)}, Url:${this.marquezUrl}/api/v1/lineage`);

			try{
                await axios.post(`${this.marquezUrl}/api/v1/lineage`, lineage, {
                    headers: {
                        ...COMMON_HEADERS,

                    }})
			}catch (err) {
				this.log.error(`MarquezClient > list > exit > error: ${err}`);
				
			}
		this.log.debug(`MarquezClient > recordLineage > exit}`);
		return;
	}


}
