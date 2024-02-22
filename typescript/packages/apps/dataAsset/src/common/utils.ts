import type { Workflow } from "../api/dataAsset/schemas";


export const ConnectionToAssetTypeMap = {
    // The managed type are asset types that are place holders ATM until we determine if we need to use managed asset types or not
    managedS3: 'amazon.datazone.S3ObjectCollectionAssetType',
    managedRedshift: 'amazon.datazone.RedshiftViewAssetType',

    glue: 'amazon.datazone.GlueTableAssetType',
    dataLake: 'DF_S3_Custom_Asset'
}

export const AssetTypeToFormMap = {
    DF_S3_Custom_Asset: 'df_s3_asset_form'
}

export function getConnectionType(workflow: Workflow ):string{
    const connection = workflow.dataset.connection;
     return Object.keys(connection)[0];	
}