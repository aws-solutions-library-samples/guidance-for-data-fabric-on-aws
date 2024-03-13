import type {
    ColumnLineageDatasetFacet,
    ColumnMetric,
    DataQualityMetricsInputDatasetFacet,
    DatasourceDatasetFacet,
    EventType,
    InputDataset,
    OutputDataset,
    RunEvent,
    SourceCodeJobFacet,
    SourceCodeLocationJobFacet,
    StorageDatasetFacet
} from "./model.js";

export interface QualityResultInput {
    runId: string,
    result: QualityResult,
    assetName: string,
    assetNamespace: string
}

export interface ProfilingResultInput {
    runId: string,
    result: ProfilingResult,
    assetName: string;
    assetNamespace: string;
}

export interface RuleResult {
    Name: string
    Description: string
    Result: 'FAIL' | 'PASS',
    EvaluationMessage?: string
}

export interface QualityResult {
    ruleResults: RuleResult[]
}

export interface ProfilingResult {
    sampleSize: number
    duplicateRowsCount: number
    columns: Column[]
}

export type ValueCountList = { value: any, count: number }[];

export interface Column {
    name: string
    type: string
    distinctValuesCount?: number
    uniqueValuesCount?: number
    entropy?: number
    mostCommonValues?: ValueCountList;
    missingValuesCount?: number
    kurtosis?: number
    max?: number
    mean?: number
    min?: number
    skewness?: number
    standardDeviation?: number
    sum?: number
    zerosCount?: number
    variance?: number
    range?: number
    percentile5?: number
    percentile25?: number
    percentile75?: number
    percentile95?: number
    median?: number
    interquartileRange?: number
    mode?: number
    minimumValues?: ValueCountList[]
    maximumValues?: ValueCountList[]
    medianAbsoluteDeviation?: number
}

export interface JobInput {
    /**
     * Name of the job, e.g. df_create_dataset, to make the job unique, the product name will be included as suffix
     */
    jobName: string;
    /**
     * The name will be used when registering the asset in Amazon DataZone
     */
    assetName: string;
    /**
     * For asset that requires transformation in DF, user can specify the location of transformation code
     */
    sourceCode?: Pick<SourceCodeJobFacet, 'sourceCode' | '_producer' | 'language'>;
    /**
     * For custom data product (asset created outside of DF), user can specify the code used to transform the dataset
     */
    sourceCodeLocation?: Pick<SourceCodeLocationJobFacet, '_producer' | 'type' | 'url' | 'repoUrl' | 'path' | 'version' | 'tag' | 'branch'>;
}

export interface StartJobInput {
    /**
     * StepFunction state machine executionId
     */
    executionId: string;
    /**
     * Execution start time for
     * 1. StepFunction State Machine Execution
     * 2. Glue Data Quality Execution
     * 3. Glue DataBrew Profile Execution
     */
    startTime: string;
    /**
     * The parent name and execution id.
     * Namespace is not required because it will be the same namespace (The StepFunction Execution) as the Glue DataBrew or Glue DataQuality job
     */
    parent?: {
        name: string,
        runId: string
    };
}

export interface EndJobInput {
    /**
     * Execution end time for
     * 1. StepFunction State Machine Execution
     * 2. Glue Data Quality Execution
     * 3. Glue DataBrew Profile Execution
     */
    endTime: string;
    /**
     * OpenLineage Run States
     */
    eventType: EventType;
}

export interface DatasetInput {
    type: 'Custom' | 'DataFabric'
}

export type DatasetOutput = {
    /**
     * Storage layer provider with allowed values: iceberg, delta."
     */
    name: string;
    version?: string;
    /**
     * Storage layer provider with allowed values: s3, glue, etc.
     */
    storageLayer: string;
    /**
     * File format with allowed values: parquet, orc, avro, json, csv, text, xml.
     */
    fileFormat?: string;
    /**
     * File format with allowed values: parquet, orc, avro, json, csv, text, xml.
     */
    customTransformerMetadata?: Pick<ColumnLineageDatasetFacet, 'fields' | '_producer'>
}

/**
 * Payload for registering custom data input that exists outside the Data Fabric.
 */
export type CustomDatasetInput = {
    /**
     * Name and Url description can be found in here https://openlineage.io/docs/spec/facets/dataset-facets/data_source
     */
    dataSource: Pick<DatasourceDatasetFacet, 'name' | 'url'>
    /**
     * Storage and FileFormat description can be found in here, https://openlineage.io/docs/spec/facets/dataset-facets/storage.
     */
    storage: Pick<StorageDatasetFacet, 'storageLayer' | 'fileFormat'>
    /**
     * Version of the input dataset
     */
    version?: string;
    /**
     * Name of the input dataset
     */
    name: string;
    /**
     * The _producer value is included in an OpenLineage request as a way to know how the metadata was generated. It is a URI that links to a source code SHA or the location where a package can be found.
     * https://openlineage.io/docs/spec/producers/
     */
    producer: string;
} & DatasetInput;


