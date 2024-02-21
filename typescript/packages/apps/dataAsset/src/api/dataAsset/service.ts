import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { FastifyBaseLogger } from 'fastify';
import type {  EditDataAsset,  NewDataAsset,  DataAssetListOptions,  DataAsset,  Catalog, Workflow } from './schemas.js';
import { validateNotEmpty, validateRegularExpression } from '@sdf/validators';
import type { DataAssetRepository } from './repository.js';
import { GetAssetCommand, type DataZoneClient, CreateAssetCommand, CreateAssetOutput } from '@aws-sdk/client-datazone';
import { NotFoundError } from '@sdf/resource-api-base';
import { EventBridgeEventBuilder, type EventPublisher, DATA_ASSET_HUB_EVENT_SOURCE, DATA_ASSET_HUB_CREATE_REQUEST_EVENT } from '@sdf/events';
import { getObjectArnFromUri } from '../../common/s3Utils.js';
import { AssetTypeToFormMap, ConnectionToAssetTypeMap, getConnectionType } from '../../common/utils.js';

export class DataAssetService {
    private readonly log: FastifyBaseLogger;
	private readonly repository: DataAssetRepository;
    private readonly sfnClient: SFNClient;
    private readonly dzClient: DataZoneClient;
    private readonly eventPublisher: EventPublisher;
    private readonly eventBusName:string;
    private readonly createAssetStateMachineArn:string;



    public constructor(
        log: FastifyBaseLogger,
		repository: DataAssetRepository,
        sfnClient:SFNClient,
        dzClient:DataZoneClient,
        eventPublisher: EventPublisher,
        eventBusName:string,
        createAssetStateMachineArn:string,
    ){
        this.log = log;
        this.repository = repository;
        this.sfnClient = sfnClient;
        this.dzClient = dzClient;
        this.eventPublisher = eventPublisher;
        this.eventBusName = eventBusName;
        this.createAssetStateMachineArn = createAssetStateMachineArn;
    }


    public async create( asset: NewDataAsset): Promise<DataAsset> {
        this.log.debug(`DataAssetService > create > in asset: ${JSON.stringify(asset)}`);
    
        // TODO Validate catalog 
        this.validateCatalog(asset.catalog);

        // TODO Validate Workflow config
        this.validateWorkflow;

        const now = new Date(Date.now()).toISOString();
        // Set the data version to 0
        asset.catalog['dataVersion'] = 0;

        const dzAsset = await this.createDataZoneAsset(asset);

        const fullAsset: DataAsset = {
            id: dzAsset.id,
            state: 'pending creation',
            version:0, // We start with version 0 and update to 1 when asset is ready to be created in datazone
            createdBy: 'TBD', //Waiting for access control integration
            createdAt: now,
            updatedBy: 'TBD', //Waiting for access control integration
            updatedAt: now,
            catalog: asset.catalog,
            workflow: asset.workflow
        } 

        this.log.debug(`DataAssetService > create > start stateMachine asset: ${JSON.stringify(fullAsset)}, stateMachineArn:${this.createAssetStateMachineArn}`);
        
        // Publish event
        const event = new EventBridgeEventBuilder()
        .setEventBusName(this.eventBusName)
        .setSource(DATA_ASSET_HUB_EVENT_SOURCE)
        .setDetailType(DATA_ASSET_HUB_CREATE_REQUEST_EVENT)
        .setDetail(fullAsset);
        await this.eventPublisher.publish(event);
        
        //always skip SFN for now
        const callStepFunction= false;
        if (callStepFunction){
            // Invoke the state machine
            await this.sfnClient.send(new StartExecutionCommand({ stateMachineArn: this.createAssetStateMachineArn, input: JSON.stringify(fullAsset) }));
        }
        

        // Store record
        await this.repository.create(fullAsset);

        this.log.debug(`DataAssetService >  create > exit`);

        return fullAsset;
    
    }

    public async get( dataAssetId:string): Promise<DataAsset> {
        this.log.debug(`DataAssetService > get > in dataAssetId:${dataAssetId}`);

        const dataAsset = await this.repository.get(dataAssetId);
        this.log.debug(`DataAssetService > get > exit`);
        return dataAsset;
    
    }

