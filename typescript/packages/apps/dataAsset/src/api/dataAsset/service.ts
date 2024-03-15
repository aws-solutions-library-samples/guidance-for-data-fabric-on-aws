import type { FastifyBaseLogger } from 'fastify';
import type { DataAssetListOptions, DataAssetResource } from './schemas.js';
import { AssetItem, type DataZoneClient, GetAssetCommand, GetAssetCommandOutput, SearchCommand, SearchCommandOutput } from '@aws-sdk/client-datazone';
import { validateNotEmpty } from "@df/validators";

export class DataAssetService {

    public constructor(
        private readonly log: FastifyBaseLogger,
        private readonly dzClient: DataZoneClient,
    ) {
    }

    public async get(domainId: string, dataAssetId: string): Promise<DataAssetResource> {
        this.log.debug(`DataAssetService > get > in > domainId:${domainId}, dataAssetId:${dataAssetId}`);

        validateNotEmpty(domainId, "domainId");
        validateNotEmpty(dataAssetId, "dataAssetId");

        const getAssetResponse = await this.dzClient.send(new GetAssetCommand({
            domainIdentifier: domainId,
            identifier: dataAssetId
        }));

        this.log.debug(`DataAssetService > get > exit`);
        return this.assembleGetAssetOutput(getAssetResponse);
    }

    public async list(domainId: string, projectId: string, options: DataAssetListOptions): Promise<[DataAssetResource[], string]> {
        this.log.debug(`DataAssetService > list > in options:${JSON.stringify(options)}`);

        validateNotEmpty(domainId, "domainId");
        validateNotEmpty(projectId, "projectId");

        const searchResponses = await this.dzClient.send(new SearchCommand({domainIdentifier: domainId, owningProjectIdentifier: projectId, searchScope: 'ASSET'}))

        this.log.debug(`DataAssetService > list > exit`);

        return [this.assembleResourceList(searchResponses), searchResponses.nextToken];
    }

    private assembleResourceList(searchResponses: SearchCommandOutput): DataAssetResource[] {
        const dataAssets = [];
        for (const searchItem of searchResponses.items) {
            dataAssets.push(this.assembleSearchItemOutput(searchItem.assetItem))
        }
        return dataAssets
    }

    private assembleSearchItemOutput(dataZoneAsset: AssetItem): DataAssetResource {
        this.log.debug(`DataAssetService > assembleSearchItemOutput > in dataZoneAsset:${JSON.stringify(dataZoneAsset)}`);
        const {identifier: id, name, owningProjectId, description, domainId, createdAt, createdBy, typeRevision, typeIdentifier} = dataZoneAsset;
        this.log.debug(`DataAssetService > assembleSearchItemOutput > exit>`);
        return {
            id,
            name,
            owningProjectId,
            description,
            createdAt: createdAt.toISOString(),
            createdBy,
            domainId,
            typeIdentifier,
            typeRevision,
        };
    }

    private assembleGetAssetOutput(dataZoneAsset: GetAssetCommandOutput): DataAssetResource {
        this.log.debug(`DataAssetService > assembleGetAssetOutput > in dataZoneAsset:${JSON.stringify(dataZoneAsset)}`);
        const {id, name, owningProjectId, description, domainId, createdAt, createdBy, typeRevision, typeIdentifier} = dataZoneAsset;
        this.log.debug(`DataAssetService > assembleGetAssetOutput > exit>`);
        return {
            id,
            name,
            owningProjectId,
            description,
            createdAt: createdAt.toISOString(),
            createdBy,
            domainId,
            typeIdentifier,
            typeRevision,
        };
    }

}
