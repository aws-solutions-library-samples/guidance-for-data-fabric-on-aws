import { dfEventBusName, getLambdaArchitecture, OrganizationUnitPath } from '@df/cdk-common';
import { CfnEventBusPolicy, EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { AttributeType, BillingMode, ProjectionType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy, Aspects, Stack, Duration } from 'aws-cdk-lib';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { AccessLogFormat, AuthorizationType, CfnMethod, CognitoUserPoolsAuthorizer, Cors, EndpointType, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';

import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NagSuppressions } from 'cdk-nag';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Choice, Condition, DefinitionBody, IntegrationPattern, JsonPath, LogLevel, StateMachine, TaskInput } from 'aws-cdk-lib/aws-stepfunctions';
import { DATA_ASSET_HUB_CREATE_REQUEST_EVENT, DATA_ASSET_SPOKE_EVENT_SOURCE, DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT, DATA_ASSET_SPOKE_JOB_START_EVENT, DATA_BREW_JOB_STATE_CHANGE } from '@df/events';
import { LambdaFunction, SfnStateMachine } from 'aws-cdk-lib/aws-events-targets';
import { Queue } from 'aws-cdk-lib/aws-sqs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type DataAssetConstructProperties = {
    moduleName: string;
    eventBusName: string;
    bucketName: string;
    cognitoUserPoolId: string;
    orgPath: OrganizationUnitPath
};


export class DataAsset extends Construct {
    public readonly tableName: string;
    public readonly tableArn: string;
    public readonly functionName: string;
    public readonly apiUrl: string;
    public readonly apiName: string;
    public readonly stateMachineArn: string;

