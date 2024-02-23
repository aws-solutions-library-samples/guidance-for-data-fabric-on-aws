export type DataAssetCatalog = {
    domainId: string,
    projectId: string,
    assetName: string,
    assetId?: string,
    accountId: string,
    autoPublish: boolean
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
    hubExecutionArn?: string ,
    spokeExecutionArn?: string,
    jobRunId?: string,
    jobRunStatus?: string,
    jobStartTime?: string 
    jobStopTime?: string 
};

export type DataAsset = {
    id: string,
    state: string,
    version?: number,
    createdBy: string,
    createdAt: string,
    updatedBy?: string,
    updatedAt?: string,
    execution?: DataAssetExecution,
    catalog: DataAssetCatalog,
    workflow: DataAssetWorkflow
};

export type JobExecution = {
    jobRunId?: string,
    jobRunStatus?: string,
    jobStartTime?: string, 
    jobStopTime?: string 
};

export type DataAssetJobEvent = {
    dataAsset: DataAsset,
    job: JobExecution
};