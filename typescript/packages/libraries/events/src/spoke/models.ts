/*
 * A place holder for outgoing events sent by the Spoke
*/

export const ACCESS_CONTROL_SPOKE_EVENT_SOURCE: string = 'com.aws.df.spoke.accessControl';
export const DATA_LINEAGE_SPOKE_EVENT_SOURCE: string = 'com.aws.df.spoke.dataLineage';
export const DATA_ASSET_SPOKE_EVENT_SOURCE: string = 'com.aws.df.spoke.dataAsset';

export const DATA_ASSET_SPOKE_JOB_START_EVENT = `DF>${DATA_ASSET_SPOKE_EVENT_SOURCE}>job>start`
export const DATA_BREW_JOB_STATE_CHANGE: string = 'DataBrew Job State Change';
export const GLUE_CRAWLER_STATE_CHANGE: string = 'Glue Crawler State Change';

export const DATA_QUALITY_EVALUATION_RESULTS_AVAILABLE = 'Data Quality Evaluation Results Available';

export const DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT = `DF>${DATA_ASSET_SPOKE_EVENT_SOURCE}>job>complete`
export const DATA_ASSET_SPOKE_CRAWLER_COMPLETE_EVENT = `DF>${DATA_ASSET_SPOKE_EVENT_SOURCE}>crawler>complete`
export const DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT = `DF>${DATA_ASSET_SPOKE_EVENT_SOURCE}>create>response`


export type JobState = 'FAILED' | 'SUCCEEDED';

export interface jobStateChangeDetail {
    jobName: string,
    severity: string,
    state: string,
    jobRunId: string,
    message: string
};

export interface DataQualityResultsAvailableDetail {
    context: {
        contextType: string;
        runId: string;
        databaseName: string;
        tableName: string;
        catalogId: string;
    };
    resultID: string;
    rulesetNames: string[];
    state: string;
    score: number;
    rulesSucceeded: number;
    rulesFailed: number;
    rulesSkipped: number;
}

export interface DataQualityResultsAvailableEvent {
    version:string;
    account: string,
    region: string,
    source: string,
    'detail-type': string,
    time: string,
    detail: DataQualityResultsAvailableDetail,
}

export interface jobStateChangeEvent {
    account: string,
    region: string,
    source: string,
    'detail-type': string,
    time: string,
    detail: jobStateChangeDetail,
};

export interface crawlerStateChangeDetail {
    crawlerName: string,
    state: string,
    'runningTime (sec)': number,
    completionDate: string,
    message: string,
    tablesCreated: number,
    partitionsCreated: number,
    partitionsUpdated: number,
    tablesUpdated: number,
    partitionsDeleted: number,
    tablesDeleted: number
};

export interface crawlerStateChangeEvent {
    id: string,
    account: string,
    region: string,
    source: string,
    'detail-type': string,
    time: string,
    detail: crawlerStateChangeDetail,
};

export type { jobStateChangeEvent as JobStateChangeEvent };
export type { crawlerStateChangeEvent as CrawlerStateChangeEvent };
