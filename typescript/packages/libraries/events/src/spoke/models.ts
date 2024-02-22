/*
 * A place holder for outgoing events sent by the Spoke
*/

export const ACCESS_CONTROL_SPOKE_EVENT_SOURCE: string = 'com.aws.df.spoke.accessControl';
export const DATA_LINEAGE_SPOKE_EVENT_SOURCE: string = 'com.aws.df.spoke.dataLineage';
export const DATA_ASSET_SPOKE_EVENT_SOURCE: string = 'com.aws.df.spoke.dataAsset';

export const DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT =  `DF>${DATA_ASSET_SPOKE_EVENT_SOURCE}>create>response`
