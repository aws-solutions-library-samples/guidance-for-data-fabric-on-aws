export type EventType = 'COMPLETE' | 'ABORT' | 'FAIL';

export interface LineageRun {
    runId:string
}

export interface Facet {
    _producer:string;
    _schemaURL: string;
    [name:string]: any;

}

export interface Facets {
    [name:string]: Facet;

}
export interface LineageJob {
    namespace: string,
    name: string
}

export interface LineageInput {
    namespace: string,
    name: string
}

export interface LineageOutput {
    namespace: string,
    name: string,
    facets: Facets,
}
export interface LineageResource {
    eventType: EventType,
    eventTime: string,
    run : LineageRun,
    facets: Facets,
    inputs: LineageInput[],
    outputs: LineageOutput[],
    _producer:string;
    _schemaURL: string;
} 

export type {LineageResource as Lineage};