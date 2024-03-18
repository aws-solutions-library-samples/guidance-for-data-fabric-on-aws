import type { Handler } from 'aws-lambda/handler';
import type { DataAssetCatalog, RunEvent } from '@df/events';
import type { Workflow } from "../../api/dataAssetTask/schemas.js";

export enum TaskType {
    DataProfileTask = 'df_data_profile',
    DataQualityProfileTask = 'DataQualityProfileTask',
    RecipeTask = 'df_recipe',
    GlueCrawlerTask = 'df_glue_crawler',
    CreateDataSourceTask = 'df_create_data_source',
    lineageTask = 'lineageTask'

}

export type DataAssetJob = {
    id: string,
    startTime?: string,
    stopTime?: string,
    status?: string,
    message?: string,
    outputPath?: string
};

export type DataAssetExecution = {
    hubExecutionArn: string,
    hubTaskToken: string,
    spokeExecutionArn?: string,
    dataProfileJob?: DataAssetJob,
    dataQualityProfileJob?: DataAssetJob,
    recipeJob?: DataAssetJob,
    dataSourceRun?: DataAssetJob,
    crawlerRun?: DataAssetJob,
    glueDeltaDetected?: boolean,
    glueTableName?: string,
    glueDatabaseName?: string
};

export type DataAssetDetails = {
    id: string,
    catalog: DataAssetCatalog,
    workflow: Workflow,
    execution?: DataAssetExecution,
    lineage?: Record<string, Partial<RunEvent>>
}

export type DataAssetTaskExecutionDetails = {
    executionArn: string,
    executionStartTime: string,
    taskToken?: string
}

export type DataAssetEventBridgeEvent = {
    "detail-type": string,
    source: string,
    account: string,
    region: string,
    detail: DataAssetDetails
}

export type DataAssetEvent = {
    dataAssetEvent: DataAssetEventBridgeEvent,
    execution?: DataAssetTaskExecutionDetails
}

export type DataAssetTask = {
    dataAsset: DataAssetDetails
    execution?: DataAssetTaskExecutionDetails
}

export type DataAssetTasks = {
    dataAssets: DataAssetDetails[]
    execution?: DataAssetTaskExecutionDetails
}


export type DataAssetEventHandler = Handler<DataAssetEvent>;
export type DataAssetTaskHandler = Handler<DataAssetTask>;
export type DataAssetTasksHandler = Handler<DataAssetTasks>;

