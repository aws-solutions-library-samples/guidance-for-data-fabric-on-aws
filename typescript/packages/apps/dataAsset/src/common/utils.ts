import type { Workflow } from "../api/dataAsset/schemas";


export const ConnectionToAssetTypeMap = {
    // The managed type are asset types that are place holders ATM until we determine if we need to use managed asset types or not
    dataLake: 'amazon.datazone.S3ObjectCollectionAssetType',
    managedRedshift: 'amazon.datazone.RedshiftViewAssetType',
    glue: 'amazon.datazone.GlueTableAssetType',
    customS3: 'DF_S3_Custom_Asset'
}

export const AssetTypeToFormMap = {
    DF_S3_Custom_Asset: 'df_s3_asset_form',
    'amazon.datazone.S3ObjectCollectionAssetType': 'S3ObjectCollectionForm',
    'amazon.datazone.RedshiftViewAssetType': 'RedshiftViewForm',
    'amazon.datazone.GlueTableAssetType': 'GlueTableForm'
}

export function getConnectionType(workflow: Workflow ):string{
    const connection = workflow.dataset.connection;
     return Object.keys(connection)[0];	
}