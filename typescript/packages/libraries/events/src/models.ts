export type EventSource = typeof ACCESS_CONTROL_EVENT_SOURCE;

export type EventType = 'COMPLETE' | 'ABORT' | 'FAIL';


export interface DomainEvent<T> {
	resourceType: string;
	eventType: EventType;
	id: string;
	old?: T;
	new?: T;
	error?: Error;
}

export interface LineageRun {
    runId:string
}

interface Facet {
    _producer:string;
    _schemaURL: string;
    [name:string]: any;

}

interface Facets {
    [name:string]: Facet;

}

interface LineageInput {
    namespace: string,
    name: string
}

interface LineageOutput {
    namespace: string,
    name: string,
    facets: Facets,
}

export interface lineageIngestionEventDetail {
		eventType: EventType,
		eventTime: string,
		run: LineageRun,
		facets: Facets,
		inputs: LineageInput[],
		outputs: LineageOutput[],
		_producer: string,
		_schemaURL: string,
	};

export interface lineageIngestionEvent {
		EventBusName: string,
		Source: string,
		DetailType: string,
		Detail: lineageIngestionEventDetail,
	};


export const ACCESS_CONTROL_EVENT_SOURCE: string = 'com.aws.sdf.accessControl';
export const DATA_LINEAGE_EVENT_SOURCE: string = 'com.aws.sdf.dataLineage';
export const DATA_ASSET_EVENT_SOURCE: string = 'com.aws.sdf.dataAsset';

export const DATA_LINEAGE_DIRECT_INGESTION_REQUEST_EVENT = `SDF>${DATA_LINEAGE_EVENT_SOURCE}>ingestion>request`;

export type {lineageIngestionEventDetail as LineageIngestionEventDetail};
export type {lineageIngestionEvent as LineageIngestionEvent};

