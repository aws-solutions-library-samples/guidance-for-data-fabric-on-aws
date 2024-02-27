import { Construct } from "constructs";
import * as events from "aws-cdk-lib/aws-events";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";
import path from "path";
import { fileURLToPath } from "url";
import {
  DFEventDetailType,
  DFEventSource,
  eventBusHubReplicationRuleTargetRoleName,
  haprPermissionsBoundaryArn,
  haprPermissionsBoundaryName,
  haprRoleArn,
  saprRoleArn,
  dfEventBusArn,
} from "@df/cdk-common";
import { NagSuppressions } from 'cdk-nag';


export interface AccessGrantorConstructProperties {
  spokeAccountIds: string[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AccessGrantor extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: AccessGrantorConstructProperties
  ) {
    super(scope, id);
    const accountId = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;
    // Rule to handle DZ events on default bus - filters for subscription approved events
    const dzRawSubscriptionCreatedRule = new events.Rule(
      this,
      "DzRawSubscriptionCreatedRule",
      {
        eventBus: events.EventBus.fromEventBusName(
          this,
          "DefaultBus",
          "default"
        ),
        eventPattern: {
          detailType: ["Subscription Created"],
          source: ["aws.datazone"],
        },
      }
    );

    // Lambda function for enriching data
    // Needs DF EB write access and datazone read access
    const subscriptionEventEnrichmentLambda = new lambdaNode.NodejsFunction(
      this,
      "SubscriptionEventEnrichmentLambda",
      {
        description: `Access Management Access Grantor function to enrich default EventBridge events when subscriptions are created.`,
        entry: path.join(
          __dirname,
          "../../../../../typescript/packages/apps/access-management/src/lambda_default_eventbridge.ts"
        ),
        runtime: lambda.Runtime.NODEJS_18_X,
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 512,
        logRetention: logs.RetentionDays.ONE_WEEK,
        environment: {
          VAR_NAME: "val",
        },
        bundling: {
          minify: true,
          format: lambdaNode.OutputFormat.ESM,
          target: "node18.16",
          sourceMap: false,
          sourcesContent: false,
          banner:
            "import { createRequire } from 'module';const require = createRequire(import.meta.url);import { fileURLToPath } from 'url';import { dirname } from 'path';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);",
        },
        depsLockFilePath: path.join(
          __dirname,
          "../../../../../common/config/rush/pnpm-lock.yaml"
        ),
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(10),
      }
    );
    // Target to point to Lambda function
    dzRawSubscriptionCreatedRule.addTarget(
      new targets.LambdaFunction(subscriptionEventEnrichmentLambda)
    );
    // EventBridge bus for cross-account communication events from domain EB (DF-Event-Bus)
    const dfEventBus = events.EventBus.fromEventBusArn(
      this,
      "DfEventBus",
      dfEventBusArn(accountId, region)
    );
    dfEventBus.grantPutEventsTo(subscriptionEventEnrichmentLambda);
    // https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazondatazone.html
    subscriptionEventEnrichmentLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["datazone:ListSubscriptions", "datazone:GetListing"],
        resources: ["*"],
      })
    );
    // Replication infrastructure
    const dfReplicationRuleTargetRole = new iam.Role(
      this,
      "DfReplicationRuleTargetRole",
      {
        roleName: eventBusHubReplicationRuleTargetRoleName,
        assumedBy: new iam.ServicePrincipal("events.amazonaws.com"),
      }
    );
    for (const spokeAccountId of props.spokeAccountIds) {
      const enrichedSubscriptionCreatedRule = new events.Rule(
        this,
        `EnrichedSubscriptionCreatedRule-${spokeAccountId}`,
        {
          eventBus: dfEventBus,
          eventPattern: {
            detailType: [DFEventDetailType.ENRICHED_SUBSCRIPTION_CREATED],
            source: [DFEventSource.SUBSCRIPTION_ENRICHMENT],
            detail: {
              dfData: {
                spokeAccountId: [spokeAccountId],
              },
            },
          },
        }
      );
      const spokeAccountDfBus = events.EventBus.fromEventBusArn(
        this,
        `SpokeAccountDfBus-${spokeAccountId}`,
        dfEventBusArn(spokeAccountId, region)
      );
      enrichedSubscriptionCreatedRule.addTarget(
        new targets.EventBus(spokeAccountDfBus, {
          role: dfReplicationRuleTargetRole,
        })
      );
      spokeAccountDfBus.grantPutEventsTo(dfReplicationRuleTargetRole);
    }

    // DF-Event-Bus rule to listen for new subscriptions
    const enrichedSubscriptionCreatedRule = new events.Rule(
      this,
      `EnrichedSubscriptionCreatedRule-HAPR-Provisioning`,
      {
        eventBus: dfEventBus,
        eventPattern: {
          detailType: [DFEventDetailType.ENRICHED_SUBSCRIPTION_CREATED],
          source: [DFEventSource.SUBSCRIPTION_ENRICHMENT],
        },
      }
    );

    const haprPermissionsBoundary = new iam.ManagedPolicy(this, "HaprPermBoundary", {
      managedPolicyName: haprPermissionsBoundaryName,
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          resources: props.spokeAccountIds.map((spokeAccountId) =>
            saprRoleArn(spokeAccountId, "*", "*")
          ),
          actions: ["sts:AssumeRole"],
        }),
      ],
    });

    const haprProvisioningLambdaRole = new iam.Role(
      this,
      "HaprProvisioningLambdaRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );

    haprProvisioningLambdaRole.node.addDependency(haprPermissionsBoundary);

    haprProvisioningLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AllowCloudWatchLogs",
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["*"],
      })
    );
    haprProvisioningLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AllowXRayAccess",
        effect: iam.Effect.ALLOW,
        actions: [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets",
          "xray:GetSamplingStatisticSummaries",
        ],
        resources: ["*"],
      })
    );
    haprProvisioningLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AllowCreateUpdateHaprRole1",
        effect: iam.Effect.ALLOW,
        actions: [
          "iam:CreateRole",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
        ],
        resources: [haprRoleArn(accountId, "*", "*")],
        conditions: {
          StringEquals: {
            "iam:PermissionsBoundary": haprPermissionsBoundaryArn(
              accountId
            ),
          },
        },
      })
    );
    haprProvisioningLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AllowCreateUpdateHaprRole2",
        effect: iam.Effect.ALLOW,
        actions: ["iam:GetRole", "iam:UpdateRole", "iam:GetRolePolicy"],
        resources: [haprRoleArn(accountId, "*", "*")],
      })
    );
    const haprProvisioningLambda = new lambdaNode.NodejsFunction(
      this,
      "HaprProvisioningLambda",
      {
        description: `Access Management Access Grantor function to provision the HAPR role.`,
        role: haprProvisioningLambdaRole,
        entry: path.join(
          __dirname,
          "../../../../../typescript/packages/apps/access-management/src/lambda_df_eventbridge_provision_hapr.ts"
        ),
        runtime: lambda.Runtime.NODEJS_18_X,
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 512,
        logRetention: logs.RetentionDays.ONE_WEEK,
        environment: {
          VAR_NAME: "val",
        },
        bundling: {
          minify: true,
          format: lambdaNode.OutputFormat.ESM,
          target: "node18.16",
          sourceMap: false,
          sourcesContent: false,
          banner:
            "import { createRequire } from 'module';const require = createRequire(import.meta.url);import { fileURLToPath } from 'url';import { dirname } from 'path';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);",
        },
        depsLockFilePath: path.join(
          __dirname,
          "../../../../../common/config/rush/pnpm-lock.yaml"
        ),
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(10),
      }
    );
    enrichedSubscriptionCreatedRule.addTarget(
      new targets.LambdaFunction(haprProvisioningLambda)
    );

    NagSuppressions.addResourceSuppressions([subscriptionEventEnrichmentLambda, haprProvisioningLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy is generated by CDK.'

				}
			],
			true);
      NagSuppressions.addResourceSuppressions([subscriptionEventEnrichmentLambda], [
        {
          id: 'AwsSolutions-IAM5',
          appliesTo: ['Resource::*'],
          reason: 'DataZone permissions for ListSubscription and GetListing cannot be restricted based on resource'
        }
      ], true);
      NagSuppressions.addResourceSuppressions([haprPermissionsBoundary], [
        {
          id: 'AwsSolutions-IAM5',
          appliesTo: props.spokeAccountIds.map(spokeAccountId => `Resource::${saprRoleArn(spokeAccountId, "*", "*")}`),
          reason: 'The HAPR permissions boundary cannot know the, domainId or projectId at deploy time.'
        }
      ]);
      NagSuppressions.addResourceSuppressions([haprProvisioningLambdaRole], [
        {
          id: 'AwsSolutions-IAM5',
          appliesTo: ['Resource::*'],
          reason: 'CloudWatch logs and X-Ray tracing allowed on *.'
        },
        {
          id: 'AwsSolutions-IAM5',
          appliesTo: [`Resource::${haprRoleArn('<AWS::AccountId>', "*", "*")}`],
          reason: 'Must allow * on role naming for the domainId and projectId'
        }
      ], true);
    }
}
