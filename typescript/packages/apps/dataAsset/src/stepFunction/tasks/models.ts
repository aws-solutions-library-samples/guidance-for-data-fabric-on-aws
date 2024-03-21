import type { Handler } from 'aws-lambda/handler';
import type { DataAssetCatalog, RunEvent } from '@df/events';
import type { Workflow } from "../../api/dataAssetTask/schemas.js";

export enum TaskType {
    Root = 'df_data_asset',
    DataProfileTask = 'df_data_profile',
    DataQualityProfileTask = 'df_data_quality_profile',
    RecipeTask = 'df_recipe',
    GlueCrawlerTask = 'df_glue_crawler',
    LineageTask = 'df_data_lineage',
    CreateDataSourceTask = 'df_create_data_source',
    RunDataSourceTask = 'df_run_data_source'
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
    // Hub State Machine
    hubExecutionId: string,
    hubStartTime: string;
    hubStateMachineArn: string;
    hubTaskToken: string,
    // Spoke State Machine
    spokeExecutionId?: string,
    dataProfileJob?: DataAssetJob,
    dataQualityProfileJob?: DataAssetJob,
    recipeJob?: DataAssetJob,
    dataSourceCreation?: DataAssetJob,
    dataSourceRun?: DataAssetJob,
    crawlerRun?: DataAssetJob,
    glueDeltaDetected?: boolean,
    glueTableName?: string,
    glueDatabaseName?: string
};

export type DataAssetDetails = {
    id: string,
    idcUserId: string,
    catalog: DataAssetCatalog,
    workflow: Workflow,
    execution?: DataAssetExecution,
    lineage: {
        root?: Partial<RunEvent>,
        dataProfile?: Partial<RunEvent>,
        dataQualityProfile?: Partial<RunEvent>
    }
}

export type DataAssetTaskExecutionDetails = {
    executionId: string,
    executionStartTime: string,
    stateMachineArn: string,
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
    dataAssetEvent: DataAssetDetails,
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

