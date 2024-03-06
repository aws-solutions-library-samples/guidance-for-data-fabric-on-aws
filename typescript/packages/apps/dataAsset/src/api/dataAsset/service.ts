import type { FastifyBaseLogger } from 'fastify';
import type { EditDataAsset, NewDataAsset, DataAssetListOptions, DataAsset, Catalog, Workflow, DataProfile } from './schemas.js';
import { validateNotEmpty, validateRegularExpression } from '@df/validators';
import type { DataAssetRepository } from './repository.js';
import { GetAssetCommand, type DataZoneClient, CreateAssetCommand, CreateAssetOutput, CreateAssetRevisionCommand, CreateListingChangeSetCommand } from '@aws-sdk/client-datazone';
// import { NotFoundError } from '@df/resource-api-base';
// import { EventBridgeEventBuilder, type EventPublisher, DATA_ASSET_HUB_EVENT_SOURCE, DATA_ASSET_HUB_CREATE_REQUEST_EVENT } from '@df/events';
import { getObjectArnFromUri } from '../../common/s3Utils.js';
import { AssetTypeToFormMap, ConnectionToAssetTypeMap, getConnectionType } from '../../common/utils.js';
import { ulid } from 'ulid';
import { StartExecutionCommand, type SFNClient } from '@aws-sdk/client-sfn';

export class DataAssetService {
    private readonly log: FastifyBaseLogger;
    private readonly repository: DataAssetRepository;
    private readonly dzClient: DataZoneClient;
    // private readonly eventPublisher: EventPublisher;
    // private readonly eventBusName: string;
    private readonly sfnClient: SFNClient;
    private readonly createAssetStateMachineArn:string;



    public constructor(
        log: FastifyBaseLogger,
        repository: DataAssetRepository,
        dzClient: DataZoneClient,
        // eventPublisher: EventPublisher,
        // eventBusName: string,
        sfnClient:SFNClient,
        createAssetStateMachineArn:string,
    ) {
        this.log = log;
        this.repository = repository;
        this.dzClient = dzClient;
        // this.eventPublisher = eventPublisher;
        // this.eventBusName = eventBusName;
        this.sfnClient = sfnClient;
        this.createAssetStateMachineArn = createAssetStateMachineArn;
    }


    public async create(asset: NewDataAsset): Promise<DataAsset> {
        this.log.debug(`DataAssetService > create > in asset: ${JSON.stringify(asset)}`);

        this.validateCatalog(asset.catalog);

        this.validateWorkflow(asset.workflow);

        // Set the data version to 0
        // asset.catalog['dataVersion'] = 0;

        // const dzAsset = await this.createDataZoneAsset(asset);

        const fullAsset: DataAsset = {
            requestId: ulid().toLowerCase(),
            catalog: asset.catalog,
            workflow: asset.workflow
        }

        await this.sfnClient.send(new StartExecutionCommand({ stateMachineArn: this.createAssetStateMachineArn, input: JSON.stringify(fullAsset) }));

        // Publish event
        // const event = new EventBridgeEventBuilder()
        //     .setEventBusName(this.eventBusName)
        //     .setSource(DATA_ASSET_HUB_EVENT_SOURCE)
        //     .setDetailType(DATA_ASSET_HUB_CREATE_REQUEST_EVENT)
        //     .setDetail(fullAsset);
        // await this.eventPublisher.publish(event);


        // Store record
        // await this.repository.create(fullAsset);

        this.log.debug(`DataAssetService >  create > exit`);

        return fullAsset;

    }

    public async get(dataAssetId: string): Promise<DataAsset> {
        this.log.debug(`DataAssetService > get > in dataAssetId:${dataAssetId}`);

        // 1- We first check if Asset exists in our table
        const dataAsset = await this.repository.get(dataAssetId);
        this.log.debug(`DataAssetService > get > exit`);
        return dataAsset;

    }

    public async list(options: DataAssetListOptions): Promise<void> {
        this.log.debug(`DataAssetService > list > in options:${JSON.stringify(options)}`);
        // TODO
        this.log.debug(`DataAssetService > list > exit`);

    }
    public async update(dataAssetId: string, updatedAsset: EditDataAsset): Promise<DataAsset> {
        this.log.debug(`DataAssetService > update > in dataAssetId:${dataAssetId}, asset:${JSON.stringify(updatedAsset)}`);

        const existing: DataAsset = {
            requestId : dataAssetId,
            ...updatedAsset
        }

        // Run the update step function 

        
        this.log.debug(`DataAssetService > update > exit`);
        return existing;
    }

