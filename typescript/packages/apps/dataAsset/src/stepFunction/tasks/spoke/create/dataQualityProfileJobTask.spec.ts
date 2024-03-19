import { beforeEach, describe, it } from 'vitest';
import { DataQualityProfileJobTask } from "./dataQualityProfileJobTask";
import pino from "pino";
import { GlueClient } from "@aws-sdk/client-glue";
import { S3Utils } from "../../../../common/s3Utils";
import { S3Client } from "@aws-sdk/client-s3";
import type { GetSignedUrl } from '../../../../plugins/module.awilix';

describe('DataQualityProfileJobTask', () => {

    let task: DataQualityProfileJobTask;

    beforeEach(() => {
        const logger = pino(
            pino.destination({
                sync: true // test frameworks must use pino logger in sync mode!
            })
        );
        logger.level = 'info';
        let mockGetSignedUrl: GetSignedUrl;
        task = new DataQualityProfileJobTask(logger, new GlueClient({}), 'default', new S3Utils(logger, new S3Client({}), 'cdf-singlestack-ap-southeast-2', 'datafabric', mockGetSignedUrl))
    })

    it('should process the event correctly', async () => {

        await task.process({
            dataAsset: {
                id: "11111",
                execution: {
                    hubExecutionId: "341cf762-b25d-49ce-9e82-f82986337594",
                    hubStartTime: "2024-03-15T06:31:20.772Z",
                    hubStateMachineArn: "arn:aws:states:ap-southeast-2:033295216537:stateMachine:df-data-asset",
                    hubTaskToken: ''
                },
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
                    dataQuality: {
                        ruleset: `Rules = [ (ColumnValues "groupvalue" >= 26) OR (ColumnLength "groupvalue" >= 4) ]`
                    },
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
                    root: undefined,
                    dataProfile: undefined,
                    dataQualityProfile: undefined
                }
            },
            execution: {
                executionId: "341cf762-b25d-49ce-9e82-f82986337594",
                executionStartTime: "2024-03-15T06:31:20.772Z",
                stateMachineArn: "arn:aws:states:ap-southeast-2:033295216537:stateMachine:df-data-asset"
            }
        });
    }, 60000)

});
