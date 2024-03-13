import { beforeEach, describe, it } from 'vitest';
import { DataQualityProfileJobTask } from "./dataQualityProfileJobTask";
import pino from "pino";
import { GlueClient } from "@aws-sdk/client-glue";
import { SSMClient } from "@aws-sdk/client-ssm";
import type { DataAssetTask } from "../../models";


describe('DataQualityProfileJobTask', () => {

    let task: DataQualityProfileJobTask;

    beforeEach(() => {
        const logger = pino(
            pino.destination({
                sync: true // test frameworks must use pino logger in sync mode!
            })
        );
        logger.level = 'info';
        task = new DataQualityProfileJobTask(logger, new GlueClient({}), 'default', new SSMClient({}))
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
                lineage:[],
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

            }
        }

        await task.process(input);
    }, 60000)

});
