import { beforeEach, describe, it } from 'vitest';
import { DataQualityProfileJobTask } from "./dataQualityProfileJobTask";
import pino from "pino";
import { GlueClient } from "@aws-sdk/client-glue";
import type { DataAssetTask } from "../../models";
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
        task = new DataQualityProfileJobTask(logger, new GlueClient({}), 'default', new S3Utils(logger, new S3Client({}), 'cdf-singlestack-ap-southeast-2', 'datafabric',mockGetSignedUrl))
    })

    it('should process the event correctly', async () => {

        const input: DataAssetTask = {
            dataAsset: {
                execution: {
                    glueTableName: 'metrics'
                },
                requestId: '12345',
                catalog: {
                    domainId: '1111',
                    domainName: 'TestName',
                    environmentId: '',
                    assetName: '',
                    accountId: '',
                    autoPublish: false,

                },
                lineage: {},
                workflow: {
                    name: 'create-data-asset',
                    roleArn: 'arn:aws:iam::033295216537:role/service-role/AWSGlueServiceRole-SIF',
                    dataset: {
                        name: 'some dataset name',
                        format: 'avro'
                    },
                    dataQuality: {
                        ruleset: `Rules = [ (ColumnValues "groupvalue" >= 26) OR (ColumnLength "groupvalue" >= 4) ]`
                    }
                }
            }, execution: {
                executionArn: '',
                executionStartTime: '',
                taskToken: 'someTaskToken'
            }
        }

        await task.process(input);
    }, 60000)

});
