/*
 * A place holder for outgoing events sent by the Spoke
*/

export const ACCESS_CONTROL_SPOKE_EVENT_SOURCE: string = 'com.aws.df.spoke.accessControl';
export const DATA_LINEAGE_SPOKE_EVENT_SOURCE: string = 'com.aws.df.spoke.dataLineage';
export const DATA_ASSET_SPOKE_EVENT_SOURCE: string = 'com.aws.df.spoke.dataAsset';

export const DATA_ASSET_SPOKE_JOB_START_EVENT =  `DF>${DATA_ASSET_SPOKE_EVENT_SOURCE}>job>start`
export const DATA_BREW_JOB_STATE_CHANGE: string = 'DataBrew Job State Change';
export const DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT =  `DF>${DATA_ASSET_SPOKE_EVENT_SOURCE}>job>complete`

export type JobState = 'FAILED'| 'SUCCEEDED';
export interface jobStateChangeDetail {
    jobName: string,
    severity: string,
    state: string,
    jobRunId: string,
    message: string
};

export interface jobStateChangeEvent {
    account: string,
    region: string,
    source: string,
    'detail-type': string,
    time: string,
    detail: jobStateChangeDetail,
};

export type {jobStateChangeEvent as JobStateChangeEvent};