import { Bus, DFEventDetailType, DFEventSource, eventBusHubReplicationRuleTargetRoleArn, saprPermissionsBoundaryArn, saprPermissionsBoundaryName, saprRoleArn } from "@df/cdk-common";
import { Construct } from "constructs";
import * as events from "aws-cdk-lib/aws-events";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import path from "path";
import * as cdk from "aws-cdk-lib";
import { fileURLToPath } from "url";
import { NagSuppressions } from 'cdk-nag';

export interface AccessGrantorConstructProps {
  hubAccountId: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AccessGrantor extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: AccessGrantorConstructProps
  ) {
    super(scope, id);
    const accountId = cdk.Stack.of(this).account;

    // DF Event Bus
    const dfEventBus = new Bus(this, "EventBus");

    // Allow hub account role to put events to this event bus
    dfEventBus.eventBus.addToResourcePolicy(new iam.PolicyStatement({
      sid: "AllowHubAccountToPutEvents",
      effect: iam.Effect.ALLOW,
      principals: [new iam.ArnPrincipal(eventBusHubReplicationRuleTargetRoleArn(props.hubAccountId))],
      actions: ["events:PutEvents"],
      resources: [dfEventBus.eventBus.eventBusArn],
    }));

    // SAPR Provisioning
    const enrichedSubscriptionCreatedRule = new events.Rule(
      this,
      `EnrichedSubscriptionCreatedRule-SAPR-Provisioning`,
      {
        eventBus: dfEventBus.eventBus,
        eventPattern: {
          detailType: [DFEventDetailType.ENRICHED_SUBSCRIPTION_CREATED],
          source: [DFEventSource.SUBSCRIPTION_ENRICHMENT],
        },
      }
    );
    const saprPermissionsBoundary = new iam.ManagedPolicy(this, "SaprPermBoundary", {
      managedPolicyName: saprPermissionsBoundaryName,
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          resources: ['*'],
          actions: ['s3:GetObject'],
          conditions: {
            StringEquals: {
              "s3:ResourceAccount": accountId,
            },
          }
        }),
      ],
    });
    const saprProvisioningLambdaRole = new iam.Role(
      this,
      "SaprProvisioningLambdaRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );

    saprProvisioningLambdaRole.node.addDependency(saprPermissionsBoundary);

    saprProvisioningLambdaRole.addToPolicy(
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
    saprProvisioningLambdaRole.addToPolicy(
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
    saprProvisioningLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AllowCreateUpdateSaprRole1",
        effect: iam.Effect.ALLOW,
        actions: [
          "iam:CreateRole",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
        ],
        resources: [saprRoleArn(accountId, "*", "*")],
        conditions: {
          StringEquals: {
            "iam:PermissionsBoundary": saprPermissionsBoundaryArn(
              accountId
            ),
          },
        },
      })
    );
    saprProvisioningLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AllowCreateUpdateSaprRole2",
        effect: iam.Effect.ALLOW,
        actions: [
          "iam:GetRole",
          "iam:UpdateRole",
          "iam:GetRolePolicy",
        ],
        resources: [saprRoleArn(accountId, "*", "*")],
      })
    );
    const saprProvisioningLambda = new lambdaNode.NodejsFunction(
      this,
      "SaprProvisioningLambda",
      {
        description: `Access Management Access Grantor function to provision the SAPR role.`,
        role: saprProvisioningLambdaRole,
        entry: path.join(
          __dirname,
          "../../../../../typescript/packages/apps/access-management/src/lambda_df_eventbridge_provision_sapr.ts"
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
      new targets.LambdaFunction(saprProvisioningLambda)
    );

    NagSuppressions.addResourceSuppressions([saprPermissionsBoundary], [
      {
        id: 'AwsSolutions-IAM5',
        appliesTo: ['Resource::*'],
        reason: 'The SAPR permissions boundary does not restrict the S3 resource as it is a boundary and restriction is done through the asset approval process.'
      }
    ]);
    NagSuppressions.addResourceSuppressions([saprProvisioningLambdaRole], [
      {
        id: 'AwsSolutions-IAM5',
        appliesTo: ['Resource::*'],
        reason: 'CloudWatch logs and X-Ray tracing allowed on *.'
      }
    ], true);
    NagSuppressions.addResourceSuppressions([saprProvisioningLambdaRole], [
      {
        id: 'AwsSolutions-IAM5',
        appliesTo: [`Resource::${saprRoleArn(accountId, "*", "*")}`],
        reason: 'Role updates must be allowed for all domainIds and projectIds. These IDs are not known at deploy time.'
      }
    ], true);
  }
}
