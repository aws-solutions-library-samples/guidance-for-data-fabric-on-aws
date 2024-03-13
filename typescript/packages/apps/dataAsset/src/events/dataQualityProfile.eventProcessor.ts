import type { DataQualityResultsAvailableEvent, RuleResult, RunEvent } from "@df/events";
import { OpenLineageBuilder } from "@df/events";
import { validateNotEmpty } from "@df/validators/dist";
import type { BaseLogger } from "pino";
import type { SFNClient } from "@aws-sdk/client-sfn";
import { SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { GetDataQualityResultCommand, GetDataQualityRulesetEvaluationRunCommand, GetTagsCommand, GlueClient } from "@aws-sdk/client-glue";
import type { DataAssetTask } from "../stepFunction/tasks/models.js";

export class DataQualityProfileEventProcessor {

    constructor(private readonly log: BaseLogger,
                private readonly sfnClient: SFNClient,
                private readonly ssmClient: SSMClient,
                private readonly glueClient: GlueClient,
                private readonly accountId: string,
                private readonly region: string) {
    }

    public async dataQualityProfileCompletionEvent(event: DataQualityResultsAvailableEvent) {
        this.log.info(`DataQualityProfileEventProcessor > dataQualityProfileCompletionEvent >in  event: ${JSON.stringify(event)}`);

        validateNotEmpty(event, 'Data Quality Profile Completion event');

        const {rulesetNames, resultID, context} = event.detail;

        /**
         * There will only one ruleset configured by Data Fabric
         */
        const rulesetName = rulesetNames.pop();

        const [getTagsResponse, getEvaluationResponse, getResultResponse] = await Promise.all([
            /**
             * Request Id needed to query the SSM parameters is stored in the tag
             */
            this.glueClient.send(new GetTagsCommand({
                ResourceArn: `arn:aws:glue:${this.region}:${this.accountId}:dataQualityRuleset/${rulesetName}`
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
                ResultId: resultID
            }))
        ])

        const param = await this.ssmClient.send(new GetParameterCommand({
            Name: `/df/spoke/dataAsset/stateMachineExecution/create/${getTagsResponse.Tags['requestId']!}`
        }));

        const taskInput: DataAssetTask = JSON.parse(param.Parameter.Value);

        const {rulesFailed, rulesSucceeded, rulesSkipped, score} = event.detail

        taskInput.dataAsset.execution = {
            ...taskInput.dataAsset.execution,
            dataQualityProfileJob: {
                id: event.detail.resultID,
                status: event.detail.state,
                stopTime: getEvaluationResponse.CompletedOn.toISOString(),
                startTime: getEvaluationResponse.StartedOn.toISOString(),
                message: `Rule Failed: ${rulesFailed}. Rule Skipped:${rulesSkipped}, Rule Succeeded: ${rulesSucceeded}, Score: ${score}`,
            }
        }

        await this.constructDataLineage(taskInput.dataAsset.lineage!.pop(), getResultResponse.RuleResults, context.runId);

        // Signal back to the state machine
        await this.sfnClient.send(new SendTaskSuccessCommand({output: JSON.stringify(taskInput), taskToken: taskInput.execution.taskToken}));
    }

    private async constructDataLineage(lineageEvent: Partial<RunEvent>, ruleResults: RuleResult[], runId: string): Promise<Partial<RunEvent>> {
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
