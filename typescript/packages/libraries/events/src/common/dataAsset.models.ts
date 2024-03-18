import type { OpenLineageBuilder } from "../open-lineage/builder"

export type DataAssetCatalog = {
    domainId: string,
    domainName: string,
    projectId?: string,
    environmentId: string,
    region?: string,
    assetName: string,
    assetId?: string,
    accountId: string,
    autoPublish?: boolean
}

export type DataAssetDataLakeConnection ={
    s3: {
        path: string,
        region: string
    }
}

export type DataAssetGlueConnection = {
    accountId: string,
    region: string,
    databaseName: string,
    tableName: string,
};

export type DataAssetConnection = {
    dataLake?: DataAssetDataLakeConnection,
    glue?: DataAssetGlueConnection
};

export type DataAssetDataset = {
    name: string,
    format,
    connectionId?: string,
    connection?: DataAssetConnection,

}

export type DataAssetSampling ={
    // TODO to be implemented
};

export type DataAssetTransforms = {
    // TODO to be implemented
};

export type DataAssetSchedule = {
    // TODO to be implemented
};

export type DataAssetProfile = {
    // TODO to be implemented
};

export type DataAssetTags = {
    [k: string]: string;
}

export type DataAssetWorkflow = {
    name: string,
    roleArn: string,
    dataset:DataAssetDataset,
    sampling?: DataAssetSampling,
    transforms?: DataAssetTransforms,
    tags?: DataAssetTags,
};

export type DataAssetExecution = {
    hubExecutionArn: string ,
    hubTaskToken: string ,
    spokeExecutionArn?: string,
    id?: string,
    status?: string,
    startTime?: string 
    stopTime?: string 
    message?:string;
};

export type DataAsset = {
    id: string,
    execution?: DataAssetExecution,
    catalog: DataAssetCatalog,
    workflow: DataAssetWorkflow,
    lineage?: OpenLineageBuilder[]
};

export type JobExecution = {
    assetId?: string,
    id?:string,
    jobRunId?: string,
    jobRunStatus?: string,
    jobStartTime?: string, 
    jobStopTime?: string, 
    message?:string,
    profileLocation?: string,
    profileSignedUrl?: string
};

export type DataAssetJobStartEvent = {
    dataAsset: DataAsset,
    job: JobExecution
};

export type DataAssetJobCompletionEvent = {
    dataAsset:{
        catalog:DataAssetCatalog
    }
    job: JobExecution
};

export type DataAssetCrawlerCompletionEvent = {
    dataAsset:{
        catalog:DataAssetCatalog
    }
    crawler: JobExecution
};

export type DataAssetCreateCompletionEvent = {
    dataAsset: DataAsset,
};