/**
 * Payload for registering input that exists inside the Data Fabric.
 */
export type DataFabricInput = {
    /**
     * Asset namespace in Data Fabric.
     */
    assetNamespace: string;
    /**
     * Asset name in Data Fabric.
     */
    assetName: string;
} & DatasetInput;

export class OpenLineageBuilder {
    private openLineageEvent: Partial<RunEvent>;
    private readonly domainNamespace: string;
    private readonly owners: { name: string }[];

    constructor(private readonly domainId: string, private readonly domainName: string, private readonly stateMachineArn: string, usernames: string[]) {
        this.domainNamespace = `${this.domainName} - df.${this.domainId}`;
        this.openLineageEvent = {
            producer: this.stateMachineArn,
            schemaURL: "https://openlineage.io/spec/1-0-5/OpenLineage.json#/definitions/RunEvent"
        };
        this.owners = usernames.map(u => ({"name": `user:${u}`}))
    }

    public setOpenLineageEvent(event: Partial<RunEvent>): OpenLineageBuilder {
        this.openLineageEvent = event;
        return this;
    }


    public setProfilingResult(payload: ProfilingResultInput): OpenLineageBuilder {
        const {result, assetNamespace, assetName} = payload

        const dataQualityMetrics: DataQualityMetricsInputDatasetFacet = {
            _producer: payload.runId,
            _schemaURL: "https://openlineage.io/spec/facets/1-0-0/DataQualityMetricsInputDatasetFacet.json",
            rowCount: result.sampleSize,
            columnMetrics: {}
        }

        const setQuantileData = (percentile: number, percentileValue: number, columnMetric: ColumnMetric) => {
            if (!columnMetric.quantiles) columnMetric.quantiles = {}
            if (percentileValue) {
                columnMetric.quantiles[percentile / 100] = percentileValue;
            }
        }

        for (const result of payload.result.columns) {
            const columnMetric: ColumnMetric = {};
            // Translate statistic data from brew to openlineage
            columnMetric.min = result.min;
            columnMetric.max = result.max;
            columnMetric.sum = result.sum;
            columnMetric.count = result.uniqueValuesCount;
            columnMetric.nullCount = result.missingValuesCount;
            columnMetric.distinctCount = result.distinctValuesCount;
            // Translate percentile data to quantile
            setQuantileData(5, result.percentile5, columnMetric);
            setQuantileData(25, result.percentile25, columnMetric);
            setQuantileData(75, result.percentile75, columnMetric);
            setQuantileData(95, result.percentile95, columnMetric);
            if (Object.keys(columnMetric).length > 0) {
                dataQualityMetrics.columnMetrics[result.name] = columnMetric;
            }
        }
        const datasetInput = this.openLineageEvent.inputs.find(o => o.name === assetName && o.namespace === assetNamespace)
        datasetInput.inputFacets.dataQualityMetrics = dataQualityMetrics;
        return this;
    }

    public setQualityResult(payload: QualityResultInput): OpenLineageBuilder {
        const {result, assetNamespace, assetName, runId} = payload
        const datasetInput = this.openLineageEvent.inputs.find(o => o.name === assetName && o.namespace === assetNamespace)
        datasetInput.facets.dataQualityAssertions = {
            _producer: runId,
            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/DataQualityAssertionsDatasetFacet.json",
            assertions: []
        }
        result.ruleResults.forEach(r => {
            datasetInput.facets.dataQualityAssertions.assertions.push({
                assertion: r.Description,
                success: r.Result === 'PASS'
                // TODO: extract column whenever possible from description
            })
        })
        return this;
    }

    public setJob(input: JobInput): OpenLineageBuilder {
        this.openLineageEvent.job = {
            namespace: this.domainNamespace,
            name: `${input.jobName} - ${input.assetName}`,
            facets: {
                "documentation": {
                    "_producer": this.stateMachineArn,
                    "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/DocumentationJobFacet.json",
                    "description": `Catalogs the ${input.assetName} within the DataZone catalog for domain ${this.domainName} ${this.domainId}.`
                },
                "ownership": {
                    "_producer": this.stateMachineArn,
                    "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/OwnershipJobFacet.json",
                    "owners": [
                        ...this.owners,
                        {"name": "application:df.DataAssetModule"}
                    ]
                }
            },
        }
        this.openLineageEvent.inputs = [];
        this.openLineageEvent.outputs = [];
        if (input.sourceCode) {
            this.openLineageEvent.job.facets["sourceCode"] = {
                ...input.sourceCode,
                "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/SourceCodeJobFacet.json",
            }
        }

        if (input.sourceCodeLocation) {
            this.openLineageEvent.job.facets["sourceCodeLocation"] = {
                ...input.sourceCodeLocation,
                "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/SourceCodeLocationJobFacet.json",
            }
        }
        return this;
    }


