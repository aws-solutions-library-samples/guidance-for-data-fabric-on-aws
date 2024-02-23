import type { FastifyBaseLogger } from 'fastify';
import type { DataAsset } from './schemas.js';
import { DynamoDBDocumentClient, GetCommand, GetCommandInput,QueryCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { createDelimitedAttribute, DynamoDbUtils, expandDelimitedAttribute } from '@df/dynamodb-utils';
import { PkType } from '../../common/pkUtils.js';

export class DataAssetRepository {
	public constructor(private log: FastifyBaseLogger, private dc: DynamoDBDocumentClient, private tableName: string, private dynamoDbUtils: DynamoDbUtils) {
	}

	private assemble(i: Record<string, any>): DataAsset {
		const pk = expandDelimitedAttribute(i['pk']);
		return {
			id: pk?.[1] as string,
            state: i['state'],
            version: i['version'],
			createdAt: i['createdAt'],
			createdBy: i['createdBy'],
			updatedBy: i['updatedBy'],
			updatedAt: i['updatedAt'],
            catalog: i['catalog'],
			workflow: i['workflow']
		};
	}

	public async get(id: string): Promise<DataAsset> {
		this.log.debug(`DataAssetRepository> get> id:${id}`);

		const dataAssetId = createDelimitedAttribute(PkType.DataAsset, id);
		
		const params: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: dataAssetId,
				sk: dataAssetId
			},
		};
		this.log.debug(`DataAssetRepository> get> params: ${JSON.stringify(params)}`);
		const response = await this.dc.send(new GetCommand(params));
		this.log.debug(`DataAssetRepository> get> response: ${JSON.stringify(response)}`);
		if (response.Item === undefined) {
			this.log.debug(`DataAssetRepository> get> early exit: undefined`);
			return undefined;
		}

		// assemble before returning
		const dataAsset = this.assemble(response.Item);

		this.log.debug(`DataAssetRepository> get> exit:${JSON.stringify(dataAsset)}`);
		return dataAsset;
	}


	public async create(dataAsset: DataAsset): Promise<void> {
		this.log.info(`DataAssetRepository> create> dataAsset:${JSON.stringify(dataAsset)}`);
		const assetId = createDelimitedAttribute(PkType.DataAsset, dataAsset.id);
		const dataZoneAssetName = createDelimitedAttribute(PkType.DataZoneAsset, dataAsset.catalog.assetName);
		const jobName = createDelimitedAttribute(PkType.JobName, dataAsset.catalog.accountId, dataAsset.workflow.name);
		const params = {
			TableName: this.tableName,
			Item:{
				pk: assetId,
				sk: assetId,
				siKey1: dataZoneAssetName,
				siKey2: jobName,
                ...dataAsset
            }
		};

		try {
			const response = await this.dynamoDbUtils.put(params);
			this.log.debug(`DataAssetRepository> create> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				this.log.error(err);
				throw err;
			}
		}
		this.log.info(`DataAssetRepository> create> exit`);
	}

    public async delete(id: string): Promise<void> {
		this.log.debug(`DataAssetRepository> delete> id:${id}`);

		// keys
		const dataAssetId = createDelimitedAttribute(PkType.DataAsset, id);

		// list all items directly relating to the calculation
		const params = {
			TableName: this.tableName,
			KeyConditionExpression: `#hash=:hash`,
			ExpressionAttributeNames: {
				'#hash': 'pk',
			},
			ExpressionAttributeValues: {
				':hash': dataAssetId,
			},
		};


			this.log.debug(`DataAssetRepository> delete> params1:${JSON.stringify(params)}`);
			const data = await this.dc.send(new QueryCommand(params));
			this.log.debug(`DataAssetRepository> delete> data:${JSON.stringify(data)}`);
			

		this.log.debug(`DataAssetRepository> delete> exit`);

	}

	public async update(dataAsset: DataAsset): Promise<void> {
		this.log.debug(`DataAssetRepository> update> dataAsset:${JSON.stringify(dataAsset)}`);
		
		const assetId = createDelimitedAttribute(PkType.DataAsset, dataAsset.id);
		const exp  = this.GenerateUpdateExpression(dataAsset);

		const params:UpdateCommandInput = {
			TableName: this.tableName,
			Key:{
				pk: assetId,
				sk: assetId,
            },
			UpdateExpression : exp.UpdateExpression,
			ExpressionAttributeNames: exp.ExpressionAttributeNames,
			ExpressionAttributeValues: expandDelimitedAttribute
		};
	
		try {
			const response = await this.dynamoDbUtils.update(params);
			this.log.debug(`DataAssetRepository> update> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				
					this.log.error(`DataAssetRepository> update> err> ${JSON.stringify((err))}`);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		this.log.debug(`DataAssetRepository> update> exit`);
	}

	private GenerateUpdateExpression(object:any) {
		let exp = {
			UpdateExpression: 'set',
			ExpressionAttributeNames: {},
			ExpressionAttributeValues: {}
		};
		for (const [key, value] of Object.entries(object)) {
			exp.UpdateExpression += ` #${key} = :${key},`;
			exp.ExpressionAttributeNames[`#${key}`] = key;
			exp.ExpressionAttributeValues[`:${key}`] = value;
		};
		// remove trailing comma
		exp.UpdateExpression = exp.UpdateExpression.slice(0, -1);
		return exp
	}
}

