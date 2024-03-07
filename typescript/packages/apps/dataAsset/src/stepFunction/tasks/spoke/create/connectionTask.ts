import type { BaseLogger } from 'pino';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import type{ DataAssetEvent } from '../../models.js';

export class ConnectionTask {

	constructor(private log: BaseLogger,		
				private sfnClient: SFNClient) {
	}

	// This step is currently a placeholder and will be implemented once we roll out support for RDS & Redshift
	public async process(event: DataAssetEvent): Promise<any> {
		this.log.info(`ConnectionTask > process > in > event: ${JSON.stringify(event)}`);

			// This task will always be successful unti RDS/Redshift integration is implemented
			await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(event), taskToken:event.execution.taskToken }));

			this.log.info(`ConnectionTask > process > exit:`);
			
	}
}
