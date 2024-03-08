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
} from "@df/events";


export interface QualityResultInput {
    runId: string,
    result: QualityResult,
    inputDatasetName: string,
}

export interface ProfilingResultInput {
    runId: string,
    result: ProfilingResult,
    inputDatasetName: string,
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
     *
     */
    productName: string;
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
     * StepFunction state machine execution start time
     */
    startTime: string;
    /**
     * The parent namespace, name and execution id
     */
    parent?: { name: string, runId: string };
}

export interface EndJobInput {
    endTime: string;
    eventType: EventType;
}

export interface DatasetInput {
    type: 'Custom' | 'DataFabric'
}

export type DatasetOutput = {
    name: string;
    version: string;
    storageLayer: string;
    fileFormat: string;
    customTransformerMetadata?: Pick<ColumnLineageDatasetFacet, 'fields' | '_producer'>
}

export type CustomDatasetInput = {
    dataSource: Pick<DatasourceDatasetFacet, 'name' | 'url'>
    storage: Pick<StorageDatasetFacet, 'storageLayer' | 'fileFormat'>
    version: string;
    name: string;
    producer: string;
} & DatasetInput;

export type DataFabricInput = {
    assetId: string;

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
        const {result, inputDatasetName} = payload

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
        const datasetInput = this.openLineageEvent.inputs.find(o => o.name === inputDatasetName)
        datasetInput.inputFacets.dataQualityMetrics = dataQualityMetrics;
        return this;
    }

    public setQualityResult(payload: QualityResultInput): OpenLineageBuilder {
        const {result, inputDatasetName, runId} = payload
        const datasetInput = this.openLineageEvent.inputs.find(o => o.name === inputDatasetName)
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
            name: `${input.jobName} - ${input.productName}`,
            facets: {
                "documentation": {
                    "_producer": this.stateMachineArn,
                    "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/DocumentationJobFacet.json",
                    "description": `Catalogs the ${input.productName} within the DataZone catalog for domain ${this.domainName} ${this.domainId}.`
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
                    namespace: this.domainNamespace,
                    name: (payload as DataFabricInput).assetId,
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
