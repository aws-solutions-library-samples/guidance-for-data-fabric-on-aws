import type { Workflow } from "../api/dataAssetTask/schemas.js";
import { S3Utils } from "./s3Utils.js";


export const ConnectionToAssetTypeMap = {
    dataLake: 'amazon.datazone.S3ObjectCollectionAssetType',
    managedRedshift: 'amazon.datazone.RedshiftViewAssetType',
    glue: 'amazon.datazone.GlueTableAssetType',
}

export const AssetTypeToFormMap = {
    'amazon.datazone.S3ObjectCollectionAssetType': 'S3ObjectCollectionForm',
    'amazon.datazone.RedshiftViewAssetType': 'RedshiftViewForm',
    'amazon.datazone.GlueTableAssetType': 'GlueTableForm'
}

export const connectionMap = {
    dataLake: {
        assetType: '',
        forms: ['GlueTableForm'],
        dataSourceType: 'GLUE'
    },
    managedRedshift: {
        assetType: '',
        dataSourceType: 'REDSHIFT'
    },
    glue: {
        assetType: 'amazon.datazone.GlueTableAssetType',
        forms: ['GlueTableForm'],
        dataSourceType: 'GLUE'
    }
}

export function getConnectionType(workflow: Workflow): string {
    const connection = workflow.dataset.connection;
    return Object.keys(connection)[0];
}

export function getResourceArn(workflow: Workflow): string {
    const connectionType = getConnectionType(workflow);
    let arn = undefined;
    switch (connectionType) {
        case 'dataLake':
            const { Bucket, Key } = S3Utils.extractObjectDetailsFromUri(workflow.dataset.connection.dataLake.s3.path);
            arn = `arn:aws:s3:::${Bucket}/${Key}`
            break;
        case 'glue':
            arn = `arn:aws:glue:${workflow.dataset.connection.glue.region}:${workflow.dataset.connection.glue.region}:table/${workflow.dataset.connection.glue.databaseName}/${workflow.dataset.connection.glue.tableName}`;
            break;
        case 'redshift':
            arn = `${workflow.name}`;
            break;
    }

    return arn;
}
