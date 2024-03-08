import { beforeEach, describe, expect, it } from 'vitest';
import { OpenLineageBuilder, QualityResult } from "./openLineage.builder";
import type { RunEvent } from "@df/events";

describe('OpenLineageBuilder', () => {
    let builder: OpenLineageBuilder;

    beforeEach(() => {
        builder = new OpenLineageBuilder('12345',
            'sample_domain',
            'arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline',
            ['testuser@admin.com']);
    })

    describe('Derived data asset with custom transformation applied outside DF', () => {
        const expectedStartEvent: Partial<RunEvent> = {
            "producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
            "schemaURL": "https://openlineage.io/spec/1-0-5/OpenLineage.json#/definitions/RunEvent",
            "job": {
                "namespace": "sample_domain - df.12345",
                "name": "df_create_dataset - SampleCsvAsset",
                "facets": {
                    "documentation": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/DocumentationJobFacet.json",
                        "description": "Catalogs the SampleCsvAsset within the DataZone catalog for domain sample_domain 12345."
                    },
                    "ownership": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/OwnershipJobFacet.json",
                        "owners": [{"name": "user:testuser@admin.com"}, {"name": "application:df.DataAssetModule"}]
                    },
                    "sourceCodeLocation": {
                        "_producer": "external_bash_script",
                        "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/SourceCodeLocationJobFacet.json",
                        "type": "git",
                        "url": "some_git_url",
                    }
                }
            },
            "inputs": [{
                "namespace": "sample_domain - df.12345", "name": "88888888", "facets": {}, "inputFacets": {}
            }],
            "outputs": [],
            "eventTime": "2024-03-08T04:46:23.275Z",
            "eventType": "START",
            "run": {
                "runId": "8948df56-2116-401f-9349-95c42b646047",
                "facets": {
                    "nominalTime": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/NominalTimeRunFacet.json",
                        "nominalStartTime": "2024-03-08T04:46:23.275Z"
                    }
                }
            }
        }

        const expectedCompleteEvent = {
            "producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
            "schemaURL": "https://openlineage.io/spec/1-0-5/OpenLineage.json#/definitions/RunEvent",
            "job": {
                "namespace": "sample_domain - df.12345",
                "name": "df_create_dataset - SampleCsvAsset",
                "facets": {
                    "documentation": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/DocumentationJobFacet.json",
                        "description": "Catalogs the SampleCsvAsset within the DataZone catalog for domain sample_domain 12345."
                    },
                    "ownership": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/OwnershipJobFacet.json",
                        "owners": [{"name": "user:testuser@admin.com"}, {"name": "application:df.DataAssetModule"}]
                    },
                    "sourceCodeLocation": {"_producer": "external_bash_script", "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/SourceCodeLocationJobFacet.json", "type": "git", "url": "some_git_url"}
                }
            },
            "inputs": [{"namespace": "sample_domain - df.12345", "name": "88888888", "facets": {}, "inputFacets": {}}],
            "outputs": [{
                "namespace": "sample_domain - df.12345", "name": "df.stationary-combustion.77777",
                "outputFacets": {},
                "facets": {
                    "lifecycleStateChange": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/LifecycleStateChangeDatasetFacet.json",
                        "lifecycleStateChange": "CREATE"
                    },
                    "ownership": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/OwnershipDatasetFacet.json",
                        "owners": [{"name": "user:testuser@admin.com"}, {"name": "application:df.DataAssetModule"}]
                    },
                    "storage": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/StorageDatasetFacet.json",
                        "fileFormat": "csv",
                        "storageLayer": "s3"
                    },
                    "version": {"_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline", "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/DatasetVersionDatasetFacet.json", "datasetVersion": "1.2"},
                    "columnLineage": {
                        "_producer": "externalProducer",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-1/ColumnLineageDatasetFacet.json",
                        "fields": {
                            "category": {"inputFields": [{"namespace": "external_domain - df.00000", "name": "usepa.ghg-emission-factors-hub-2023", "field": "Fuel Category"}]},
                            "fuelType": {"inputFields": [{"namespace": "external_domain - df.00000", "name": "usepa.ghg-emission-factors-hub-2023", "field": "Fuel Type"}]}
                        }
                    }
                }
            }],
            "eventTime": "2024-03-08T04:46:23.275Z",
            "eventType": "COMPLETE",
            "run": {
                "runId": "8948df56-2116-401f-9349-95c42b646047",
                "facets": {
                    "nominalTime": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/NominalTimeRunFacet.json",
                        "nominalStartTime": "2024-03-08T04:46:23.275Z",
                        "nominalEndTime": "2024-03-08T06:46:23.275Z"
                    }
                }
            }
        }

        it('Happy Path > Scenario 1.2.1 and Scenario 1.2.2', () => {
            const actualStartEvent = builder
                .setJob(
                    {
                        jobName: "df_create_dataset",
                        productName: "SampleCsvAsset",
                        sourceCodeLocation: {
                            _producer: 'external_bash_script',
                            type: 'git',
                            url: 'some_git_url'
                        }
                    })
                .setStartJob(
                    {
                        executionId: "8948df56-2116-401f-9349-95c42b646047",
                        startTime: "2024-03-08T04:46:23.275Z"
                    })
                .setDatasetInput({
                    assetId: "88888888",
                    type: 'DataFabric',
                }).build();

            expect(actualStartEvent).toEqual(expectedStartEvent);

            builder.setOpenLineageEvent(expectedStartEvent);

            const actualCompleteEvent = builder
                .setEndJob(
                    {
                        endTime: "2024-03-08T06:46:23.275Z",
                        eventType: 'COMPLETE'
                    })
                .setDatasetOutput({
                    fileFormat: "csv",
                    name: "df.stationary-combustion.77777",
                    storageLayer: "s3",
                    version: "1.2",
                    customTransformerMetadata: {
                        _producer: 'externalProducer',
                        fields: {
                            "category": {
                                "inputFields": [
                                    {
                                        "namespace": "external_domain - df.00000",
                                        "name": "usepa.ghg-emission-factors-hub-2023",
                                        "field": "Fuel Category"
                                    }
                                ]
                            },
                            "fuelType": {
                                "inputFields": [
                                    {
                                        "namespace": "external_domain - df.00000",
                                        "name": "usepa.ghg-emission-factors-hub-2023",
                                        "field": "Fuel Type"
                                    }
                                ]
                            },
                        }
                    }
                })
                .build();
            expect(actualCompleteEvent).toEqual(expectedCompleteEvent);
        })
    })

    describe('Derived data asset with data profiling metrics', () => {
        const expectedCompleteEvent = {
            "domainId": "12345", "domainName": "sample_domain", "stateMachineArn": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline", "domainNamespace": "sample_domain - df.12345", "openLineageEvent": {
                "producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                "schemaURL": "https://openlineage.io/spec/1-0-5/OpenLineage.json#/definitions/RunEvent",
                "job": {
                    "namespace": "sample_domain - df.12345",
                    "name": "df_data_quality_metrics - SampleCsvAsset",
                    "facets": {
                        "documentation": {
                            "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                            "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/DocumentationJobFacet.json",
                            "description": "Catalogs the SampleCsvAsset within the DataZone catalog for domain sample_domain 12345."
                        },
                        "ownership": {
                            "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/OwnershipJobFacet.json",
                            "owners": [{"name": "user:testuser@admin.com"}, {"name": "application:df.DataAssetModule"}]
                        }
                    }
                },
                "inputs": [{
                    "namespace": "sample_domain - df.12345",
                    "name": "88888888",
                    "inputFacets": {
                        "dataQualityMetrics": {
                            "_producer": "8948df56-2116-401f-9349-95c42b646047",
                            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/DataQualityMetricsInputDatasetFacet.json",
                            "rowCount": 20000,
                            "columnMetrics": {
                                "age": {"min": 18, "max": 99, "sum": 1173386, "count": 0, "nullCount": 0, "distinctCount": 82, "quantiles": {"0.05": 22, "0.25": 38, "0.75": 79, "0.95": 95}},
                                "city": {"min": 6, "max": 15, "count": 0, "nullCount": 0, "distinctCount": 25, "quantiles": {}}
                            }
                        }
                    },
                    "facets": {}
                }],
                "outputs": [],
                "eventTime": "2024-03-08T04:46:23.275Z",
                "eventType": "COMPLETE",
                "run": {
                    "runId": "8948df56-2116-401f-9349-95c42b646047",
                    "facets": {
                        "nominalTime": {
                            "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/NominalTimeRunFacet.json",
                            "nominalStartTime": "2024-03-08T04:46:23.275Z",
                            "nominalEndTime": "2024-03-08T06:46:23.275Z"
                        },
                        "parent": {
                            "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/ParentRunFacet.json",
                            "job": {"name": "df_create_dataset - SampleCsvAsset", "namespace": "sample_domain - df.12345"},
                            "run": {"runId": "284ae082-8385-4de5-9ec6-87d6ed65b113"}
                        }
                    }
                }
            }, "owners": [{"name": "user:testuser@admin.com"}]
        }

        const expectedStartEvent = {
            "producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
            "schemaURL": "https://openlineage.io/spec/1-0-5/OpenLineage.json#/definitions/RunEvent",
            "job": {
                "namespace": "sample_domain - df.12345",
                "name": "df_data_quality_metrics - SampleCsvAsset",
                "facets": {
                    "documentation": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/DocumentationJobFacet.json",
                        "description": "Catalogs the SampleCsvAsset within the DataZone catalog for domain sample_domain 12345."
                    },
                    "ownership": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/OwnershipJobFacet.json",
                        "owners": [
                            {
                                "name": "user:testuser@admin.com"
                            },
                            {
                                "name": "application:df.DataAssetModule"
                            }
                        ]
                    }
                }
            },
            "inputs": [
                {
                    "namespace": "sample_domain - df.12345",
                    "name": "88888888",
                    inputFacets: {},
                    facets: {}
                }
            ],
            "outputs": [],
            "eventTime": "2024-03-08T04:46:23.275Z",
            "eventType": "START",
            "run": {
                "runId": "8948df56-2116-401f-9349-95c42b646047",
                "facets": {
                    "nominalTime": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/NominalTimeRunFacet.json",
                        "nominalStartTime": "2024-03-08T04:46:23.275Z"
                    },
                    "parent": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/ParentRunFacet.json",
                        "job": {
                            "name": "df_create_dataset - SampleCsvAsset",
                            "namespace": "sample_domain - df.12345"
                        },
                        "run": {
                            "runId": "284ae082-8385-4de5-9ec6-87d6ed65b113"
                        }
                    }
                }
            }
        }

        const profilingResult = {
            "sampleSize": 20000,
            "duplicateRowsCount": 0,
            columns: [{
                "name": "age",
                "type": "bigint",
                "distinctValuesCount": 82,
                "uniqueValuesCount": 0,
                "missingValuesCount": 0,
                "max": 99,
                "min": 18,
                "sum": 1173386,
                "zerosCount": 0,
                "percentile5": 22.0,
                "percentile25": 38.0,
                "percentile75": 79.0,
                "percentile95": 95.0,
                "median": 59.0,
            },
                {
                    "name": "city",
                    "type": "string",
                    "distinctValuesCount": 25,
                    "uniqueValuesCount": 0,
                    "missingValuesCount": 0,
                    "max": 15,
                    "min": 6,
                    "median": 9.0,
                    "mode": 7,
                }]
        };

        it('Happy Path > Scenario 1.2.3 and Scenario 1.2.4', () => {
            const actualStartEvent = builder
                .setJob(
                    {
                        jobName: "df_data_quality_metrics",
                        productName: "SampleCsvAsset",
                    })
                .setStartJob(
                    {
                        executionId: "8948df56-2116-401f-9349-95c42b646047",
                        startTime: "2024-03-08T04:46:23.275Z",
                        parent: {
                            runId: '284ae082-8385-4de5-9ec6-87d6ed65b113',
                            name: "df_create_dataset - SampleCsvAsset"
                        }
                    })
                .setDatasetInput({
                    assetId: "88888888",
                    type: 'DataFabric',
                }).build();

            expect(actualStartEvent).toEqual(expectedStartEvent);

            builder.setOpenLineageEvent(actualStartEvent);

            const actualCompleteEvent = builder
                .setEndJob({
                    endTime: "2024-03-08T06:46:23.275Z",
                    eventType: 'COMPLETE'
                })
                .setProfilingResult({
                    inputDatasetName: "88888888",
                    result: profilingResult,
                    runId: "8948df56-2116-401f-9349-95c42b646047"
                });
            expect(actualCompleteEvent).toEqual(expectedCompleteEvent);
        });
    });

    describe('Derived data asset with data quality assertions', () => {

        const expectedStartEvent = {
            "producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
            "schemaURL": "https://openlineage.io/spec/1-0-5/OpenLineage.json#/definitions/RunEvent",
            "job": {
                "namespace": "sample_domain - df.12345",
                "name": "df_data_quality_assertions - SampleCsvAsset",
                "facets": {
                    "documentation": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/DocumentationJobFacet.json",
                        "description": "Catalogs the SampleCsvAsset within the DataZone catalog for domain sample_domain 12345."
                    },
                    "ownership": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/OwnershipJobFacet.json",
                        "owners": [
                            {
                                "name": "user:testuser@admin.com"
                            },
                            {
                                "name": "application:df.DataAssetModule"
                            }
                        ]
                    }
                }
            },
            "inputs": [
                {
                    "namespace": "sample_domain - df.12345",
                    "name": "88888888",
                    inputFacets: {},
                    facets: {}
                }
            ],
            "outputs": [],
            "eventTime": "2024-03-08T04:46:23.275Z",
            "eventType": "START",
            "run": {
                "runId": "8948df56-2116-401f-9349-95c42b646047",
                "facets": {
                    "nominalTime": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/NominalTimeRunFacet.json",
                        "nominalStartTime": "2024-03-08T04:46:23.275Z"
                    },
                    "parent": {
                        "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/ParentRunFacet.json",
                        "job": {
                            "name": "df_create_dataset - SampleCsvAsset",
                            "namespace": "sample_domain - df.12345"
                        },
                        "run": {
                            "runId": "284ae082-8385-4de5-9ec6-87d6ed65b113"
                        }
                    }
                }
            }
        }

        const qualityResult: QualityResult = {
            ruleResults: [
                {
                    "Name": "Rule_1",
                    "Description": "ColumnCount = 10",
                    "EvaluationMessage": "Dataset has 7.0 columns and failed to satisfy constraint",
                    "Result": "FAIL"
                },
                {
                    "Name": "Rule_2",
                    "Description": "ColumnValues \"zipcode\" matches \"[1-9]*\" with threshold > 0.1",
                    "EvaluationMessage": "Expected type of column zipcode to be StringType, but found DoubleType instead!",
                    "Result": "FAIL"
                },
                {
                    "Name": "Rule_3",
                    "Description": "ColumnValues \"zipcode\" in [1,2,3]",
                    "EvaluationMessage": "Value: 0.0 does not meet the constraint requirement!",
                    "Result": "FAIL"
                },
                {
                    "Name": "Rule_4",
                    "Description": "ColumnExists \"zipcode\"",
                    "Result": "PASS"
                },
                {
                    "Name": "Rule_5",
                    "Description": "ColumnValues \"kwh\" < 10",
                    "EvaluationMessage": "Value: 500.0 does not meet the constraint requirement!",
                    "Result": "FAIL"
                }
            ]
        }

        const expectedCompleteEvent = {
            "domainId": "12345", "domainName": "sample_domain", "stateMachineArn": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline", "domainNamespace": "sample_domain - df.12345", "openLineageEvent": {
                "producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                "schemaURL": "https://openlineage.io/spec/1-0-5/OpenLineage.json#/definitions/RunEvent",
                "job": {
                    "namespace": "sample_domain - df.12345",
                    "name": "df_data_quality_assertions - SampleCsvAsset",
                    "facets": {
                        "documentation": {
                            "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                            "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/DocumentationJobFacet.json",
                            "description": "Catalogs the SampleCsvAsset within the DataZone catalog for domain sample_domain 12345."
                        },
                        "ownership": {
                            "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/OwnershipJobFacet.json",
                            "owners": [{"name": "user:testuser@admin.com"}, {"name": "application:df.DataAssetModule"}]
                        }
                    }
                },
                "inputs": [{
                    "namespace": "sample_domain - df.12345",
                    "name": "88888888",
                    "inputFacets": {},
                    "facets": {
                        "dataQualityAssertions": {
                            "_producer": "8948df56-2116-401f-9349-95c42b646047",
                            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/DataQualityAssertionsDatasetFacet.json",
                            "assertions":
                                [
                                    {"assertion": "ColumnCount = 10", "success": false},
                                    {"assertion": "ColumnValues \"zipcode\" matches \"[1-9]*\" with threshold > 0.1", "success": false},
                                    {"assertion": "ColumnValues \"zipcode\" in [1,2,3]", "success": false},
                                    {"assertion": "ColumnExists \"zipcode\"", "success": true},
                                    {"assertion": "ColumnValues \"kwh\" < 10", "success": false}
                                ]
                        }
                    }
                }],
                "outputs": [],
                "eventTime": "2024-03-08T04:46:23.275Z",
                "eventType": "COMPLETE",
                "run": {
                    "runId": "8948df56-2116-401f-9349-95c42b646047",
                    "facets": {
                        "nominalTime": {
                            "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/NominalTimeRunFacet.json",
                            "nominalStartTime": "2024-03-08T04:46:23.275Z",
                            "nominalEndTime": "2024-03-08T06:46:23.275Z"
                        },
                        "parent": {
                            "_producer": "arn:aws:states:ap-southeast-2:111111111:stateMachine:createDataSetPipeline",
                            "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/ParentRunFacet.json",
                            "job": {"name": "df_create_dataset - SampleCsvAsset", "namespace": "sample_domain - df.12345"},
                            "run": {"runId": "284ae082-8385-4de5-9ec6-87d6ed65b113"}
                        }
                    }
                }
            }, "owners": [{"name": "user:testuser@admin.com"}]
        }

        it('Happy Path > Scenario 7.1.1 and Scenario 7.1.2', () => {
            const actualStartEvent = builder
                .setJob(
                    {
                        jobName: "df_data_quality_assertions",
                        productName: "SampleCsvAsset",
                    })
                .setStartJob(
                    {
                        executionId: "8948df56-2116-401f-9349-95c42b646047",
                        startTime: "2024-03-08T04:46:23.275Z",
                        parent: {
                            runId: '284ae082-8385-4de5-9ec6-87d6ed65b113',
                            name: "df_create_dataset - SampleCsvAsset"
                        }
                    })
                .setDatasetInput({
                    assetId: "88888888",
                    type: 'DataFabric',
                }).build();

            expect(actualStartEvent).toEqual(expectedStartEvent);

            builder.setOpenLineageEvent(actualStartEvent);

            const actualCompleteEvent = builder
                .setEndJob({
                    endTime: "2024-03-08T06:46:23.275Z",
                    eventType: 'COMPLETE'
                })
                .setQualityResult({
                    inputDatasetName: "88888888",
                    result: qualityResult,
                    runId: "8948df56-2116-401f-9349-95c42b646047"
                });
            expect(actualCompleteEvent).toEqual(expectedCompleteEvent);
        })

    });


});
