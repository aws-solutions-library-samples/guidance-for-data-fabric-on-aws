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
		this.log.info(`MarquezClient > recordLineage > in > request: ${JSON.stringify(lineage)}`);

			try{
                await axios.post(`${this.marquezUrl}/lineage`, lineage, {
                    headers: {
                        ...COMMON_HEADERS,

                    }})
			}catch (err) {
				this.log.error(`MarquezClient > list > exit > error: ${err}`);
				
			}
		this.log.info(`MarquezClient > recordLineage > exit}`);
		return;
	}


}
