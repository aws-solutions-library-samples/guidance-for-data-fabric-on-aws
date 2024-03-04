import type { Workflow } from "../api/dataAsset/schemas";


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

export function getConnectionType(workflow: Workflow ):string{
    const connection = workflow.dataset.connection;
     return Object.keys(connection)[0];	
}