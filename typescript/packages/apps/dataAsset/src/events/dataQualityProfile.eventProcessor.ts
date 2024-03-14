import type { DataQualityResultsAvailableEvent, RuleResult, RunEvent } from "@df/events";
import { OpenLineageBuilder } from "@df/events";
import type { BaseLogger } from "pino";
import type { SFNClient } from "@aws-sdk/client-sfn";
import { SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import { GetDataQualityResultCommand, GetDataQualityRulesetEvaluationRunCommand, GetTagsCommand, GlueClient } from "@aws-sdk/client-glue";
import { validateNotEmpty } from "@df/validators";
import type { S3Utils } from "../common/s3Utils.js";
import { TaskType } from "../stepFunction/tasks/models.js";

export class DataQualityProfileEventProcessor {

    constructor(private readonly log: BaseLogger,
                private readonly sfnClient: SFNClient,
                private readonly s3Utils: S3Utils,
                private readonly glueClient: GlueClient) {
    }

    public async dataQualityProfileCompletionEvent(event: DataQualityResultsAvailableEvent) {
        this.log.info(`DataQualityProfileEventProcessor > dataQualityProfileCompletionEvent >in  event: ${JSON.stringify(event)}`);

        validateNotEmpty(event, 'Data Quality Profile Completion event');
        validateNotEmpty(event.detail.rulesetNames, 'Data Quality Ruleset Names');

        const {rulesetNames, resultId, context} = event.detail;

        /**
         * There will only one ruleset configured by Data Fabric
         */
        const rulesetName = rulesetNames[0];

        const [getTagsResponse, getEvaluationResponse, getResultResponse] = await Promise.all([
            /**
             * Request Id needed to query the SSM parameters is stored in the tag
             */
            this.glueClient.send(new GetTagsCommand({
                ResourceArn: `arn:aws:glue:${event.region}:${event.account}:dataQualityRuleset/${rulesetName}`
            })),
            /**
             * Evaluation Run contains the run start and end time
             */
            this.glueClient.send(new GetDataQualityRulesetEvaluationRunCommand({
                RunId: context.runId
            })),
            /**
             * Data Quality Result contains list of assertion details
             */
            this.glueClient.send(new GetDataQualityResultCommand({
                ResultId: resultId
            }))
        ])

        const requestId = getTagsResponse.Tags['requestId'];

        const dataAssetTask = await this.s3Utils.getTaskData(TaskType.DataQualityProfileTask, requestId);

        const {rulesFailed, rulesSucceeded, rulesSkipped, score} = event.detail
        dataAssetTask.dataAsset.execution = {
            ...dataAssetTask.dataAsset.execution,
            dataQualityProfileJob: {
                id: context.runId,
                status: event.detail.state,
                stopTime: getEvaluationResponse.CompletedOn.toISOString(),
                startTime: getEvaluationResponse.StartedOn.toISOString(),
                message: `Rule Failed: ${rulesFailed}. Rule Skipped:${rulesSkipped}, Rule Succeeded: ${rulesSucceeded}, Score: ${score}`,
            }
        }

        const dataQualityProfileLineageEvent = dataAssetTask.dataAsset?.lineage?.[TaskType.DataQualityProfileTask];
        if (!dataQualityProfileLineageEvent) {
            throw new Error('No start lineage event for data quality.')
        }
        dataAssetTask.dataAsset.lineage[TaskType.DataQualityProfileTask] = this.constructDataLineage(dataQualityProfileLineageEvent, getResultResponse.RuleResults, context.runId)
        this.log.info(`DataQualityProfileEventProcessor > dataQualityProfileCompletionEvent > before sfnClient.send`);
        // Signal back to the state machine
        await this.sfnClient.send(new SendTaskSuccessCommand({output: JSON.stringify(dataAssetTask), taskToken: dataAssetTask.execution.taskToken}));
    }

    private constructDataLineage(lineageEvent: Partial<RunEvent>, ruleResults: RuleResult[], runId: string): Partial<RunEvent> {
        this.log.info(`JobEventProcessor > constructDataLineage > in> lineageEvent: ${lineageEvent}, ruleResults: ${ruleResults}`);
        const openLineageBuilder = new OpenLineageBuilder();
        openLineageBuilder
            .setOpenLineageEvent(lineageEvent)
            .setQualityResult({
                runId,
                result: {
                    ruleResults
                },
            });
        return openLineageBuilder.build();
    }
}
