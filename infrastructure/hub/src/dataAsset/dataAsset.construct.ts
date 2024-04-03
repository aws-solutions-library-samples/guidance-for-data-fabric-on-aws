import { dfEventBusName, getLambdaArchitecture, OrganizationUnitPath } from '@df/cdk-common';
import { CfnEventBusPolicy, EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { AttributeType, BillingMode, ProjectionType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { Aspects, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { AccessLogFormat, AuthorizationType, CfnMethod, CognitoUserPoolsAuthorizer, Cors, EndpointType, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';

import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NagSuppressions } from 'cdk-nag';
import { AnyPrincipal, ArnPrincipal, Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { DATA_ASSET_HUB_EVENT_SOURCE, DATA_ASSET_SPOKE_CREATE_REQUEST_EVENT, DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT, DATA_ASSET_SPOKE_EVENT_SOURCE, DATA_ZONE_DATA_SOURCE_RUN_FAILED, DATA_ZONE_DATA_SOURCE_RUN_SUCCEEDED, DATA_ZONE_EVENT_SOURCE } from '@df/events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Choice, Condition, DefinitionBody, IntegrationPattern, JsonPath, LogLevel, StateMachine, TaskInput, Timeout, Wait, WaitTime } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Bucket } from 'aws-cdk-lib/aws-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type DataAssetConstructProperties = {
    moduleName: string;
    eventBusName: string;
    cognitoUserPoolId: string;
    orgPath: OrganizationUnitPath;
    bucketName: string;
    identityStoreId: string;
    identityStoreRoleArn: string,
    identityStoreRegion: string,
    taskTimeOutMinutes: number
};


export class DataAsset extends Construct {
    public readonly tableName: string;
    public readonly tableArn: string;
    public readonly functionName: string;
    public readonly apiUrl: string;
    public readonly apiName: string;
    public readonly createStateMachineArn: string;


    constructor(scope: Construct, id: string, props: DataAssetConstructProperties) {
        super(scope, id);

        const namePrefix = `df`;
        const eventBus = EventBus.fromEventBusName(this, 'EventBus', props.eventBusName);

        const accountId = Stack.of(this).account;
        const region = Stack.of(this).region;

        const bucket = Bucket.fromBucketName(this, 'jobsOutputBucket', props.bucketName);


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
            indexName: 'siKey1-sk-index',
            partitionKey: {
                name: 'siKey1',
                type: AttributeType.STRING,
            },
            sortKey: {
                name: 'sk',
                type: AttributeType.STRING,
            },
            projectionType: ProjectionType.KEYS_ONLY,
        });

        this.tableName = table.tableName;
        this.tableArn = table.tableArn;


        const XRayPutTelemetryPolicy = new PolicyStatement({
            actions: [
                "xray:PutTelemetryRecords",
                "xray:PutTraceSegments"
            ],
            resources: [`*`]
        });

        const DataZoneAssetReadPolicy = new PolicyStatement({
            actions: [
                'datazone:GetAsset',
                'datazone:ListAssetRevisions',
                'datazone:GetDomain',
            ],
            resources: [`*`]
        });

        const DataZoneAssetWritePolicy = new PolicyStatement({
            actions: [
                'datazone:CreateAssetRevision',
                'datazone:CreateAsset',
                'datazone:DeleteAsset',
                'datazone:CreateListingChangeSet'
            ],
            resources: [`*`]
        });

        /**
         * DCreate State Machine
         */
        const SFNSendTaskSuccessPolicy = new PolicyStatement({
            actions: [
                'states:SendTaskSuccess',
                'iam:PassRole',
            ],
            resources: [
                `arn:aws:states:${region}:${accountId}:stateMachine:df-*`,
            ]
        });

        const DataZoneDataSourcePolicy = new PolicyStatement({
            actions: [
                'datazone:CreateDataSource',
                'datazone:GetDataSource',
                'datazone:StartDataSourceRun',
                'datazone:GetDataSourceRun',
                'datazone:ListDataSourceRuns',
                'datazone:ListDataSourceRunActivities',
                'datazone:ListDataSources',
                'datazone:GetListing'
            ],
            resources: [`*`]
        });

        const DataZoneProjectPolicy = new PolicyStatement({
            actions: [
                'datazone:CreateProject',
                'datazone:ListProjects',
                'datazone:CreateFormType',
                'datazone:GetFormType'
            ],
            resources: [`*`]
        });

        const startCreateFlowLambdaRole = new Role(this, 'StartCreateFlowLambdaRole', {
            assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        });
        startCreateFlowLambdaRole.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this, 'StartCreateFlowPolicy', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'))
        startCreateFlowLambdaRole.addToPrincipalPolicy(XRayPutTelemetryPolicy);

        const startCreateFlowAssumedRole = new Role(this, 'StartCreateFlowAssumedRole', {
            assumedBy: new ArnPrincipal(startCreateFlowLambdaRole.roleArn).withSessionTags(),
            description: 'Custom Data Zone Role',
        });
        startCreateFlowAssumedRole.addToPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'sts:AssumeRole',
                'sts:TagSession'
            ],
            resources: [`${startCreateFlowLambdaRole.roleArn}`]
        }));

        const startCreateFlowLambda = new NodejsFunction(this, 'StartCreateFlowLambda', {
            description: 'Asset Manager Handler for Start Asset Creation flow',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/hub/create/start.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-startCreateFlow`,
            role: startCreateFlowLambdaRole,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                HUB_EVENT_BUS_NAME: props.eventBusName,
                CUSTOM_DATAZONE_USER_EXECUTION_ROLE_ARN: startCreateFlowAssumedRole.roleArn,
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
        startCreateFlowLambda.addToRolePolicy(SFNSendTaskSuccessPolicy);
        eventBus.grantPutEventsTo(startCreateFlowLambda);
        startCreateFlowLambda.addToRolePolicy(DataZoneDataSourcePolicy);
        const startCreateFlowDataZonePolicy = new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'sts:AssumeRole',
                'sts:TagSession'
            ],
            resources: [`${startCreateFlowAssumedRole.roleArn}`]
        });
        startCreateFlowLambda.addToRolePolicy(startCreateFlowDataZonePolicy);

        const startTask = new LambdaInvoke(this, 'StartCreateFlowTask', {
            lambdaFunction: startCreateFlowLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            taskTimeout: Timeout.duration(Duration.minutes(props.taskTimeOutMinutes)),
            payload: TaskInput.fromObject({
                'dataAsset.$': '$',
                'execution': {
                    'executionStartTime.$': '$$.Execution.StartTime',
                    'executionId.$': '$$.Execution.Id',
                    'stateMachineArn.$': '$$.StateMachine.Id',
                    'taskToken': JsonPath.taskToken
                }
            }),
            outputPath: '$.dataAsset'
        });


        const createDataSourceLambdaRole = new Role(this, 'CreateDataSourceLambdaRole', {
            assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        });
        createDataSourceLambdaRole.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this, 'CreateDataSourcePolicy', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'))
        createDataSourceLambdaRole.addToPrincipalPolicy(XRayPutTelemetryPolicy);
        const createDataSourceRole = new Role(this, 'CreateDataSourceRole', {
            assumedBy: new ArnPrincipal(createDataSourceLambdaRole.roleArn).withSessionTags(),
            description: 'Custom Data Zone Role',
        });
        createDataSourceRole.addToPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'sts:AssumeRole',
                'sts:TagSession'
            ],
            resources: [`${createDataSourceLambdaRole.roleArn}`]
        }));


        const createDataSourceLambda = new NodejsFunction(this, 'CreateDataSourceLambda', {
            description: 'Create the datazone data source as part of the asset creation flow',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/hub/create/createDataSource.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-createDataSource`,
            role: createDataSourceLambdaRole,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                CUSTOM_DATAZONE_USER_EXECUTION_ROLE_ARN: createDataSourceRole.roleArn,
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
        createDataSourceLambda.addToRolePolicy(SFNSendTaskSuccessPolicy);
        createDataSourceLambda.addToRolePolicy(DataZoneDataSourcePolicy);
        const createDataSourceDataZonePolicy = new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'sts:AssumeRole',
                'sts:TagSession'
            ],
            resources: [`${createDataSourceRole.roleArn}`]
        });
        createDataSourceLambda.addToRolePolicy(createDataSourceDataZonePolicy);
        createDataSourceRole.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this, 'CreateDataSourceExecutionPolicy', 'arn:aws:iam::aws:policy/service-role/AmazonDataZoneDomainExecutionRolePolicy'))
        createDataSourceRole.addToPrincipalPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                "iam:GetRole",
                "iam:GetUser"],
            resources: ['*']
        }));



        const createDataSourceTask = new LambdaInvoke(this, 'CreateDataSourceTask', {
            lambdaFunction: createDataSourceLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            taskTimeout: Timeout.duration(Duration.minutes(props.taskTimeOutMinutes)),
            payload: TaskInput.fromObject({
                'dataAsset.$': '$',
                'execution': {
                    'executionStartTime.$': '$$.Execution.StartTime',
                    'executionArn.$': '$$.Execution.Id',
                    'taskToken': JsonPath.taskToken
                }
            }),
            outputPath: '$.dataAsset'
        });


        const createProjectLambda = new NodejsFunction(this, 'CreateProjectLambda', {
            description: 'Create the default datazone project and metadata forms if necessary',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/hub/create/createProject.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-createProject`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                HUB_EVENT_BUS_NAME: props.eventBusName
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
        createProjectLambda.addToRolePolicy(SFNSendTaskSuccessPolicy);
        createProjectLambda.addToRolePolicy(DataZoneProjectPolicy);

        const createProjectTask = new LambdaInvoke(this, 'CreateProjectTask', {
            lambdaFunction: createProjectLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            taskTimeout: Timeout.duration(Duration.minutes(props.taskTimeOutMinutes)),
            payload: TaskInput.fromObject({
                'dataAsset.$': '$',
                'execution': {
                    'executionStartTime.$': '$$.Execution.StartTime',
                    'executionArn.$': '$$.Execution.Id',
                    'taskToken': JsonPath.taskToken
                }
            }),
            outputPath: '$.dataAsset'
        });

        const waitForDataSourceReady = new Wait(this, 'Wait For the Data Source to be ready', { time: WaitTime.duration(Duration.seconds(10)) });


        const verifyDataSourceLambdaRole = new Role(this, 'VerifyDataSourceLambdaRole', {
            assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        });
        verifyDataSourceLambdaRole.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this, 'VerifyDataSourcePolicy', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'))
        verifyDataSourceLambdaRole.addToPrincipalPolicy(XRayPutTelemetryPolicy);
        const verifyDataSourceRole = new Role(this, 'verifyDataSourceRole', {
            assumedBy: new ArnPrincipal(verifyDataSourceLambdaRole.roleArn).withSessionTags(),
            description: 'Custom Data Zone Role',
        });
        verifyDataSourceRole.addToPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'sts:AssumeRole',
                'sts:TagSession'
            ],
            resources: [`${verifyDataSourceLambdaRole.roleArn}`]
        }));

        const verifyDataSourceLambda = new NodejsFunction(this, 'VerifyDataSourceLambda', {
            description: 'Verify datazone data source is ready',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/hub/create/verifyDataSource.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-verifyDataSource`,
            role: verifyDataSourceLambdaRole,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                HUB_EVENT_BUS_NAME: props.eventBusName,
                CUSTOM_DATAZONE_USER_EXECUTION_ROLE_ARN: verifyDataSourceRole.roleArn,
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
        verifyDataSourceLambda.addToRolePolicy(DataZoneDataSourcePolicy);
        const verifyDataSourceDataZonePolicy = new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'sts:AssumeRole',
                'sts:TagSession'
            ],
            resources: [`${verifyDataSourceRole.roleArn}`]
        });
        verifyDataSourceLambda.addToRolePolicy(verifyDataSourceDataZonePolicy);
        verifyDataSourceRole.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this, 'VerifyDataSourceExecutionPolicy', 'arn:aws:iam::aws:policy/service-role/AmazonDataZoneDomainExecutionRolePolicy'))
        verifyDataSourceRole.addToPrincipalPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                "iam:GetRole",
                "iam:GetUser"],
            resources: ['*']
        }));


        const verifyDataSourceTask = new LambdaInvoke(this, 'Verify Data Source is ready', {
            lambdaFunction: verifyDataSourceLambda,
            payload: TaskInput.fromObject({
                'dataAsset.$': '$',
                'execution': {
                    'executionStartTime.$': '$$.Execution.StartTime',
                    'executionArn.$': '$$.Execution.Id'
                }
            }),
            outputPath: '$.Payload.dataAsset'
        });

        const runDataSourceLambdaRole = new Role(this, 'RunDataSourceLambdaRole', {
            assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        });
        runDataSourceLambdaRole.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this, 'RunDataSourcePolicy', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'))
        runDataSourceLambdaRole.addToPrincipalPolicy(XRayPutTelemetryPolicy);
        const runDataSourceRole = new Role(this, 'RunDataSourceRole', {
            assumedBy: new ArnPrincipal(runDataSourceLambdaRole.roleArn).withSessionTags(),
            description: 'Run Data source Data Zone Role',
        });

        runDataSourceRole.addToPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'sts:AssumeRole',
                'sts:TagSession'
            ],
            resources: [`${runDataSourceLambdaRole.roleArn}`]
        }));
        const runDataSourceLambda = new NodejsFunction(this, 'RunDataSourceLambda', {
            description: 'Run the datazone data source as part of the asset creation flow',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/hub/create/runDataSource.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-runDataSource`,
            role: runDataSourceLambdaRole,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                HUB_EVENT_BUS_NAME: props.eventBusName,
                HUB_BUCKET_NAME: props.bucketName,
                HUB_BUCKET_PREFIX: 'workflows',
                CUSTOM_DATAZONE_USER_EXECUTION_ROLE_ARN: runDataSourceRole.roleArn,
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
        runDataSourceLambda.addToRolePolicy(SFNSendTaskSuccessPolicy);
        runDataSourceLambda.addToRolePolicy(DataZoneDataSourcePolicy);
        bucket.grantPut(runDataSourceLambda);

        const runDataSourceDataZonePolicy = new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'sts:AssumeRole',
                'sts:TagSession'
            ],
            resources: [`${runDataSourceRole.roleArn}`]
        });
        runDataSourceLambda.addToRolePolicy(runDataSourceDataZonePolicy);
        runDataSourceRole.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this, 'RunDataSourceExecutionPolicy', 'arn:aws:iam::aws:policy/service-role/AmazonDataZoneDomainExecutionRolePolicy'))
        runDataSourceRole.addToPrincipalPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                "iam:GetRole",
                "iam:GetUser"],
            resources: ['*']
        }));

        const runDataSourceTask = new LambdaInvoke(this, 'RunDataSourceTask', {
            lambdaFunction: runDataSourceLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            taskTimeout: Timeout.duration(Duration.minutes(props.taskTimeOutMinutes)),
            payload: TaskInput.fromObject({
                'dataAsset.$': '$',
                'execution': {
                    'executionStartTime.$': '$$.Execution.StartTime',
                    'executionId.$': '$$.Execution.Id',
                    'stateMachineArn.$': '$$.StateMachine.Id',
                    'taskToken': JsonPath.taskToken
                }
            }),
            outputPath: '$.dataAsset'
        });

        const publishLineageLambda = new NodejsFunction(this, 'PublishLineageLambda', {
            description: 'Asset Manager Handler for publishing asset lineage',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/hub/create/lineage.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-publishLineage`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                HUB_EVENT_BUS_NAME: props.eventBusName
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
        publishLineageLambda.addToRolePolicy(SFNSendTaskSuccessPolicy);
        eventBus.grantPutEventsTo(publishLineageLambda);

        const lineageTask = new LambdaInvoke(this, 'PublishLineageTask', {
            lambdaFunction: publishLineageLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            taskTimeout: Timeout.duration(Duration.minutes(props.taskTimeOutMinutes)),
            payload: TaskInput.fromObject({
                'dataAsset.$': '$',
                'execution': {
                    'executionStartTime.$': '$$.Execution.StartTime',
                    'executionId.$': '$$.Execution.Id',
                    'stateMachineArn.$': '$$.StateMachine.Id',
                    'taskToken': JsonPath.taskToken
                }
            }),
            outputPath: '$.dataAsset'
        });

        const dataAssetStateMachineLogGroup = new LogGroup(this, 'DataAssetLogGroup', { logGroupName: `/aws/vendedlogs/states/${namePrefix}-dataAsset-create`, removalPolicy: RemovalPolicy.DESTROY });

        const dataAssetCreateStateMachine = new StateMachine(this, 'DataAssetCreateStateMachine', {
            definitionBody: DefinitionBody.fromChainable(
                startTask
                    .next(createProjectTask)
                    .next(createDataSourceTask)
                    .next(waitForDataSourceReady)
                    .next(verifyDataSourceTask)
                    .next(new Choice(this, 'Data Source is Ready?')
                        .when(Condition.stringEquals('$.execution.dataSourceCreation.status', 'READY'),
                            runDataSourceTask.next(lineageTask))
                        .otherwise(verifyDataSourceTask)
                    )
            ),
            logs: { destination: dataAssetStateMachineLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
            stateMachineName: `${namePrefix}-data-asset`,
            tracingEnabled: true
        });

        this.createStateMachineArn = dataAssetCreateStateMachine.stateMachineArn;


        /**
         * Define the API Lambda
        */
        const apiLambdaExecutionRole = new Role(this, 'ApiLambdaRole', {
            assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        });
        apiLambdaExecutionRole.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this, 'AWSLambdaBasicExecutionRole', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'))
        apiLambdaExecutionRole.addToPrincipalPolicy(XRayPutTelemetryPolicy);
        const customDataZoneRole = new Role(this, 'CustomDataZoneRole', {
            assumedBy: new ArnPrincipal(apiLambdaExecutionRole.roleArn).withSessionTags(),
            description: 'Custom Data Zone Role',
        });
        const apiLambda = new NodejsFunction(this, 'Apilambda', {
            functionName: `${namePrefix}-${props.moduleName}-api`,
            description: `Data Asset API`,
            role: apiLambdaExecutionRole,
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/lambda_apiGateway.ts'),
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.seconds(20),
            environment: {
                EVENT_BUS_NAME: props.eventBusName,
                TABLE_NAME: table.tableName,
                WORKER_QUEUE_URL: 'not used',
                HUB_CREATE_STATE_MACHINE_ARN: dataAssetCreateStateMachine.stateMachineArn,
                CUSTOM_DATAZONE_USER_EXECUTION_ROLE_ARN: customDataZoneRole.roleArn,
                IDENTITY_STORE_ID: props.identityStoreId,
                IDENTITY_STORE_ROLE_ARN: props.identityStoreRoleArn,
                IDENTITY_STORE_REGION: props.identityStoreRegion,
                NODE_ENV: 'production',
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
        dataAssetCreateStateMachine.grantStartExecution(apiLambda)


        this.functionName = apiLambda.functionName;

        const DataZoneAssumeCustomRolePolicy = new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'sts:AssumeRole',
                'sts:TagSession'
            ],
            resources: [`${customDataZoneRole.roleArn}`,props.identityStoreRoleArn]
        });
        apiLambda.addToRolePolicy(DataZoneAssumeCustomRolePolicy);

        customDataZoneRole.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this, 'DZDomainExecutionPolicy', 'arn:aws:iam::aws:policy/service-role/AmazonDataZoneDomainExecutionRolePolicy'))
        customDataZoneRole.addToPrincipalPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["iam:GetRole",
                "iam:GetUser"],
            resources: ['*']
        }));
        customDataZoneRole.assumeRolePolicy?.addStatements(
            new PolicyStatement({
                actions: [
                    'sts:AssumeRole',
                    'sts:TagSession'
                ],
                principals: [new ArnPrincipal(apiLambda.role?.roleArn!)]
            })
        )

        apiLambda.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["identitystore:IsMemberInGroups", "identitystore:GetUserId"],
                resources: [
                    `arn:aws:identitystore::${accountId}:identitystore/${props.identityStoreId}`,
                    `arn:aws:identitystore:::user/*`,
                    `arn:aws:identitystore:::group/*`,
                    `arn:aws:identitystore:::membership/*`,
                ],
            })
        );


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


        /*
            * Event Listiener
        */

        const eventProcessorLambdaRole = new Role(this, 'EventProcessorLambdaRole', {
            assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        });
        eventProcessorLambdaRole.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this, 'EventProcessorLambdaExecutionRole', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'))
        eventProcessorLambdaRole.addToPrincipalPolicy(XRayPutTelemetryPolicy);
        const eventProcessorDataZoneRole = new Role(this, 'EventProcessorDataZoneRole', {
            assumedBy: new ArnPrincipal(eventProcessorLambdaRole.roleArn).withSessionTags(),
            description: 'Event Processor Data Zone Role',
        });
        const hubEventProcessorLambda = new NodejsFunction(this, 'HubEventProcessorLambda', {
            description: `Hub Event Handler`,
            role: eventProcessorLambdaRole,
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/hub_lambda_eventbridge.ts'),
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            functionName: `${namePrefix}-dataAsset-hubEventProcessor`,
            timeout: Duration.seconds(30),
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            environment: {
                HUB_BUCKET_NAME: props.bucketName,
                HUB_BUCKET_PREFIX: 'workflows',
                EVENT_BUS_NAME: props.eventBusName,
                TABLE_NAME: table.tableName,
                WORKER_QUEUE_URL: 'not used',
                HUB_CREATE_STATE_MACHINE_ARN: dataAssetCreateStateMachine.stateMachineArn,
                CUSTOM_DATAZONE_USER_EXECUTION_ROLE_ARN: eventProcessorDataZoneRole.roleArn,
                IDENTITY_STORE_ID: props.identityStoreId,
                IDENTITY_STORE_ROLE_ARN: props.identityStoreRoleArn,
                IDENTITY_STORE_REGION: props.identityStoreRegion
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

        hubEventProcessorLambda.node.addDependency(table);
        table.grantReadWriteData(hubEventProcessorLambda);
        hubEventProcessorLambda.addToRolePolicy(DataZoneAssetReadPolicy);
        hubEventProcessorLambda.addToRolePolicy(DataZoneAssetWritePolicy);
        hubEventProcessorLambda.addToRolePolicy(SFNSendTaskSuccessPolicy);
        hubEventProcessorLambda.addToRolePolicy(DataZoneDataSourcePolicy);
        bucket.grantPut(hubEventProcessorLambda);
        bucket.grantRead(hubEventProcessorLambda);
        dataAssetCreateStateMachine.grantStartExecution(hubEventProcessorLambda);


        hubEventProcessorLambda.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["identitystore:IsMemberInGroups", "identitystore:GetUserId"],
                resources: [
                    `arn:aws:identitystore::${accountId}:identitystore/${props.identityStoreId}`,
                    `arn:aws:identitystore:::user/*`,
                    `arn:aws:identitystore:::group/*`,
                    `arn:aws:identitystore:::membership/*`,
                ],
            })
        );

        const EventProcessorAssumeCustomRolePolicy = new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'sts:AssumeRole',
                'sts:TagSession'
            ],
            resources: [`${eventProcessorDataZoneRole.roleArn}`,props.identityStoreRoleArn]
        });
        hubEventProcessorLambda.addToRolePolicy(EventProcessorAssumeCustomRolePolicy);

        eventProcessorDataZoneRole.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this, 'EventProcessorExecutionPolicy', 'arn:aws:iam::aws:policy/service-role/AmazonDataZoneDomainExecutionRolePolicy'))
        eventProcessorDataZoneRole.addToPrincipalPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["iam:GetRole",
                "iam:GetUser"],
            resources: ['*']
        }));
        eventProcessorDataZoneRole.assumeRolePolicy?.addStatements(
            new PolicyStatement({
                actions: [
                    'sts:AssumeRole',
                    'sts:TagSession'
                ],
                principals: [new ArnPrincipal(hubEventProcessorLambda.role?.roleArn!)]
            })
        )

        // Rule for Create Flow completion events
        const createFlowCompletionRule = new Rule(this, 'CreateFlowCompletionRule', {
            eventBus: eventBus,
            eventPattern: {
                detailType: [DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT]
            }
        });

        createFlowCompletionRule.addTarget(
            new LambdaFunction(hubEventProcessorLambda, {
                deadLetterQueue: deadLetterQueue,
                maxEventAge: Duration.minutes(5),
                retryAttempts: 2
            })
        );


        // Rule for Create Flow events generated by the spoke
        const spokeCreateRule = new Rule(this, 'SpokeCreateRule', {
            eventBus: eventBus,
            eventPattern: {
                detailType: [DATA_ASSET_SPOKE_CREATE_REQUEST_EVENT]
            }
        });

        spokeCreateRule.addTarget(
            new LambdaFunction(hubEventProcessorLambda, {
                deadLetterQueue: deadLetterQueue,
                maxEventAge: Duration.minutes(5),
                retryAttempts: 2
            })
        );

        // Rule for DataZone data source creation event
        const dataSourceEventRule = new Rule(this, 'dataSourceEventRule', {
            eventPattern: {
                source: [DATA_ZONE_EVENT_SOURCE],
                detailType: [DATA_ZONE_DATA_SOURCE_RUN_FAILED, DATA_ZONE_DATA_SOURCE_RUN_SUCCEEDED]
            }
        });

        dataSourceEventRule.addTarget(
            new LambdaFunction(hubEventProcessorLambda, {
                deadLetterQueue: deadLetterQueue,
                maxEventAge: Duration.minutes(5),
                retryAttempts: 2
            })
        );

        createFlowCompletionRule.addTarget(
            new LambdaFunction(hubEventProcessorLambda, {
                deadLetterQueue: deadLetterQueue,
                maxEventAge: Duration.minutes(5),
                retryAttempts: 2
            })
        );


        // Add eventBus Policy for incoming job events
        new CfnEventBusPolicy(this, 'JobEventBusPutEventPolicy', {
            eventBusName: dfEventBusName,
            statementId: 'AllowSpokeAccountsToPutJobEvents',
            statement: {
                Effect: Effect.ALLOW,
                Action: ['events:PutEvents'],
                Resource: [`arn:aws:events:${region}:${accountId}:event-bus/${dfEventBusName}`],
                Principal: '*',
                Condition: {
                    'StringEquals': {
                        'events:source': [DATA_ASSET_SPOKE_EVENT_SOURCE],
                        'events:detail-type': [DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT, DATA_ASSET_SPOKE_CREATE_REQUEST_EVENT]
                    },
                    'ForAnyValue:StringEquals': {
                        'aws:PrincipalOrgPaths': `${props.orgPath.orgId}/${props.orgPath.rootId}/${props.orgPath.ouId}/`
                    }
                }
            }
        });

        // Add eventBus Policy to allow spoke accounts to subscribe their bus to the hub bus for outgoing (hub to spoke) events
        new CfnEventBusPolicy(this, 'JobEventBusSubscribePolicy', {
            eventBusName: dfEventBusName,
            statementId: 'AllowSpokeAccountsToSubscribeForJobEvents',
            statement: {
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
                Resource: [`arn:aws:events:${region}:${accountId}:rule/${dfEventBusName}/*`],
                Principal: '*',
                Condition: {
                    'StringEqualsIfExists': {
                        'events:source': [DATA_ASSET_HUB_EVENT_SOURCE],
                        'events:creatorAccount': '${aws:PrincipalAccount}'
                    },
                    'ForAnyValue:StringEquals': {
                        'aws:PrincipalOrgPaths': `${props.orgPath.orgId}/${props.orgPath.rootId}/${props.orgPath.ouId}/`
                    },

                }
            }
        });


        NagSuppressions.addResourceSuppressions([apiLambdaExecutionRole, customDataZoneRole, hubEventProcessorLambda, startCreateFlowLambdaRole, createDataSourceLambdaRole, verifyDataSourceLambdaRole, runDataSourceLambdaRole, eventProcessorLambdaRole, eventProcessorDataZoneRole, createDataSourceRole, verifyDataSourceRole, runDataSourceRole],
            [
                {
                    id: 'AwsSolutions-L1',
                    reason: 'Latest runtime not needed.'
                },
                {
                    id: 'AwsSolutions-IAM4',
                    appliesTo: [
                        'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
                        'Policy::arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
                        'Policy::arn:aws:iam::aws:policy/service-role/AmazonDataZoneDomainExecutionRolePolicy'
                    ],
                    reason: 'This policy is the one generated by CDK.'

                },
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [
                        'Resource::*',
                        'Resource::<DataAssetHubTable6553B766.Arn>/index/*',
                        'Resource::arn:aws:states:<AWS::Region>:<AWS::AccountId>:execution:df-data-asset:*',
                        'Resource::arn:aws:states:<AWS::Region>:<AWS::AccountId>:stateMachine:df-*',
                        'Action::s3:Abort*',
                        'Resource::arn:<AWS::Partition>:s3:::<SsmParameterValuedfsharedbucketNameC96584B6F00A464EAD1953AFF4B05118Parameter>/*',
                        'Action::s3:GetBucket*',
                        'Action::s3:GetObject*',
                        'Action::s3:List*',
                        'Resource::arn:aws:identitystore:::group/*',
                        'Resource::arn:aws:identitystore:::membership/*',
                        'Resource::arn:aws:identitystore:::user/*',


                    ],
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

        NagSuppressions.addResourceSuppressions([apiLambda, startCreateFlowLambda, createDataSourceLambda, verifyDataSourceLambda, runDataSourceLambda, publishLineageLambda, createProjectLambda],
            [
                {
                    id: 'AwsSolutions-L1',
                    reason: 'Latest runtime not needed.'
                },
                {
                    id: 'AwsSolutions-IAM4',
                    appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
                    reason: 'This policy is the one generated by CDK.'

                },
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [
                        'Action::s3:Abort*',
                        'Resource::*',
                        `Resource::arn:aws:states:<AWS::Region>:<AWS::AccountId>:stateMachine:df-*`,
                        `Resource::arn:<AWS::Partition>:s3:::<SsmParameterValuedfsharedbucketNameC96584B6F00A464EAD1953AFF4B05118Parameter>/*`
                    ],
                    reason: 'This policy is required for the lambda to perform profiling.'

                }
            ],
            true);

        NagSuppressions.addResourceSuppressions([runDataSourceLambda],
            [
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [
                        'Action::datazone:*',
                    ],
                    reason: 'This policy is required for the lambda to perform profiling.'
                }
            ],
            true);

        NagSuppressions.addResourceSuppressions([dataAssetCreateStateMachine],
            [
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [
                        'Resource::<DataAssetHubPublishLineageLambda5C9E11C9.Arn>:*',
                        'Resource::<DataAssetHubStartCreateFlowLambdaEDB66652.Arn>:*',
                        'Resource::<DataAssetHubCreateProjectLambda4A8F9CB6.Arn>:*',
                        'Resource::<DataAssetHubCreateDataSourceLambda4D6946C7.Arn>:*',
                        'Resource::<DataAssetHubVerifyDataSourceLambda07A58D99.Arn>:*',
                        'Resource::<DataAssetHubRunDataSourceLambdaF6EEC600.Arn>:*'
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

    }
}
