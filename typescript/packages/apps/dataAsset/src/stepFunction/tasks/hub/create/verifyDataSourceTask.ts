import type { BaseLogger } from 'pino';
import type { DataAssetTask } from '../../models.js';
import { GetDataSourceCommand } from '@aws-sdk/client-datazone';
import type { DataZoneUserAuthClientFactory } from '../../../../plugins/module.awilix.js';

export class VerifyDataSourceTask {

    constructor(
        private log: BaseLogger,
        private dataZoneClientFactory: DataZoneUserAuthClientFactory
    ) {}

    public async process(event: DataAssetTask): Promise<any> {
        this.log.info(`VerifyDataSourceTask > process > in > event: ${JSON.stringify(event)}`);

        const dataZoneClient = await this.dataZoneClientFactory.create(event.dataAsset.idcUserId, event.dataAsset.catalog.domainId);
        const dataSource = await dataZoneClient.send(new GetDataSourceCommand({
            domainIdentifier: event.dataAsset.catalog.domainId,
            identifier: event.dataAsset.execution.dataSourceCreation.id
        }));


        event.dataAsset.execution.dataSourceCreation.status = dataSource.status;

        this.log.info(`VerifyDataSourceTask > process > exit`);
        return event;
    }

}
