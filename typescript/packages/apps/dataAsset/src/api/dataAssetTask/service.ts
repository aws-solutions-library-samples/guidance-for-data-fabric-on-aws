import type { FastifyBaseLogger } from 'fastify';
import type { Catalog, DataAssetTaskResource, DataAssetTaskResourceListOptions, NewDataAssetTaskResource, Workflow } from './schemas.js';
import { validateNotEmpty, validateRegularExpression } from '@df/validators';
import { ulid } from 'ulid';
import { type SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { SecurityContext } from "../../common/scopes.js";
import type { DataAssetTaskRepository } from "./repository.js";
import { NotFoundError } from "@df/resource-api-base";
import { DataZoneClient, GetDomainCommand } from "@aws-sdk/client-datazone";
import {GetUserIdCommand} from "@aws-sdk/client-identitystore";
import type { IdentityStoreClientFactory } from '../../plugins/module.awilix.js';

export class DataAssetTasksService {

    public constructor(
        private readonly log: FastifyBaseLogger,
        private readonly sfnClient: SFNClient,
        private readonly createAssetStateMachineArn: string,
        private readonly dataAssetTaskRepository: DataAssetTaskRepository,
        private readonly dataZoneClient: DataZoneClient,
        private readonly identityStoreClientFactory: IdentityStoreClientFactory,
        private readonly identityStoreId: string,
    ) {
    }

    public async create(securityContext: SecurityContext, asset: NewDataAssetTaskResource): Promise<DataAssetTaskResource> {
        this.log.debug(`DataAssetTaskService > create > in > securityContext: ${securityContext}, asset: ${JSON.stringify(asset)}`);

        validateNotEmpty(securityContext, "securityContext");
        validateNotEmpty(securityContext.userId, "securityContext.userId");

        this.validateCatalog(asset.catalog);
        this.validateWorkflow(asset.workflow);

        const cognitoUserId = securityContext.userId;
        const identityStoreClient = await this.identityStoreClientFactory.create();
        const identityStoreUserId = await identityStoreClient.send(
            new GetUserIdCommand({
              IdentityStoreId: this.identityStoreId,
              AlternateIdentifier: {
                UniqueAttribute: {
                  AttributePath: "Username",
                  AttributeValue: cognitoUserId,
                },
              },
            })
          );
    
        const fullAsset: DataAssetTaskResource = {
            id: ulid().toLowerCase(),
            idcUserId: identityStoreUserId.UserId,
            catalog: asset.catalog,
            workflow: asset.workflow
        }


        const domain = await this.dataZoneClient.send(new GetDomainCommand({identifier: asset.catalog.domainId}));
        fullAsset.catalog.domainName = domain.name;


        await this.sfnClient.send(new StartExecutionCommand({stateMachineArn: this.createAssetStateMachineArn, input: JSON.stringify(fullAsset)}));
        await this.dataAssetTaskRepository.create(securityContext.userId, fullAsset);

        this.log.debug(`DataAssetTaskService >  create > exit`);
        return fullAsset;
    }

    public async get(securityContext: SecurityContext, dataAssetId: string): Promise<DataAssetTaskResource> {
        this.log.debug(`DataAssetTaskService > get > in dataAssetId:${dataAssetId}`);

        validateNotEmpty(securityContext, "securityContext");
        validateNotEmpty(securityContext.userId, "securityContext.userId");
        validateNotEmpty(dataAssetId, "dataAssetId");

        const dataAsset = await this.dataAssetTaskRepository.get(securityContext.userId, dataAssetId);
        if (!dataAsset) {
            throw new NotFoundError(`Data Asset Task ${dataAssetId} not found`)
        }
        this.log.debug(`DataAssetTaskService > get > exit`);
        return dataAsset;
    }

    public async list(securityContext: SecurityContext, options: DataAssetTaskResourceListOptions): Promise<[DataAssetTaskResource[], string]> {
        this.log.debug(`DataAssetTaskService > list > in options:${JSON.stringify(options)}`);

        validateNotEmpty(securityContext, "securityContext");
        validateNotEmpty(securityContext.userId, "securityContext.userId");

        const [tasks, lastEvaluatedKey] = await this.dataAssetTaskRepository.list(securityContext.userId, options);
        this.log.debug(`DataAssetTaskService > list > exit`);
        return [tasks, lastEvaluatedKey ? lastEvaluatedKey : undefined]
    }

    private validateCatalog(catalog: Catalog) {
        validateNotEmpty(catalog, "catalog");
        validateNotEmpty(catalog.domainId, "domain Id");
        validateNotEmpty(catalog.projectId, "projectId");
        validateRegularExpression(catalog.projectId, "projectId", "^[a-zA-Z0-9_-]{1,36}$")
        validateNotEmpty(catalog.assetName, "assetName");
        validateNotEmpty(catalog.accountId, "accountId");
        validateNotEmpty(catalog.autoPublish, "autoPublish");

    }

    private validateWorkflow(workflow: Workflow) {
        validateNotEmpty(workflow, "workflow");
        validateNotEmpty(workflow.name, "workflow name");
        validateNotEmpty(workflow.dataset, "workflow dataset");
        validateNotEmpty(workflow.dataset.name, "dataset name");
        validateNotEmpty(workflow.dataset.format, "dataset format");
        // TODO Validate Connections
        // TODO Validate transforms
        // TODO Validate schedule
        // TODO validate Profile

    }
}
