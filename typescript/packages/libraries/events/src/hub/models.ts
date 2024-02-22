/*
 * A place holder for outgoing events sent by the Hub
*/
type EventType = 'COMPLETE' | 'ABORT' | 'FAIL';

export interface DomainEvent<T> {
	resourceType: string;
	eventType: EventType;
	id: string;
	old?: T;
	new?: T;
	error?: Error;
}

export const ACCESS_CONTROL_HUB_EVENT_SOURCE: string = 'com.aws.df.hub.accessControl';
export const DATA_LINEAGE_HUB_EVENT_SOURCE: string = 'com.aws.df.hub.dataLineage';
export const DATA_ASSET_HUB_EVENT_SOURCE: string = 'com.aws.df.hub.dataAsset';

export const DATA_ASSET_HUB_CREATE_REQUEST_EVENT =  `DF>${DATA_ASSET_HUB_EVENT_SOURCE}>create>request`