    public async delete(dataAssetId: string): Promise<void> {
        this.log.debug(`DataAssetService > delete > in dataAssetId:${dataAssetId}`);

        this.log.debug(`DataAssetService > delete > exit`);
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

    public async createDataZoneAsset(asset: NewDataAsset): Promise<CreateAssetOutput> {
        this.log.debug(`DataAssetService > createDataZoneAsset > in asset:${JSON.stringify(asset)}`);

        const connectionType = getConnectionType(asset.workflow);
        const assetType = ConnectionToAssetTypeMap[connectionType];
        const assetFormName = AssetTypeToFormMap[assetType];

        const formsInput = [];
        if (assetFormName) {
            const input = this.createFormInput(assetFormName, asset);
            formsInput.push(input);

        }

        const result = await this.dzClient.send(new CreateAssetCommand({
            name: asset.catalog.assetName,
            domainIdentifier: asset.catalog.domainId,
            owningProjectIdentifier: asset.catalog.projectId,
            formsInput,
            typeIdentifier: assetType,
            typeRevision: (asset.catalog?.revision) ? String(asset.catalog.revision) : "1",
        }))

        let subResp = undefined;
        if (asset.catalog?.autoPublish) {
            subResp = await this.dzClient.send(new CreateListingChangeSetCommand({
                domainIdentifier: asset.catalog.domainId,
                action: 'PUBLISH',
                entityIdentifier: result.id,
                entityType: 'ASSET'
            }));
        };

        this.log.debug(`DataAssetService > createDataZoneAsset > exit subResp:${JSON.stringify(subResp)}`);
        return result;
    }


    public async updateDataZoneProfile(asset: DataAsset, profile: DataProfile): Promise<CreateAssetOutput> {
        this.log.debug(`DataAssetService > updateDataZoneProfile > profile:${JSON.stringify(profile)}`);

        // Get the current forms from the existing data zone asset
        const dzAsset = await this.dzClient.send(new GetAssetCommand({
            domainIdentifier: asset.catalog.domainId,
            identifier: asset.catalog.assetId
        }));

        const existingForms = dzAsset.formsOutput;

        const formsInput = [
            {
                formName: 'df_summary_profile_form',
                typeIdentifier: 'df_summary_profile_form',
                content: JSON.stringify(profile.summary),
            }
        ];

        for (const form of existingForms) {
            if (form.formName !== 'df_summary_profile_form') {
                const updatedForm = {
                    formName: form.formName,
                    typeIdentifier: form.typeName,
                    content: form.content
                }
                formsInput.push(updatedForm);
            }
        }

        this.log.debug(`DataAssetService > updateDataZoneProfile > formsInput ${JSON.stringify(formsInput)}`);
        // Update revisioned assets with profile metadata
        const props = {
            identifier: asset.catalog.assetId,
            name: asset.catalog.assetName,
            domainIdentifier: asset.catalog.domainId,
            formsInput
        };
        
        const assetId = await this.dzClient.send(new CreateAssetRevisionCommand(props))
        this.log.debug(`DataAssetService > updateDataZoneProfile > exit`);
        return assetId;
    }

    private createFormInput(formName: string, asset: NewDataAsset): any {
        this.log.debug(`DataAssetService > createFormInput > in formName:${formName}`);
        let input = {}
        switch (formName) {
            case 'df_s3_asset_form':
                input = {
                    formName,
                    content: JSON.stringify({
                        arn: getObjectArnFromUri(asset.workflow.dataset.connection.dataLake.s3.path),
                        accountId: asset.catalog.accountId,
                        region: asset.workflow.dataset.connection.dataLake.s3.region
                    })
                };
                break;
            case 'S3ObjectCollectionForm':
                input = {
                    formName,
                    typeIdentifier: 'amazon.datazone.S3ObjectCollectionFormType',
                    content: JSON.stringify({
                        bucketArn: getObjectArnFromUri(asset.workflow.dataset.connection.dataLake.s3.path)
                    })
                };
                break;
            default:
                break;
        }
        this.log.debug(`DataAssetService > createFormInput > exit`);
        return input;

    }

}
