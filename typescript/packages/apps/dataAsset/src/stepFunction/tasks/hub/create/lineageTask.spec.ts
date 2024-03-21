import { describe, it } from "vitest";
import pino from "pino";
import { LineageTask } from "./lineageTask";
import { SFNClient } from "@aws-sdk/client-sfn";
import { EventPublisher } from "@df/events";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";

describe('LineageTask', () => {
    let task: LineageTask;

    it('should emit the lineage event properly', async () => {
        const logger = pino(
            pino.destination({
                sync: true // test frameworks must use pino logger in sync mode!
            })
        );
        task = new LineageTask(logger, new SFNClient({}), '', new EventPublisher(logger, new EventBridgeClient({}), '', ''));

        await task.process({
            dataAsset: {
                id: "",
                idcUserId: "",
                catalog: {
                    domainId: "1111",
                    domainName: "sample_domain_name",
                    projectId: "",
                    environmentId: "",
                    region: "",
                    assetName: "sample_output",
                    assetId: "",
                    accountId: "",
                    autoPublish: false
                },
                workflow: {
                    name: "",
                    roleArn: "",
                    dataset: {
                        "name": "redshift-automated-test-epc13",
                        format: "avro",
                        connection: {
                            "redshift": {
                                "secretArn": "arn:aws:secretsmanager:us-west-2:767397875118:secret:redshift!df-redshift-test-namespace-admin-9rP6W5",
                                "jdbcConnectionUrl": "jdbc:redshift://df-redshift-test-workgroup.767397875118.us-west-2.redshift-serverless.amazonaws.com:5439/dev",
                                "subnetId": "subnet-05769b1803a56904e",
                                "securityGroupIdList": ["sg-00de20bbf3a80426d"],
                                "availabilityZone": "us-west-2c",
                                "path": "dev/public/ski_resorts",
                                "databaseTableName": "public.ski_resorts"
                            }
                        }
                    },

                },
                lineage: {
                    root: {
                        "producer": "arn:aws:states:ap-southeast-2:033295216537:stateMachine:df-data-asset",
                        "schemaURL": "https://openlineage.io/spec/1-0-5/OpenLineage.json#/definitions/RunEvent",
                        "job": {
                            "namespace": "df-sample_domain_name-1111",
                            "name": "df_data_asset - sample_output",
                            "facets": {
                                "documentation": {
                                    "_producer": "arn:aws:states:ap-southeast-2:033295216537:stateMachine:df-data-asset",
                                    "_schemaURL": "https://github.com/OpenLineage/OpenLineage/blob/main/spec/facets/DocumentationJobFacet.json",
                                    "description": "Catalogs the sample_output within the DataZone catalog for domain df-sample_domain_name-1111"
                                },
                                "ownership": {
                                    "_producer": "arn:aws:states:ap-southeast-2:033295216537:stateMachine:df-data-asset",
                                    "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/OwnershipJobFacet.json",
                                    "owners": [
                                        {
                                            "name": "application:df.DataAssetModule"
                                        }
                                    ]
                                }
                            }
                        },
                        "inputs": [
                            {
                                "namespace": "df-sample_domain_name-1111",
                                "name": "redshift-automated-test-epc13",
                                "inputFacets": {},
                                "facets": {
                                    "storage": {
                                        "fileFormat": "avro",
                                        "storageLayer": "redshift",
                                        "_producer": "arn:aws:states:ap-southeast-2:033295216537:stateMachine:df-data-asset",
                                        "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/StorageDatasetFacet.json"
                                    }
                                }
                            }
                        ],
                        "outputs": [],
                        "eventTime": "2024-03-18T07:57:29.746Z",
                        "eventType": "START",
                        "run": {
                            "runId": "341cf762-b25d-49ce-9e82-f82986337594",
                            "facets": {
                                "nominalTime": {
                                    "_producer": "arn:aws:states:ap-southeast-2:033295216537:stateMachine:df-data-asset",
                                    "_schemaURL": "https://openlineage.io/spec/facets/1-0-0/NominalTimeRunFacet.json",
                                    "nominalStartTime": "2024-03-18T07:57:29.746Z"
                                }
                            }
                        }
                    },
                    dataProfile: undefined,
                    dataQualityProfile: undefined
                }
            },
            execution: {
                executionId: "341cf762-b25d-49ce-9e82-f82986337594",
                executionStartTime: "2024-03-15T06:31:20.772Z",
                stateMachineArn: "arn:aws:states:ap-southeast-2:033295216537:stateMachine:df-data-asset"
            }
        })
    })
});
