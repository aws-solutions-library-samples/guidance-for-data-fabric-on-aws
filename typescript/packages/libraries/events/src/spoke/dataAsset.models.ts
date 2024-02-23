import type { DataAssetJobEvent } from "../common/dataAsset.models";

export interface dataAssetSpokeResponseEvent {
    account: string,
    region: string,
    source: string,
    'detail-type': string,
    detail: DataAssetJobEvent,
};

export type {dataAssetSpokeResponseEvent as DataAssetSpokeResponseEvent};