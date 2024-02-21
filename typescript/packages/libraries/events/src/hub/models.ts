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

export const ACCESS_CONTROL_HUB_EVENT_SOURCE: string = 'com.aws.sdf.hub.accessControl';
export const DATA_LINEAGE_HUB_EVENT_SOURCE: string = 'com.aws.sdf.hub.dataLineage';
export const DATA_ASSET_HUB_EVENT_SOURCE: string = 'com.aws.sdf.hub.dataAsset';

export const DATA_ASSET_HUB_CREATE_REQUEST_EVENT =  `SDF>${DATA_ASSET_HUB_EVENT_SOURCE}>create>request`