    public async list(options:DataAssetListOptions): Promise<void> {
        this.log.debug(`DataAssetService > list > in options:${JSON.stringify(options)}`);

        this.log.debug(`DataAssetService > list > exit`);
    
    }
    public async update(dataAssetId: string, asset: EditDataAsset): Promise<DataAsset> {
        this.log.debug(`DataAssetService > edit > in dataAssetId:${dataAssetId}, asset:${JSON.stringify(asset)}`);

        const dataAsset = await this.repository.get(dataAssetId);

        // id Asset Id exists validate against data zone 
        if (dataAsset?.catalog?.assetId){
            //TODO validate asset data against data zone
            const dzAsset = await this.dzClient.send(new GetAssetCommand({
                domainIdentifier: asset.catalog.domainId,
                identifier: asset.catalog.assetId
            }));
            if(!dzAsset){
                throw new NotFoundError(`Asset not found in Data Zone !!!`)
            }
        }
        

        this.log.debug(`DataAssetService > edit > exit`);
        return dataAsset;
    }

    public async delete( dataAssetId:string): Promise<void> {
        this.log.debug(`DataAssetService > delete > in dataAssetId:${dataAssetId}`);

        this.log.debug(`DataAssetService > delete > exit`);
    }

    private validateCatalog(catalog:Catalog){
        validateNotEmpty(catalog, "catalog");
        validateNotEmpty(catalog.domainId, "domain Id");
        validateNotEmpty(catalog.projectId, "projectId");
        validateRegularExpression( catalog.projectId, "projectId", "^[a-zA-Z0-9_-]{1,36}$" )
        validateNotEmpty(catalog.assetName, "assetName");
        validateNotEmpty(catalog.accountId, "accountId");
        validateNotEmpty(catalog.autoPublish, "autoPublish");
                
    }

    private validateWorkflow(workflow:Workflow){
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

    public async createDataZoneAsset(asset:NewDataAsset) : Promise<CreateAssetOutput>{
        this.log.debug(`DataAssetService > createDataZoneAsset > in asset:${JSON.stringify(asset)}`);
        
        const connectionType = getConnectionType( asset.workflow);
        const assetType = ConnectionToAssetTypeMap[connectionType];
        const assetFormName = AssetTypeToFormMap[assetType];

        // TODO Forms input must be dynamically constructed from the available connections
        const formsInput= [];
        if(assetFormName){
            const input = this.createFormInput(assetFormName, asset);
            formsInput.push(input);
            // formsInput.push({
            //     formName: assetForm,
            //     content: JSON.stringify({
            //         arn: getObjectArnFromUri(asset.workflow.dataset.connection.dataLake.s3.path),
            //         accountId: asset.catalog.accountId,
            //         region: asset.workflow.dataset.connection.dataLake.s3.region
            //     })
            // })
        }

        this.log.debug(`DataAssetService > createDataZoneAsset > formsInput ${JSON.stringify(formsInput)}`);
        const assetId = await this.dzClient.send(new CreateAssetCommand({
            name: asset.catalog.assetName,
            domainIdentifier: asset.catalog.domainId,
            owningProjectIdentifier: asset.catalog.projectId,
            formsInput,
            typeIdentifier: assetType,
            typeRevision: (asset.catalog?.revision)? String(asset.catalog.revision):"1",
        }))
        this.log.debug(`DataAssetService > createDataZoneAsset > exit`);
        return assetId;
    }

    private createFormInput(formName:string, asset:NewDataAsset): any{
        let input = {}
        switch (formName) {
            case 'sdf_s3_asset_form':
				input = {
                    formName,
                    content: JSON.stringify({
                        arn: getObjectArnFromUri(asset.workflow.dataset.connection.dataLake.s3.path),
                        accountId: asset.catalog.accountId,
                        region: asset.workflow.dataset.connection.dataLake.s3.region
                    })
                };
				break;
            default:
                break;
        }
        return input;

    }

}
