import type { DataAssetJobStartEvent, DataAssetJobCompletionEvent, DataAssetCreateCompletionEvent } from "../common/dataAsset.models";

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

export interface dataAssetSpokeCreateResponseEvent {
    account: string,
    region: string,
    source: string,
    'detail-type': string,
    detail: DataAssetCreateCompletionEvent,
};

export type {dataAssetSpokeJobStartEvent as DataAssetSpokeJobStartEvent};
export type {dataAssetSpokeJobCompletionEvent as DataAssetSpokeJobCompletionEvent};