import type { DataAssetJobEvent } from '@df/events';
import { validateNotEmpty } from '@df/validators';
import type { BaseLogger } from 'pino';
import type { DataAssetService } from '../api/dataAsset/service';

export class JobEventProcessor {
	constructor(
		private log: BaseLogger,
		private dataAssetService: DataAssetService
	) {
	}

	public async jobStartEvent(event: DataAssetJobEvent): Promise<void> {
		this.log.info(`JobEventProcessor > jobStartEvent > event: ${JSON.stringify(event)}`);

		validateNotEmpty(event, 'Job start event');

		const dataAsset = await this.dataAssetService.get(event.dataAsset.id);
		if( !dataAsset?.execution ){
			dataAsset['execution'] = {};
		}
		dataAsset.execution.jobRunId = event.job.jobRunId;
		dataAsset.execution.jobRunStatus = event.job.jobRunStatus;
		dataAsset.execution.jobStartTime = event.job.jobStartTime;
		await this.dataAssetService.update(dataAsset.id,dataAsset);

        return;
    }
		
	

}