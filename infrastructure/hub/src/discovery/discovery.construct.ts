import { Construct } from "constructs";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import { NagSuppressions } from "cdk-nag";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DiscoveryConstructProperties {
    cognitoUserPoolId: string;
    identityStoreId: string;
}

export class Discovery extends Construct {
    constructor(scope: Construct, id: string, props: DiscoveryConstructProperties) {

        super(scope, id);
        const accountId = cdk.Stack.of(this).account;

        const discoveryApiLambda = new lambdaNode.NodejsFunction(
            this,
            "DiscoveryApiLambda",
            {
                description: `Discovery function to find and retrieve data asset metadata from DataZone`,
                entry: path.join(
                    __dirname,
                    "../../../../typescript/packages/apps/discovery/src/lambda_apiGateway.ts"
                ),
                runtime: lambda.Runtime.NODEJS_18_X,
                tracing: lambda.Tracing.ACTIVE,
                memorySize: 512,
                logRetention: logs.RetentionDays.ONE_WEEK,
                environment: {
                    IDENTITY_STORE_ID: props.identityStoreId
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
                    "../../../../common/config/rush/pnpm-lock.yaml"
                ),
                architecture: lambda.Architecture.ARM_64,
                timeout: cdk.Duration.seconds(10),
            }
        );


        discoveryApiLambda.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["identitystore:IsMemberInGroups", "identitystore:GetUserId"],
          resources: [
            `arn:aws:identitystore::${accountId}:identitystore/${props.identityStoreId}`,
            `arn:aws:identitystore:::user/*`,
          ],
        })
      );
      discoveryApiLambda.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "datazone:GetListing",
            "datazone:GetUserProfile",
          ],
          resources: ["*"],
        })
      );

      discoveryApiLambda.addToRolePolicy(
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
      discoveryApiLambda.addToRolePolicy(
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

        const logGroup = new logs.LogGroup(this, "DiscoveryApiLogs");

        const restApi = new apigw.LambdaRestApi(this, "DiscoveryApi", {
            restApiName: `DiscoveryApi`,
            description: `DiscoveryApi`,
            handler: discoveryApiLambda,
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
        ], true);

        NagSuppressions.addResourceSuppressions([discoveryApiLambda],
            [
                {
                    id: 'AwsSolutions-L1',
                    reason: 'Latest runtime not needed.'
                },
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: ['Resource::*'],
                    reason: 'CloudWatch logs and X-Ray tracing allowed on * and DataZone GetListing must find all assets.'
                },
                {
                    id: 'AwsSolutions-IAM4',
                    reason: 'This only contains the policy the create and insert log to log group.',
                    appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
                },
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [`Resource::arn:aws:identitystore:::user/*`],
                    reason: 'Must allow on all users to convert cognito IDs to IAM Identity Center IDs. See https://docs.aws.amazon.com/service-authorization/latest/reference/list_awsidentitystore.html for details.'
                  },
            ],
            true);


    }
}