    public setDatasetOutput(payload: DatasetOutput): OpenLineageBuilder {
        const output: OutputDataset = {
            namespace: this.domainNamespace,
            name: payload.name,
            outputFacets: {},
            facets: {
                "lifecycleStateChange": {
                    "_producer": this.stateMachineArn,
                    "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/LifecycleStateChangeDatasetFacet.json",
                    "lifecycleStateChange": "CREATE"
                },
                "ownership": {
                    "_producer": this.stateMachineArn,
                    "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/OwnershipDatasetFacet.json",
                    "owners": [
                        ...this.owners,
                        {"name": "application:df.DataAssetModule"}
                    ]
                },
                "storage": {
                    "_producer": this.stateMachineArn,
                    "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/StorageDatasetFacet.json",
                    fileFormat: payload.fileFormat,
                    storageLayer: payload.storageLayer

                },
                "version": {
                    "_producer": this.stateMachineArn,
                    "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/DatasetVersionDatasetFacet.json",
                    datasetVersion: payload.version
                }
            }
        }

        if (payload.customTransformerMetadata) {
            output.facets.columnLineage = {
                "_producer": payload.customTransformerMetadata._producer,
                "_schemaURL": "https://openlineage.io/spec/facets/1-0-1/ColumnLineageDatasetFacet.json",
                fields: payload.customTransformerMetadata.fields
            }
        }

        this.openLineageEvent.outputs.push(output)
        return this;
    }

    public setDatasetInput(payload: CustomDatasetInput | DataFabricInput): OpenLineageBuilder {
        let dataset: InputDataset
        switch (payload.type) {
            case "Custom":
                const customDatasetInput = (payload as CustomDatasetInput);
                dataset = {
                    namespace: this.domainNamespace,
                    name: (payload as CustomDatasetInput).name,
                    inputFacets: {},
                    facets: {
                        "dataSource": {
                            ...customDatasetInput.dataSource,
                            "_producer": customDatasetInput.producer,
                            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/DatasourceDatasetFacet.json",
                        },
                        "ownership": {
                            "owners": this.owners,
                            "_producer": customDatasetInput.producer,
                            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/OwnershipDatasetFacet.json",
                        },
                        "storage": {
                            ...customDatasetInput.storage,
                            "_producer": customDatasetInput.producer,
                            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/StorageDatasetFacet.json",
                        },
                        "version": {
                            "_producer": customDatasetInput.producer,
                            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/DatasetVersionDatasetFacet.json",
                            "datasetVersion": customDatasetInput.version
                        }
                    }
                }
                break;
            case "DataFabric":
                dataset = {
                    namespace: (payload as DataFabricInput).assetNamespace,
                    name: (payload as DataFabricInput).assetName,
                    inputFacets: {},
                    facets: {}
                }
                break;
            default:
                throw new Error('')
        }
        this.openLineageEvent.inputs.push(dataset);
        return this;
    }

    public setStartJob(input: StartJobInput): OpenLineageBuilder {
        this.openLineageEvent.eventTime = input.startTime;
        this.openLineageEvent.eventType = 'START';
        this.openLineageEvent.run = {
            "runId": input.executionId,
            "facets": {
                "nominalTime": {
                    "_producer": this.stateMachineArn,
                    "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/NominalTimeRunFacet.json",
                    "nominalStartTime": input.startTime
                },
                parent: input.parent ? {
                    _producer: this.stateMachineArn,
                    "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/ParentRunFacet.json",
                    job:
                        {
                            name: input.parent.name,
                            namespace: this.domainNamespace
                        },
                    run:
                        {
                            runId: input.parent.runId
                        }
                } : undefined
            }
        }
        return this;
    }

    public setEndJob(payload: EndJobInput): OpenLineageBuilder {
        if (!this.openLineageEvent?.run?.facets?.nominalTime) {
            throw new Error('OpenLineage start run time had not been set')
        }
        this.openLineageEvent.eventType = payload.eventType;
        this.openLineageEvent.run.facets.nominalTime.nominalEndTime = payload.endTime;
        return this;
    }

    public build(): Partial<RunEvent> {

        if (!this.openLineageEvent.job) {
            throw new Error('Event does not contain job payload.')
        }

        if (!this.openLineageEvent.run) {
            throw new Error('Event does not contain run payload.')
        }

        if (this.openLineageEvent.inputs.length == 0) {
            throw new Error('Event does not contain dataset inputs.')
        }

        return this.openLineageEvent;
    }

}
