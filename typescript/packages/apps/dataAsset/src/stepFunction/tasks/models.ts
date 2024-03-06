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

export type DataAssetTask ={
    dataAsset:DataAsset
    execution: DataAssetExecutionDetails
}

export type DataAssetEventHandler = Handler<DataAssetEvent>;
export type DataAssetTaskHandler = Handler<DataAssetTask>;

