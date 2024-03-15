import { beforeEach, describe, it } from 'vitest';
import pino from "pino";
import { GlueClient } from "@aws-sdk/client-glue";
import { SFNClient } from '@aws-sdk/client-sfn';
import { S3Client } from "@aws-sdk/client-s3";
import type { GetSignedUrl } from '../../plugins/module.awilix.js';
import { S3Utils } from "../../common/s3Utils.js";
import { DataQualityProfileEventProcessor } from "./dataQualityProfile.eventProcessor.js";


describe('DataQualityProfileEventProcessor', () => {

    let processor: DataQualityProfileEventProcessor;

    beforeEach(() => {
        const logger = pino(
            pino.destination({
                sync: true // test frameworks must use pino logger in sync mode!
            })
        );
        logger.level = 'info';
        let mockGetSignedUrl: GetSignedUrl;
        processor = new DataQualityProfileEventProcessor(
            logger,
            new SFNClient({}),
            new S3Utils(logger, new S3Client({}), 'cdf-singlestack-ap-southeast-2', 'datafabric', mockGetSignedUrl),
            new GlueClient({}))
    })

    it('should process the event correctly', async () => {
        await processor.dataQualityProfileCompletionEvent({
            "version": "0",
            "detail-type": "Data Quality Evaluation Results Available",
            "source": "aws.glue",
            "account": "033295216537",
            "time": "2017-09-07T18:57:21Z",
            "region": "ap-southeast-2",
            "detail": {
                "context": {
                    "contextType": "GLUE_DATA_CATALOG",
                    "runId": "dqrun-0300d724ec972f15f8a01a23e15e11bab45603d8",
                    "databaseName": "db-123",
                    "tableName": "table-123",
                    "catalogId": "123456789012"
                },
                "resultId": "dqresult-884b8e684dd193d39816225397b466fd7ea63c03",
                "rulesetNames": ["create-data-asset-12345-dataQualityProfile"],
                "state": "SUCCEEDED",
                "score": 1.00,
                "rulesSucceeded": 100,
                "rulesFailed": 0,
                "rulesSkipped": 0
            }
        });
    }, 60000)

});
