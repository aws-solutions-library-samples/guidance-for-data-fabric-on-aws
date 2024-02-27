import type { DataAssetJobStartEvent, DataAssetJobCompletionEvent } from "../common/dataAsset.models";

export interface dataAssetSpokeJobStartEvent {
    account: string,
    region: string,
    source: string,
    'detail-type': string,
    detail: DataAssetJobStartEvent,
};


export interface dataAssetSpokeJobCompletionEvent {
    account: string,
    region: string,
    source: string,
    'detail-type': string,
    detail: DataAssetJobCompletionEvent,
};

export type {dataAssetSpokeJobStartEvent as DataAssetSpokeJobStartEvent};
export type {dataAssetSpokeJobCompletionEvent as DataAssetSpokeJobCompletionEvent};