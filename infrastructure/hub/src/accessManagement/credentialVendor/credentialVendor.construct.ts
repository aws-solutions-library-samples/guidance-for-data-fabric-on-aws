import { Construct } from "constructs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";
import path from "path";
import { fileURLToPath } from "url";
import {
  credentialVendorExecutionRoleName,
  haprRoleArn,
} from "@df/cdk-common";
export interface CredentialVendorConstructProperties {
  cognitoUserPoolId: string;
  identityStoreId: string;
}
import { NagSuppressions } from 'cdk-nag';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CredentialVendor extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: CredentialVendorConstructProperties
  ) {
    super(scope, id);
    const accountId = cdk.Stack.of(this).account;

    const credentialVendorApiLambdaRole = new iam.Role(
      this,
      "CredentialVendorApiLambdaRole",
      {
        roleName: credentialVendorExecutionRoleName,
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );
    credentialVendorApiLambdaRole.addToPolicy(
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
    credentialVendorApiLambdaRole.addToPolicy(
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

    credentialVendorApiLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRole"],
        resources: [haprRoleArn(accountId, "*", "*")],
      })
    );

    // https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazondatazone.html
    credentialVendorApiLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "datazone:ListSubscriptions",
          "datazone:GetListing",
          "datazone:ListProjectMemberships",
        ],
        resources: ["*"],
      })
    );
    credentialVendorApiLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sts:GetCallerIdentity"],
        resources: ["*"],
      })
    );

    credentialVendorApiLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["identitystore:IsMemberInGroups", "identitystore:GetUserId"],
        resources: [
          `arn:aws:identitystore::${accountId}:identitystore/${props.identityStoreId}`,
          `arn:aws:identitystore:::user/*`,
          `arn:aws:identitystore:::group/*`,
          `arn:aws:identitystore:::membership/*`,
        ],
      })
    );

    const credentialVendorApiLambda = new lambdaNode.NodejsFunction(
      this,
      "CredentialVendorApiLambda",
      {
        description: `Access Management Credential Vendor function to generate STS credentials for a user`,
        role: credentialVendorApiLambdaRole,
        entry: path.join(
          __dirname,
          "../../../../../typescript/packages/apps/access-management/src/lambda_apiGateway.ts"
        ),
        runtime: lambda.Runtime.NODEJS_18_X,
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 512,
        logRetention: logs.RetentionDays.ONE_WEEK,
        environment: {
          IDENTITY_STORE_ID: props.identityStoreId,
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

    const userPool = cognito.UserPool.fromUserPoolId(
      this,
      "UserPool",
      props.cognitoUserPoolId
    );

    const authorizer = new apigw.CognitoUserPoolsAuthorizer(
      this,
      "Authorizer",
      {
        cognitoUserPools: [userPool],
      }
    );

    const logGroup = new logs.LogGroup(this, "CredentialVendorApiLogs");
    const restApi = new apigw.LambdaRestApi(this, "CredentialVendorApi", {
      restApiName: `CredentialVendorApi`,
      description: `CredentialVendorApi`,
      handler: credentialVendorApiLambda,
      proxy: true,
      cloudWatchRole: true,
      deployOptions: {
        stageName: "prod",
        accessLogDestination: new apigw.LogGroupLogDestination(logGroup),
        accessLogFormat: apigw.AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: apigw.MethodLoggingLevel.INFO,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
          "X-Amz-Security-Token",
          "X-Amz-User-Agent",
          "Accept-Version",
        ],
      },
      endpointTypes: [apigw.EndpointType.REGIONAL],
      defaultMethodOptions: {
        authorizationType: apigw.AuthorizationType.COGNITO,
        authorizer,
      },
    });
    cdk.Aspects.of(restApi).add({
			visit(node) {
				if (node instanceof apigw.CfnMethod && node.httpMethod === 'OPTIONS') {
					node.addPropertyOverride('AuthorizationType', 'NONE');
				}
			}
		});
    NagSuppressions.addResourceSuppressions([restApi], [
      {
        id: 'AwsSolutions-APIG2',
        reason: 'Request validation is being done by the Fastify module.'
      },
      {
        id: 'AwsSolutions-IAM4',
        appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'],
        reason: 'API GW needs this policy to push logs to cloudwatch.'
      },
      {
        id: "AwsSolutions-APIG4",
        reason: 'OPTIONS has no auth.'
      },
      {
        id: "AwsSolutions-COG4",
        reason: 'OPTIONS does not use Cognito auth.'
      },
    ], true)
    NagSuppressions.addResourceSuppressions([credentialVendorApiLambdaRole],
			[
        {
          id: 'AwsSolutions-IAM5',
          appliesTo: ['Resource::*'],
          reason: 'CloudWatch logs and X-Ray tracing allowed on *'
        },
        {
          id: 'AwsSolutions-IAM5',
          appliesTo: [`Resource::${haprRoleArn('<AWS::AccountId>', "*", "*")}`],
          reason: 'Credential vendor cannot know projectId, and must be able to assume all project HAPR roles for all domains.'
        },
        {
          id: 'AwsSolutions-IAM5',
          appliesTo: [`Resource::arn:aws:identitystore:::group/*`, `Resource::arn:aws:identitystore:::membership/*`, `Resource::arn:aws:identitystore:::user/*`],
          reason: 'Must allow on all groups, memberships and users to test membership for all users in all groups. See https://docs.aws.amazon.com/service-authorization/latest/reference/list_awsidentitystore.html for details.'
        },
			],
			true);
  }
}
