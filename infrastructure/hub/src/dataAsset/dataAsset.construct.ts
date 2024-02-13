import { getLambdaArchitecture } from '@sdf/cdk-common';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { AttributeType, BillingMode, ProjectionType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy, Aspects, Stack } from 'aws-cdk-lib';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { AccessLogFormat, AuthorizationType, CfnMethod, CognitoUserPoolsAuthorizer, Cors, EndpointType, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';


import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NagSuppressions } from 'cdk-nag';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type DataAssetConstructProperties = {
	domainId: string;
    moduleName: string;
	eventBusName: string;
	cognitoUserPoolId: string;
};


export class DataAsset extends Construct {
	public readonly tableName: string;
    public readonly tableArn: string;
    public readonly functionName: string;
    public readonly apiUrl: string;
    public readonly apiName: string;

	constructor(scope: Construct, id: string, props: DataAssetConstructProperties) {
		super(scope, id);

		const namePrefix = `sdf-${props.domainId}`;
        const eventBus = EventBus.fromEventBusName(this, 'EventBus', props.eventBusName);


        const table = new Table(this, 'Table', {
            tableName: `${namePrefix}-${props.moduleName}`,
            partitionKey: {
                name: 'pk',
                type: AttributeType.STRING,
            },
            sortKey: {
                name: 'sk',
                type: AttributeType.STRING,
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
            encryption: TableEncryption.AWS_MANAGED,
            pointInTimeRecovery: true,
            removalPolicy: RemovalPolicy.DESTROY
        });

        // define GSI1
        table.addGlobalSecondaryIndex({
            indexName: 'siKey1-pk-index',
            partitionKey: {
                name: 'siKey1',
                type: AttributeType.STRING,
            },
            sortKey: {
                name: 'pk',
                type: AttributeType.STRING,
            },
            projectionType: ProjectionType.ALL,
        });

        // define GSI2
        table.addGlobalSecondaryIndex({
            indexName: 'siKey2-pk-index',
            partitionKey: {
                name: 'siKey2',
                type: AttributeType.STRING,
            },
            sortKey: {
                name: 'pk',
                type: AttributeType.STRING,
            },
            projectionType: ProjectionType.ALL,
        });

        // define GSI3
        table.addGlobalSecondaryIndex({
            indexName: 'siKey3-siSort3-index',
            partitionKey: {
                name: 'siKey3',
                type: AttributeType.STRING,
            },
            sortKey: {
                name: 'siSort3',
                type: AttributeType.STRING,
            },
            projectionType: ProjectionType.ALL,
        });

        this.tableName = table.tableName;
        this.tableArn = table.tableArn;

        /**
		 * Define the API Lambda
		 */
		const apiLambda = new NodejsFunction(this, 'Apilambda', {
			functionName: `${namePrefix}-${props.moduleName}-api`,
			description: `Data Asset API: domainId ${props.domainId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/lambda_apiGateway.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				EVENT_BUS_NAME: props.eventBusName,
				DOMIAN_ID: props.domainId,
				TABLE_NAME: table.tableName,
				WORKER_QUEUE_URL: 'not used',
			},

			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

        apiLambda.node.addDependency(table);
        table.grantReadWriteData(apiLambda);
		eventBus.grantPutEventsTo(apiLambda);

        this.functionName =apiLambda.functionName;

        /**
		 * Define the API Gateway
		 */

        const userPool = UserPool.fromUserPoolId(this, 'UserPool', props.cognitoUserPoolId);
		const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
			cognitoUserPools: [userPool],
		});

		const logGroup = new LogGroup(this, 'DataAssetApiLogs');
		const apigw = new LambdaRestApi(this, 'ApiGateway', {
			restApiName: `${namePrefix}-${props.moduleName}`,
			description: `Data Asset API: DomainId ${props.domainId}`,
			handler: apiLambda,
			proxy: true,
			deployOptions: {
				stageName: 'prod',
				accessLogDestination: new LogGroupLogDestination(logGroup),
				accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
				loggingLevel: MethodLoggingLevel.INFO,
			},
			defaultCorsPreflightOptions: {
				allowOrigins: Cors.ALL_ORIGINS,
				allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent', 'Accept-Version', 'x-groupcontextid']
			},
			endpointTypes: [EndpointType.REGIONAL],
			defaultMethodOptions: {
				authorizationType: AuthorizationType.COGNITO,
				authorizer,
			},
		});

		Aspects.of(apigw).add({
			visit(node) {
				if (node instanceof CfnMethod && node.httpMethod === 'OPTIONS') {
					node.addPropertyOverride('AuthorizationType', 'NONE');
				}
			}
		});


		apigw.node.addDependency(apiLambda);
        
        const accountId = Stack.of(this).account;
		const region = Stack.of(this).region;
        NagSuppressions.addResourceSuppressions([apiLambda],
            [
                {
                    id: 'AwsSolutions-IAM4',
                    appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
                    reason: 'This policy is the one generated by CDK.'
  
                },
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`],
                    reason: 'This policy is required for the lambda to access the resource api table.'
  
                },
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: ['Resource::*'],
                    reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments actions.'
  
                }
            ],
            true);
  
          NagSuppressions.addResourceSuppressions([apigw],
            [
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
                    id: 'AwsSolutions-APIG4',
                    reason: 'OPTIONS has no auth.'
                },
                {
                    id: 'AwsSolutions-COG4',
                    reason: 'OPTIONS does not use Cognito auth.'
                },
            ],
            true);
    }
}