    constructor(scope: Construct, id: string, props: DataAssetConstructProperties) {
        super(scope, id);

        const namePrefix = `df`;
        const eventBus = EventBus.fromEventBusName(this, 'EventBus', props.eventBusName);
        // const eventBus:EventBus = EventBus.bind(iEventBus);
        const defaultEventBus = EventBus.fromEventBusName(this, 'DefaultEventBus', 'default');
        const bucket = Bucket.fromBucketName(this,'JobBucket',props.bucketName)
        const accountId = Stack.of(this).account;
        const region = Stack.of(this).region;


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


        const DataZoneAssetReadPolicy = new PolicyStatement({
            actions: [
                'datazone:GetAsset',
                'datazone:ListAssetRevisions'
            ],
            resources: [`*`]
        });

        const DataZoneAssetWritePolicy = new PolicyStatement({
            actions: [
                'datazone:CreateAssetRevision',
                'datazone:CreateAsset',
                'datazone:DeleteAsset'
            ],
            resources: [`*`]
        });

        /**
         * Define the API Lambda
         */
        const apiLambda = new NodejsFunction(this, 'Apilambda', {
            functionName: `${namePrefix}-${props.moduleName}-api`,
            description: `Data Asset API`,
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/lambda_apiGateway.ts'),
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            environment: {
                EVENT_BUS_NAME: props.eventBusName,
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
        apiLambda.addToRolePolicy(DataZoneAssetReadPolicy);
        apiLambda.addToRolePolicy(DataZoneAssetWritePolicy);

        this.functionName = apiLambda.functionName;

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
            description: `Data Asset API`,
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
        this.apiUrl = apigw.url;
        this.apiName = apigw.restApiName;

        // const SFNGetExecutionHistoryPolicy = new PolicyStatement({
        //     actions: ['states:GetExecutionHistory', 'states:DescribeExecution'],
        //     resources: [`arn:aws:states:${region}:${accountId}:execution:df-data-asset:*`]
        // });

        // apiLambda.addToRolePolicy(SFNGetExecutionHistoryPolicy);

        /* TODO Temp Data Asset State MAchine to
            1- create data brew connection
            2- create asset
            3- create job/schedule
            4- run job
            After initial testing this State Machine will be moved to the sub account 
        */

        const SFNSendTaskSuccessPolicy = new PolicyStatement({
            actions: [
                'states:SendTaskSuccess',
                'databrew:CreateDataset',
                'databrew:TagResource',
                'databrew:CreateProfileJob',
                'databrew:CreateRecipe',
                'databrew:CreateRecipeJob',
                'databrew:CreateRuleset',
                'databrew:CreateSchedule',
                'iam:PassRole',
                'databrew:StartJobRun'
            ],
            resources: [
                `arn:aws:states:${region}:${accountId}:stateMachine:df-data-asset`,
                `arn:aws:databrew:${region}:${accountId}:dataset/*`,
                `arn:aws:databrew:${region}:${accountId}:job/*`,
                `arn:aws:iam::${accountId}:role/service-role/*`
            ]
        });


        const createConnectionLambda = new NodejsFunction(this, 'CreateConnectionLambda', {
            description: `Asset Manager Connection creator Task Handler`,
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/connection.handler.ts'),
            functionName: `${namePrefix}-connectionCreationTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                EVENT_BUS_NAME: props.eventBusName
            },
            bundling: {
                minify: true,
                format: OutputFormat.ESM,
                target: 'node18.16',
                sourceMap: false,
                sourcesContent: false,
                banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
                externalModules: ['aws-sdk', 'pg-native']
            },
            depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
            architecture: getLambdaArchitecture(scope)
        });

        createConnectionLambda.addToRolePolicy(SFNSendTaskSuccessPolicy);

        const createDataSetLambda = new NodejsFunction(this, 'CreateDataSetLambda', {
            description: `Asset Manager dataset creator Task Handler`,
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/dataset.handler.ts'),
            functionName: `${namePrefix}-createDataSetTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                EVENT_BUS_NAME: props.eventBusName
            },
            bundling: {
                minify: true,
                format: OutputFormat.ESM,
                target: 'node18.16',
                sourceMap: false,
                sourcesContent: false,
                banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
                externalModules: ['aws-sdk', 'pg-native']
            },
            depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
            architecture: getLambdaArchitecture(scope)
        });

        createDataSetLambda.addToRolePolicy(SFNSendTaskSuccessPolicy);

        const configDataBrewLambda = new NodejsFunction(this, 'ConfigDataBrewLambda', {
            description: `Asset Manager config data brew Task Handler`,
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/job.handler.ts'),
            functionName: `${namePrefix}-configDataBrewTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                EVENT_BUS_NAME: props.eventBusName,
                JOBS_BUCKET_NAME: props.bucketName,
                JOBS_BUCKET_PREFIX: 'jobs'
            },
            bundling: {
                minify: true,
                format: OutputFormat.ESM,
                target: 'node18.16',
                sourceMap: false,
                sourcesContent: false,
                banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
                externalModules: ['aws-sdk', 'pg-native']
            },
            depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
            architecture: getLambdaArchitecture(scope)
        });

        configDataBrewLambda.addToRolePolicy(SFNSendTaskSuccessPolicy);
        eventBus.grantPutEventsTo(configDataBrewLambda);

        const runJobLambda = new NodejsFunction(this, 'runJobLambda', {
            description: `Asset Manager executeJob Task Handler`,
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/runJob.handler.ts'),
            functionName: `${namePrefix}-runJobTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                EVENT_BUS_NAME: props.eventBusName
            },
            bundling: {
                minify: true,
                format: OutputFormat.ESM,
                target: 'node18.16',
                sourceMap: false,
                sourcesContent: false,
                banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
                externalModules: ['aws-sdk', 'pg-native']
            },
            depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
            architecture: getLambdaArchitecture(scope)
        });

        runJobLambda.addToRolePolicy(SFNSendTaskSuccessPolicy);

        const createConnectionTask = new LambdaInvoke(this, 'CreateConnectionTask', {
            lambdaFunction: createConnectionLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            payload: TaskInput.fromObject({
                'dataAssetEvent.$': '$',
                'execution': {
                    'executionStartTime.$': '$$.Execution.StartTime',
                    'executionArn.$': '$$.Execution.Id',
                    'taskToken': JsonPath.taskToken
                }
            }),
            outputPath: '$.dataAssetEvent'
        });

        const createDataSetTask = new LambdaInvoke(this, 'CreateDataSetTask', {
            lambdaFunction: createDataSetLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            payload: TaskInput.fromObject({
                'dataAssetEvent.$': '$',
                'execution': {
                    'executionStartTime.$': '$$.Execution.StartTime',
                    'executionArn.$': '$$.Execution.Id',
                    'taskToken': JsonPath.taskToken
                }
            }),
            outputPath: '$.dataAssetEvent'
        });

        const configDataBrewTask = new LambdaInvoke(this, 'ConfigDataBrewTask', {
            lambdaFunction: configDataBrewLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            payload: TaskInput.fromObject({
                'dataAssetEvent.$': '$',
                'execution': {
                    'executionStartTime.$': '$$.Execution.StartTime',
                    'executionArn.$': '$$.Execution.Id',
                    'taskToken': JsonPath.taskToken
                }
            }),
            outputPath: '$.dataAssetEvent'
        });


        const deadLetterQueue = new Queue(this, 'DeadLetterQueue');
        deadLetterQueue.addToResourcePolicy(new PolicyStatement({
            sid: 'enforce-ssl',
            effect: Effect.DENY,
            principals: [new AnyPrincipal()],
            actions: ['sqs:*'],
            resources: [deadLetterQueue.queueArn],
            conditions: {
                'Bool': {
                    'aws:SecureTransport': 'false'
                }
            }
        }));

        NagSuppressions.addResourceSuppressions([deadLetterQueue],
            [
                {
                    id: 'AwsSolutions-SQS3',
                    reason: 'This is the dead letter queue.'

                }
            ],
            true);

        const dataAssetStateMachineLogGroup = new LogGroup(this, 'DataAssetLogGroup', { logGroupName: `/aws/vendedlogs/states/${namePrefix}-dataAsset`, removalPolicy: RemovalPolicy.DESTROY });

        const dataAssetStateMachine = new StateMachine(this, 'DataAssetStateMachine', {
            definitionBody: DefinitionBody.fromChainable(
                new Choice(this, 'Connection data Found ?')
                    .otherwise(createDataSetTask.next(configDataBrewTask))
                    .when(Condition.or(Condition.isPresent('$.workflow.dataset.connectionId'), Condition.isPresent('$.workflow.dataset.connection')),
                        new Choice(this, 'Is connectionId present?')
                            .otherwise(createConnectionTask.next(createDataSetTask))
                            .when(Condition.isPresent('$.workflow.dataset.connectionId'), createDataSetTask)
                    )
            ),
            logs: { destination: dataAssetStateMachineLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
            stateMachineName: `${namePrefix}-data-asset`,
            tracingEnabled: true
        });

        createConnectionLambda.grantInvoke(dataAssetStateMachine);
        createDataSetLambda.grantInvoke(dataAssetStateMachine);
        configDataBrewLambda.grantInvoke(dataAssetStateMachine);
        runJobLambda.grantInvoke(dataAssetStateMachine);


        const triggerStateMachineRule = new Rule(this, 'TriggerStateMachineRule', {
            eventBus: eventBus,
            eventPattern: {
                detailType: [DATA_ASSET_HUB_CREATE_REQUEST_EVENT]
            }
        });

        triggerStateMachineRule.addTarget(
            new SfnStateMachine(dataAssetStateMachine, {
                deadLetterQueue: deadLetterQueue,
                maxEventAge: Duration.minutes(5),
                retryAttempts: 2
            })
        );

        this.stateMachineArn = dataAssetStateMachine.stateMachineArn;


        /*
            * Job Enrichment Listener
            * Will Enrich job events once a job status change is detected
        */

        const JobEnrichmentPolicy = new PolicyStatement({
            actions: [
                'databrew:DescribeJob',
                'databrew:DescribeJobRun',
            ],
            resources: [
                `arn:aws:databrew:${region}:${accountId}:job/*`,
            ]
        });
        const jobEnrichmentLambda = new NodejsFunction(this, 'JobEnrichmentLambda', {
            description: `Job Completion Event Handler`,
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/lambda_eventbridge.ts'),
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            functionName: `${namePrefix}-dataAsset-jobEnrichment`,
            timeout: Duration.seconds(30),
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            environment: {
                EVENT_BUS_NAME: props.eventBusName,
            },
            bundling: {
                minify: true,
                format: OutputFormat.ESM,
                target: 'node18.16',
                sourceMap: false,
                sourcesContent: false,
                banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
                externalModules: ['aws-sdk', 'pg-native']
            },
            depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
            architecture: getLambdaArchitecture(scope)
        });

        eventBus.grantPutEventsTo(jobEnrichmentLambda);
        bucket.grantRead(jobEnrichmentLambda);
        jobEnrichmentLambda.addToRolePolicy(JobEnrichmentPolicy);


         // Rule for Job Enrichment events
         const jobEnrichmentRule = new Rule(this, 'JobEnrichmentRule', {
            eventBus: defaultEventBus,
            eventPattern: {
                source: ['aws.databrew'],
                detailType: [DATA_BREW_JOB_STATE_CHANGE]
            }
        });

        jobEnrichmentRule.addTarget(
            new LambdaFunction(jobEnrichmentLambda, {
                deadLetterQueue: deadLetterQueue,
                maxEventAge: Duration.minutes(5),
                retryAttempts: 2
            })
        );

        /*
            * Job Completion Listener
            * Will update datazone once job completion is detected in the event bus
        */
        const jobCompletionEventLambda = new NodejsFunction(this, 'JobCompletionEventLambda', {
            description: `Job Completion Event Handler`,
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/lambda_eventbridge.ts'),
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            functionName: `${namePrefix}-dataAsset-jobCompletion`,
            timeout: Duration.seconds(30),
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            environment: {
                TABLE_NAME: table.tableName,
            },
            bundling: {
                minify: true,
                format: OutputFormat.ESM,
                target: 'node18.16',
                sourceMap: false,
                sourcesContent: false,
                banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
                externalModules: ['aws-sdk', 'pg-native']
            },
            depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
            architecture: getLambdaArchitecture(scope)
        });

        table.grantReadWriteData(jobCompletionEventLambda);
        jobCompletionEventLambda.addToRolePolicy(DataZoneAssetReadPolicy);
        jobCompletionEventLambda.addToRolePolicy(DataZoneAssetWritePolicy);


        // Rule for Job Start events
        const jobStartRule = new Rule(this, 'JobStartRule', {
            eventBus: eventBus,
            eventPattern: {
                detailType: [DATA_ASSET_SPOKE_JOB_START_EVENT]
            }
        });

        jobStartRule.addTarget(
            new LambdaFunction(jobCompletionEventLambda, {
                deadLetterQueue: deadLetterQueue,
                maxEventAge: Duration.minutes(5),
                retryAttempts: 2
            })
        );

         // Rule for Job completion events
         const jobCompletionRule = new Rule(this, 'JobCompletionRule', {
            eventBus: eventBus,
            eventPattern: {
                detailType: [DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT]
            }
        });

        jobCompletionRule.addTarget(
            new LambdaFunction(jobCompletionEventLambda, {
                deadLetterQueue: deadLetterQueue,
                maxEventAge: Duration.minutes(5),
                retryAttempts: 2
            })
        );


        // Add eventBus Policy for incoming job events
        new CfnEventBusPolicy(this,'JobEventBusPutEventPolicy', {
            eventBusName: dfEventBusName,
            statementId: 'AllowSpokeAccountsToPutJobEvents',
            statement:{
                Effect: Effect.ALLOW,
                Action: ['events:PutEvents'],
                Resource: [`arn:aws:events:${region}:${accountId}:event-bus/${dfEventBusName}`],
                Principal: '*',
                Condition: {
                    'StringEquals': {
                        'events:source': [DATA_ASSET_SPOKE_EVENT_SOURCE],
                        'events:detail-type': [DATA_ASSET_SPOKE_JOB_START_EVENT, DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT]
                    },
                    'ForAnyValue:StringEquals': {
                        'aws:PrincipalOrgPaths': `${props.orgPath.orgId}/${props.orgPath.rootId}/${props.orgPath.ouId}/`
                    }
                }
            }                        
        });

        // Add eventBus Policy to allow spoke accounts to subscribe their bus to the hub bus for outgoing (hub to spoke) events
        new CfnEventBusPolicy(this,'JobEventBusSubscribePolicy', {
            eventBusName: dfEventBusName,
            statementId: 'AllowSpokeAccountsToSubscribeForJobEvents',
            statement:{
                Effect: Effect.ALLOW,
                Action: [
                    'events:PutRule',
                    'events:PutTargets',
                    'events:DeleteRule',
                    'events:RemoveTargets',
                    'events:DisableRule',
                    'events:EnableRule',
                    'events:TagResource',
                    'events:UntagResource',
                    'events:DescribeRule',
                    'events:ListTargetsByRule',
                    'events:ListTagsForResource'
                ],
                Resource: [`arn:aws:events:${region}:${accountId}:event-bus/${dfEventBusName}`],
                Principal: '*',
                Condition: {
                    'StringEqualsIfExists': {
                        'events:source': [DATA_ASSET_SPOKE_EVENT_SOURCE],
                        'events:detail-type': [DATA_ASSET_SPOKE_JOB_START_EVENT, DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT],
                        'events:targetArn': 'arn:aws:events:*:${aws:PrincipalAccount}:event-bus/*',
                        'events:creatorAccount': '${aws:PrincipalAccount}'
                    },
                    'ForAnyValue:StringEquals': {
                        'aws:PrincipalOrgPaths': `${props.orgPath.orgId}/${props.orgPath.rootId}/${props.orgPath.ouId}/`
                    },

                }
            }                        
        });

        NagSuppressions.addResourceSuppressions([apiLambda, jobCompletionEventLambda, jobEnrichmentLambda],
            [
                {
                    id: 'AwsSolutions-IAM4',
                    appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
                    reason: 'This policy is the one generated by CDK.'

                },
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [`Resource::<DataAssetHubTable6553B766.Arn>/index/*`],
                    reason: 'This policy is required for the lambda to access the dataAsset table.'

                },
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [
                        'Resource::*',
                        'Resource::arn:aws:states:<AWS::Region>:<AWS::AccountId>:execution:df-data-asset:*'],
                    reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments actions.'

                }
            ],
            true);

            NagSuppressions.addResourceSuppressions([jobEnrichmentLambda],
                [

                    {
                        id: 'AwsSolutions-IAM5',
                        appliesTo: [
                            `Action::s3:GetBucket*`,
                            `Action::s3:GetObject*`,
                            `Action::s3:List*`,
                            `Resource::arn:<AWS::Partition>:s3:::<SsmParameterValuedfsharedbucketNameC96584B6F00A464EAD1953AFF4B05118Parameter>/*`,
                            `Resource::arn:aws:databrew:<AWS::Region>:<AWS::AccountId>:job/*`
                        ],
                        reason: 'This policy is required for the lambda to access job profiling objects stored in s3.'
    
                    }
                ],
                true);

        NagSuppressions.addResourceSuppressions([createConnectionLambda, createDataSetLambda, configDataBrewLambda, runJobLambda],
            [
                {
                    id: 'AwsSolutions-IAM4',
                    appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
                    reason: 'This policy is the one generated by CDK.'

                },
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [
                        'Resource::*',
                        `Resource::arn:aws:databrew:<AWS::Region>:<AWS::AccountId>:dataset/*`,
                        `Resource::arn:aws:databrew:<AWS::Region>:<AWS::AccountId>:job/*`,
                        `Resource::arn:aws:iam::<AWS::AccountId>:role/service-role/*`
                    ],
                    reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments actions.'

                }
            ],
            true);


        NagSuppressions.addResourceSuppressions([dataAssetStateMachine],
            [
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [
                        'Resource::<DataAssetHubConfigDataBrewLambdaCDAA539A.Arn>:*',
                        'Resource::<DataAssetHubCreateConnectionLambda8ADC406F.Arn>:*',
                        'Resource::<DataAssetHubCreateDataSetLambdaB1F66CA7.Arn>:*',
                        'Resource::<DataAssetHubrunJobLambdaF5235915.Arn>:*'
                    ],
                    reason: 'this policy is required to invoke lambda specified in the state machine definition'
                },
                {
                    id: 'AwsSolutions-SF1',
                    reason: 'We only care about logging the error for now.'

                },
                {
                    id: 'AwsSolutions-IAM5',
                    reason: 'This resource policy only applies to log.',
                    appliesTo: ['Resource::*']

                }],
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
