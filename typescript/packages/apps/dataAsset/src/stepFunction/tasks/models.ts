import type { Handler } from 'aws-lambda/handler';
import type {DataAsset } from '../../api/dataAsset/schemas';


export type DataAssetExecutionDetails = {
    executionArn: string,
    executionStartTime: string,
    taskToken?: string
}

export type DataAssetEventBridgeEvent ={
    "detail-type":string,
    source:string,
    account:string,
    region: string,
    detail: DataAsset
}

export type DataAssetEvent = {
    dataAssetEvent: DataAssetEventBridgeEvent,
    execution: DataAssetExecutionDetails
}


export type ConnectionTaskHandler = Handler<DataAssetEvent>;
export type DataBrewTaskHandler = Handler<DataAssetEvent>;
export type DataSetTaskHandler = Handler<DataAssetEvent>;
export type RunJobTaskHandler = Handler<DataAssetEvent>;
