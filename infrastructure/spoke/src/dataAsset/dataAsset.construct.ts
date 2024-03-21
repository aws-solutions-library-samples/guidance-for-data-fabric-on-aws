import { dfEventBusArn, dfSpokeEventBusArn, dfSpokeEventBusName, getLambdaArchitecture, OrganizationUnitPath } from '@df/cdk-common';
import { CfnEventBusPolicy, CfnRule, EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { CfnPermissions } from 'aws-cdk-lib/aws-lakeformation';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NagSuppressions } from 'cdk-nag';
import { AnyPrincipal, Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Choice, Condition, DefinitionBody, IntegrationPattern, JsonPath, LogLevel, Parallel, StateMachine, Succeed, TaskInput } from 'aws-cdk-lib/aws-stepfunctions';
import {
    DATA_ASSET_HUB_CREATE_REQUEST_EVENT,
    DATA_ASSET_HUB_EVENT_SOURCE,
    DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT,
    DATA_ASSET_SPOKE_EVENT_SOURCE,
    DATA_BREW_JOB_STATE_CHANGE,
    DATA_QUALITY_EVALUATION_RESULTS_AVAILABLE,
    GLUE_CRAWLER_STATE_CHANGE
} from '@df/events';
import { EventBus as EventBusTarget, LambdaFunction, SfnStateMachine } from 'aws-cdk-lib/aws-events-targets';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Database } from '@aws-cdk/aws-glue-alpha';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type DataAssetSpokeConstructProperties = {
    moduleName: string;
    hubAccountId: string;
    spokeEventBusName: string;
    bucketName: string;
    orgPath: OrganizationUnitPath;
    glueDatabaseArn: string;
};


export class DataAssetSpoke extends Construct {
    public readonly stateMachineArn: string;

    constructor(scope: Construct, id: string, props: DataAssetSpokeConstructProperties) {
        super(scope, id);

        const namePrefix = 'df-spoke';
        const accountId = Stack.of(this).account;
        const region = Stack.of(this).region;
        const hubEventBus = EventBus.fromEventBusArn(this, 'HubEventBus', dfEventBusArn(props.hubAccountId, region));
        const spokeEventBus = EventBus.fromEventBusArn(this, 'SpokeEventBus', dfSpokeEventBusArn(accountId, region));
        const defaultEventBus = EventBus.fromEventBusName(this, 'DefaultEventBus', 'default');
        const bucket = Bucket.fromBucketName(this, 'jobsOutputBucket', props.bucketName);
        const glueDatabase = Database.fromDatabaseArn(this, 'glueDatabase', props.glueDatabaseArn)


        /* Spoke Data Asset State Machine
            1- create data brew connection
            2- create asset
            3- create job/schedule
            4- run job
        */

        const StateMachinePolicy = new PolicyStatement({
            actions: [
                'states:SendTaskSuccess'
            ],
            resources: [
                `arn:aws:states:${region}:${accountId}:stateMachine:${namePrefix}-*`,
                `arn:aws:databrew:${region}:${accountId}:dataset/*`,
                `${glueDatabase.databaseArn}`
            ]
        });


        const IAMPassRolePolicy = new PolicyStatement({
            actions: [
                'iam:PassRole'
            ],
            resources: [
                `arn:aws:iam::${accountId}:role/df-*` // we Only allow assume roles for roles that have a df- prefix
            ]
        });

        const CreateDataQualityPolicy = new PolicyStatement({
            actions: [
                'glue:CreateDataQualityRuleset'],
            resources: [
                `*`
            ]
        })

        const DataQualityPolicy = new PolicyStatement({
            actions: [
                'glue:StartDataQualityRulesetEvaluationRun',
                'glue:UpdateDataQualityRuleset',
                'glue:GetDataQualityRulesetEvaluationRun',
                'glue:GetDataQualityResult',
                'glue:GetDataQualityRuleset',
                'glue:GetTags'
            ],
            resources: [
                `arn:aws:glue:${region}:${accountId}:dataQualityRuleset*`
            ]
        })

        const DataBrewPolicy = new PolicyStatement({
            actions: [
                'states:SendTaskSuccess',
                'databrew:CreateDataset',
                'databrew:DescribeDataset',
                'databrew:DeleteDataset',
                'databrew:TagResource',
                'databrew:CreateProfileJob',
                'databrew:CreateRecipe',
                'databrew:DescribeRecipe',
                'databrew:UpdateRecipe',
                'databrew:PublishRecipe',
                'databrew:CreateRecipeJob',
                'databrew:UpdateRecipeJob',
                'databrew:CreateRuleset',
                'databrew:CreateSchedule',
                'databrew:DescribeJob',
                'databrew:UpdateJob',
                'databrew:DeleteJob',
                'databrew:UpdateProfileJob',
                'databrew:StartJobRun'
            ],
            resources: [
                `arn:aws:databrew:${region}:${accountId}:dataset/*`,
                `arn:aws:databrew:${region}:${accountId}:recipe/*`,
                `arn:aws:databrew:${region}:${accountId}:job/*`
            ]
        });

        const SecretsManagerPolicy = new PolicyStatement({
            actions: [
                'secretsmanager:GetSecretValue'
            ],
            resources: [
                `arn:aws:secretsmanager:${region}:${accountId}:secret:*`,
            ]
        })

        const SSMPolicy = new PolicyStatement({
            actions: [
                'ssm:GetParameter',
                'ssm:PutParameter'
            ],
            resources: [
                `arn:aws:ssm:${region}:${accountId}:parameter/df/spoke/dataAsset/*` // we Only allow assume roles for roles that have a df- prefix
            ]
        });


        const GluePolicy = new PolicyStatement({
            actions: [
                'glue:GetCrawler',
                'glue:CreateCrawler',
                'glue:UpdateCrawler',
                'glue:StartCrawler',
                'glue:GetTags',
                'glue:ListCrawls',
                'glue:GetTable',
                'glue:CreateConnection',
                'glue:GetConnection',
            ],
            resources: [
                `arn:aws:glue:${region}:${accountId}:crawler/*`,
                `arn:aws:glue:${region}:${accountId}:catalog`,
                `arn:aws:glue:${region}:${accountId}:connection/*`,
                `${props.glueDatabaseArn}`,
                `arn:aws:glue:${region}:${accountId}:table/${glueDatabase.databaseName}/*`
            ]
        });


        const createStartLambda = new NodejsFunction(this, 'CreateStartLambda', {
            description: 'Asset Manager Connection creator Task Handler',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/spoke/create/start.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-create-startTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                SPOKE_EVENT_BUS_NAME: props.spokeEventBusName,
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

        bucket.grantPut(createStartLambda);
        createStartLambda.addToRolePolicy(StateMachinePolicy);
        new CfnPermissions(this, 'CreateStartLambdaLakeFormationPermissions', {
            dataLakePrincipal: {
                dataLakePrincipalIdentifier: createStartLambda.role?.roleArn,
              },
              resource: {
                tableResource: {
                    catalogId: accountId,
                    databaseName: glueDatabase.databaseName,
                    tableWildcard: { }, // empty object === ALL_TABLES
                }
              }
        });

        const createConnectionLambda = new NodejsFunction(this, 'CreateConnectionLambda', {
            description: 'Asset Manager Connection creator Task Handler',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/spoke/create/connection.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-connectionCreationTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                SPOKE_EVENT_BUS_NAME: props.spokeEventBusName
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

        createConnectionLambda.addToRolePolicy(StateMachinePolicy);
        createConnectionLambda.addToRolePolicy(IAMPassRolePolicy);
        createConnectionLambda.addToRolePolicy(GluePolicy);
        createConnectionLambda.addToRolePolicy(SecretsManagerPolicy);

        const createDataSetLambda = new NodejsFunction(this, 'CreateDataSetLambda', {
            description: 'Asset Manager dataset creator Task Handler',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/spoke/create/dataset.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-createDataSetTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                SPOKE_EVENT_BUS_NAME: props.spokeEventBusName,
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

        createDataSetLambda.addToRolePolicy(StateMachinePolicy);
        createDataSetLambda.addToRolePolicy(DataBrewPolicy);
        createDataSetLambda.addToRolePolicy(IAMPassRolePolicy);
        createDataSetLambda.addToRolePolicy(GluePolicy);


        const createProfileDataSetLambda = new NodejsFunction(this, 'CreateProfileDataSetLambda', {
            description: 'Asset Manager profile dataset creator Task Handler',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/spoke/create/profileDataset.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-createProfileDataSetTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                SPOKE_EVENT_BUS_NAME: props.spokeEventBusName,
                SPOKE_GLUE_DATABASE_NAME: glueDatabase.databaseName,
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

        createProfileDataSetLambda.addToRolePolicy(StateMachinePolicy);
        createProfileDataSetLambda.addToRolePolicy(DataBrewPolicy);
        createProfileDataSetLambda.addToRolePolicy(IAMPassRolePolicy);
        createProfileDataSetLambda.addToRolePolicy(GluePolicy);

        const recipeJobLambda = new NodejsFunction(this, 'RecipeJobLambda', {
            description: 'Asset Manager Recipe job Task Handler',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/spoke/create/recipeJob.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-recipeJobTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                SPOKE_EVENT_BUS_NAME: props.spokeEventBusName,
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

        recipeJobLambda.addToRolePolicy(StateMachinePolicy);
        recipeJobLambda.addToRolePolicy(DataBrewPolicy);
        recipeJobLambda.addToRolePolicy(SSMPolicy);
        recipeJobLambda.addToRolePolicy(IAMPassRolePolicy);
        recipeJobLambda.addToRolePolicy(GluePolicy);
        bucket.grantPut(recipeJobLambda);
        new CfnPermissions(this, 'RecipeJobLambdaPermissions', {
            dataLakePrincipal: {
                dataLakePrincipalIdentifier: recipeJobLambda.role?.roleArn,
              },
              resource: {
                tableResource: {
                    catalogId: accountId,
                    databaseName: glueDatabase.databaseName,
                    tableWildcard: { }, // empty object === ALL_TABLES
                }
              }
        });

        const profileJobLambda = new NodejsFunction(this, 'ProfileJobLambda', {
            description: 'Asset Manager profile job Task Handler',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/spoke/create/profileJob.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-profileJobTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                HUB_EVENT_BUS_NAME: dfEventBusArn(props.hubAccountId, region),
                SPOKE_EVENT_BUS_NAME: props.spokeEventBusName,
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

        hubEventBus.grantPutEventsTo(profileJobLambda);
        profileJobLambda.addToRolePolicy(StateMachinePolicy);
        profileJobLambda.addToRolePolicy(DataBrewPolicy);
        profileJobLambda.addToRolePolicy(SSMPolicy);
        profileJobLambda.addToRolePolicy(IAMPassRolePolicy);
        profileJobLambda.addToRolePolicy(GluePolicy);
        bucket.grantPut(profileJobLambda);
        new CfnPermissions(this, 'ProfileJobLambdaPermissions', {
            dataLakePrincipal: {
                dataLakePrincipalIdentifier: profileJobLambda.role?.roleArn,
              },
              resource: {
                tableResource: {
                    catalogId: accountId,
                    databaseName: glueDatabase.databaseName,
                    tableWildcard: { }, // empty object === ALL_TABLES
                }
              }
        });

        const dqProfileJobLambda = new NodejsFunction(this, 'DQProfileJobLambda', {
            description: 'Asset Manager DQ profile job Task Handler',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/spoke/create/dataQualityProfileJob.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-dqProfileJobTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                HUB_EVENT_BUS_NAME: dfEventBusArn(props.hubAccountId, region),
                SPOKE_EVENT_BUS_NAME: props.spokeEventBusName,
                JOBS_BUCKET_NAME: props.bucketName,
                JOBS_BUCKET_PREFIX: 'jobs',
                SPOKE_GLUE_DATABASE_NAME: glueDatabase.databaseName
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

        hubEventBus.grantPutEventsTo(dqProfileJobLambda);
        dqProfileJobLambda.addToRolePolicy(StateMachinePolicy);
        dqProfileJobLambda.addToRolePolicy(DataBrewPolicy);
        dqProfileJobLambda.addToRolePolicy(CreateDataQualityPolicy);
        dqProfileJobLambda.addToRolePolicy(DataQualityPolicy);
        dqProfileJobLambda.addToRolePolicy(SSMPolicy);
        dqProfileJobLambda.addToRolePolicy(IAMPassRolePolicy);
        dqProfileJobLambda.addToRolePolicy(GluePolicy);
        bucket.grantPut(dqProfileJobLambda);
        new CfnPermissions(this, 'DQProfileJobLambdaLakeFormationPermissions', {
            dataLakePrincipal: {
                dataLakePrincipalIdentifier: dqProfileJobLambda.role?.roleArn,
              },
              resource: {
                tableResource: {
                    catalogId: accountId,
                    databaseName: glueDatabase.databaseName,
                    tableWildcard: { }, // empty object === ALL_TABLES
                }
              }
        });

        const glueCrawlerLambda = new NodejsFunction(this, 'GlueCrawlerLambda', {
            description: 'Asset Manager Glue Crawler Task Handler',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/spoke/create/glueCrawler.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-glueCrawlerTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                SPOKE_EVENT_BUS_NAME: props.spokeEventBusName,
                JOBS_BUCKET_NAME: props.bucketName,
                JOBS_BUCKET_PREFIX: 'jobs',
                SPOKE_GLUE_DATABASE_NAME: glueDatabase.databaseName
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

        glueCrawlerLambda.addToRolePolicy(StateMachinePolicy);
        glueCrawlerLambda.addToRolePolicy(SSMPolicy);
        glueCrawlerLambda.addToRolePolicy(IAMPassRolePolicy);
        glueCrawlerLambda.addToRolePolicy(GluePolicy);
        bucket.grantPut(glueCrawlerLambda);

        const spokeLineageLambda = new NodejsFunction(this, 'SpokeLineageLambda', {
            description: 'Asset Manager Spoke Lineage Task Handler',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/stepFunction/handlers/spoke/create/lineage.handler.ts'),
            functionName: `${namePrefix}-${props.moduleName}-ineageTask`,
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(5),
            environment: {
                SPOKE_EVENT_BUS_NAME: props.spokeEventBusName,
                JOBS_BUCKET_NAME: props.bucketName,
                JOBS_BUCKET_PREFIX: 'jobs',
                SPOKE_GLUE_DATABASE_NAME: glueDatabase.databaseName
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

        spokeLineageLambda.addToRolePolicy(StateMachinePolicy);
        spokeLineageLambda.addToRolePolicy(DataBrewPolicy);
        spokeEventBus.grantPutEventsTo(spokeLineageLambda);
        bucket.grantPut(spokeLineageLambda);
        bucket.grantRead(spokeLineageLambda);

        const createStartTask = new LambdaInvoke(this, 'CreateStartTask', {
            lambdaFunction: createStartLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            payload: TaskInput.fromObject({
                'dataAssetEvent.$': '$.detail.dataAsset',
                'execution': {
                    'executionStartTime.$': '$$.Execution.StartTime',
                    'executionId.$': '$$.Execution.Id',
                    'stateMachineArn.$': '$$.StateMachine.Id',
                    'taskToken': JsonPath.taskToken
                }
            }),
            outputPath: '$.dataAsset'
        });

        const createConnectionTask = new LambdaInvoke(this, 'CreateConnectionTask', {
            lambdaFunction: createConnectionLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
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

        const recipeCreateDataSetTask = new LambdaInvoke(this, 'RecipeCreateDataSetTask', {
            lambdaFunction: createDataSetLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
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

        const profileCreateDataSetTask = new LambdaInvoke(this, 'ProfileCreateDataSetTask', {
            lambdaFunction: createProfileDataSetLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
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

        const recipeJobTask = new LambdaInvoke(this, 'RecipeJobTask', {
            lambdaFunction: recipeJobLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
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

        const profileJobTask = new LambdaInvoke(this, 'ProfileJobTask', {
            lambdaFunction: profileJobLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
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

        const dqProfileJobTask = new LambdaInvoke(this, 'DQProfileJobTask', {
            lambdaFunction: dqProfileJobLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
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

        const glueCrawlerTask = new LambdaInvoke(this, 'GlueCrawlerTask', {
            lambdaFunction: glueCrawlerLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
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


        const lineageTask = new LambdaInvoke(this, 'LineageTask', {
            lambdaFunction: spokeLineageLambda,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            payload: TaskInput.fromObject({
                'dataAssets.$': '$',
                'execution': {
                    'executionStartTime.$': '$$.Execution.StartTime',
                    'executionId.$': '$$.Execution.Id',
                    'stateMachineArn.$': '$$.StateMachine.Id',
                    'taskToken': JsonPath.taskToken
                }
            }),
            outputPath: '$'
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

        const dataAssetStateMachineLogGroup = new LogGroup(this, 'DataAssetLogGroup', {logGroupName: `/aws/vendedlogs/states/${namePrefix}-dataAsset`, removalPolicy: RemovalPolicy.DESTROY});

        const profilingTasks = new Parallel(this, 'ProfilingTasks')
            .branch(
                new Choice(this, 'Data Quality Profile?')
                    .when(Condition.isPresent('$.workflow.dataQuality'), dqProfileJobTask)
                    .otherwise(new Succeed(this, 'No Data Quality Profile')))
            .branch(profileJobTask);

        const transformChoice = new Choice(this, 'Is transform present Found ?')
            .otherwise(glueCrawlerTask.next(profileCreateDataSetTask.next(profilingTasks).next(lineageTask)))
            .when(Condition.isPresent('$.workflow.transforms'), recipeCreateDataSetTask.next(recipeJobTask).next(glueCrawlerTask));

        const dataAssetStateMachine = new StateMachine(this, 'DataAssetStateMachine', {
            definitionBody: DefinitionBody.fromChainable(
                createStartTask.next(
                    new Choice(this, 'Connection data Found ?')
                        .otherwise(transformChoice)
                        .when(Condition.or(Condition.isPresent('$.workflow.dataset.connectionId'), Condition.isPresent('$.workflow.dataset.connection')),
                            new Choice(this, 'Is connectionId present?')
                                .otherwise(createConnectionTask.next(transformChoice))
                                .when(Condition.isPresent('$.workflow.dataset.connectionId'), transformChoice)
                        )
                )
            ),
            logs: {destination: dataAssetStateMachineLogGroup, level: LogLevel.ERROR, includeExecutionData: true},
            stateMachineName: `${namePrefix}-data-asset`,
            tracingEnabled: true
        });

        createConnectionLambda.grantInvoke(dataAssetStateMachine);
        createDataSetLambda.grantInvoke(dataAssetStateMachine);
        recipeJobLambda.grantInvoke(dataAssetStateMachine);
        profileJobLambda.grantInvoke(dataAssetStateMachine);
        dqProfileJobLambda.grantInvoke(dataAssetStateMachine);

        const triggerStateMachineRule = new Rule(this, 'TriggerStateMachineRule', {
            eventBus: spokeEventBus,
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
            * Job Completion Listener
            * Will process Data Brew job events once a job status change is detected
        */

        const JobCompletionPolicy = new PolicyStatement({
            actions: [
                'databrew:DescribeJob',
                'databrew:DescribeJobRun',
            ],
            resources: [
                `arn:aws:databrew:${region}:${accountId}:job/*`,
            ]
        });
        const eventProcessorLambda = new NodejsFunction(this, 'EventProcessorLambda', {
            description: 'Data Brew Job Completion Event Handler',
            entry: path.join(__dirname, '../../../../typescript/packages/apps/dataAsset/src/spoke_lambda_eventbridge.ts'),
            runtime: Runtime.NODEJS_18_X,
            tracing: Tracing.ACTIVE,
            functionName: `${namePrefix}-dataAsset-eventProcessor`,
            timeout: Duration.seconds(30),
            memorySize: 512,
            logRetention: RetentionDays.ONE_WEEK,
            environment: {
                SPOKE_EVENT_BUS_NAME: props.spokeEventBusName,
                JOBS_BUCKET_NAME: props.bucketName,
                JOBS_BUCKET_PREFIX: 'jobs',
                HUB_EVENT_BUS_NAME: dfEventBusArn(props.hubAccountId, region),
                SPOKE_GLUE_DATABASE_NAME: glueDatabase.databaseName
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

        hubEventBus.grantPutEventsTo(eventProcessorLambda);
        spokeEventBus.grantPutEventsTo(eventProcessorLambda);
        bucket.grantRead(eventProcessorLambda);
        bucket.grantPut(eventProcessorLambda);
        eventProcessorLambda.addToRolePolicy(JobCompletionPolicy);
        eventProcessorLambda.addToRolePolicy(SSMPolicy);
        eventProcessorLambda.addToRolePolicy(StateMachinePolicy);
        eventProcessorLambda.addToRolePolicy(GluePolicy);
        eventProcessorLambda.addToRolePolicy(DataQualityPolicy);

        // Rule for Databrew Job events
        const databrewJobRule = new Rule(this, 'DatabrewJobRule', {
            eventBus: defaultEventBus,
            eventPattern: {
                source: ['aws.databrew'],
                detailType: [DATA_BREW_JOB_STATE_CHANGE]
            }
        });

        databrewJobRule.addTarget(
            new LambdaFunction(eventProcessorLambda, {
                deadLetterQueue: deadLetterQueue,
                maxEventAge: Duration.minutes(5),
                retryAttempts: 2
            })
        );

        const glueCrawlerRule = new Rule(this, 'glueCrawlerRule', {
            eventBus: defaultEventBus,
            eventPattern: {
                source: ['aws.glue', 'aws.glue-dataquality'],
                detailType: [
                    GLUE_CRAWLER_STATE_CHANGE,
                    DATA_QUALITY_EVALUATION_RESULTS_AVAILABLE
                ]
            }
        });

        glueCrawlerRule.addTarget(
            new LambdaFunction(eventProcessorLambda, {
                deadLetterQueue: deadLetterQueue,
                maxEventAge: Duration.minutes(5),
                retryAttempts: 2
            })
        );


        // Rule for Create Flow completion events
        const createFlowCompletionRule = new Rule(this, 'CreateFlowCompletionRule', {
            eventBus: spokeEventBus,
            eventPattern: {
                detailType: [DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT]
            }
        });

        createFlowCompletionRule.addTarget(
            new EventBusTarget(hubEventBus, {
                deadLetterQueue: deadLetterQueue
            })
        );

        // Add eventBus Policy for incoming job events
        new CfnEventBusPolicy(this, 'JobEventBusPutEventPolicy', {
            eventBusName: dfSpokeEventBusName,
            statementId: 'AllowSpokeAccountsToPutJobEvents',
            statement: {
                Effect: Effect.ALLOW,
                Action: ['events:PutEvents'],
                Resource: [`arn:aws:events:${region}:${accountId}:event-bus/${dfSpokeEventBusName}`],
                Principal: '*',
                Condition: {
                    'StringEquals': {
                        'events:source': [DATA_ASSET_SPOKE_EVENT_SOURCE],
                        'events:detail-type': [DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT]
                    },
                    'ForAnyValue:StringEquals': {
                        'aws:PrincipalOrgPaths': `${props.orgPath.orgId}/${props.orgPath.rootId}/${props.orgPath.ouId}/`
                    }
                }
            }
        });

        // Create resources which enable the spoke account to subscribe to job events from the hub
        // Add role in this spoke account which will be used by the target in the hub account to publish hub events to this spoke bus
        const dfSpokeSubscriptionRuleTargetRole = new Role(
            this,
            `DfSpokeSubscriptionRuleTargetRole-${region}`,
            {
                roleName: `DfSpokeSubscriptionRuleTargetRole-${region}`,
                assumedBy: new ServicePrincipal("events.amazonaws.com"),
            }
        );
        spokeEventBus.grantPutEventsTo(dfSpokeSubscriptionRuleTargetRole);

        // Add rule and target to hub bus to subscribe to job events
        // need CfnRule as events.Rule does not allow specifying the bus ARN (to add a rule to a bus in another account)
        new CfnRule(this, 'SpokeSubscriptionRule', {
            eventBusName: hubEventBus.eventBusArn,
            eventPattern: {
                'detail-type': [DATA_ASSET_HUB_CREATE_REQUEST_EVENT],
                source: [DATA_ASSET_HUB_EVENT_SOURCE]
            },
            targets: [
                {
                    id: 'SubscribeTarget',
                    arn: spokeEventBus.eventBusArn,
                    roleArn: dfSpokeSubscriptionRuleTargetRole.roleArn
                }
            ]
        });

        NagSuppressions.addResourceSuppressions([eventProcessorLambda],
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
                        'Resource::arn:aws:states:<AWS::Region>:<AWS::AccountId>:execution:df-data-asset:*'],
                    reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments actions.'

                }
            ],
            true);

        NagSuppressions.addResourceSuppressions([eventProcessorLambda],
            [

                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [
                        'Action::s3:Abort*',
                        'Action::s3:GetBucket*',
                        'Action::s3:GetObject*',
                        'Action::s3:List*',
                        'Resource::arn:<AWS::Partition>:s3:::<SsmParameterValuedfspokesharedbucketNameC96584B6F00A464EAD1953AFF4B05118Parameter>/*',
                        `Resource::arn:aws:databrew:${region}:${accountId}:job/*`,
                        `Resource::arn:aws:ssm:${region}:${accountId}:parameter/df/spoke/dataAsset/*`,
                        `Resource::arn:aws:databrew:${region}:${accountId}:dataset/*`,
                        `Resource::arn:aws:databrew:${region}:${accountId}:recipe/*`,
                        `Resource::arn:aws:glue:${region}:${accountId}:connection/*`,
                        `Resource::arn:aws:states:${region}:${accountId}:stateMachine:df-spoke-*`,
                        `Resource::arn:aws:glue:${region}:${accountId}:crawler/*`,
                        `Resource::arn:aws:glue:${region}:${accountId}:table/{"Fn::Select":[1,{"Fn::Split":["/",{"Fn::Select":[5,{"Fn::Split":[":",{"Ref":"SsmParameterValuedfspokesharedgluedatabaseArnC96584B6F00A464EAD1953AFF4B05118Parameter"}]}]}]}]}/*`,
                        `Resource::arn:aws:glue:${region}:${accountId}:dataQualityRuleset*`
                    ],
                    reason: 'This policy is required for the lambda to access job profiling objects stored in s3.'

                }
            ],
            true);

        NagSuppressions.addResourceSuppressions([
                createStartLambda,
                createConnectionLambda,
                createDataSetLambda,
                createProfileDataSetLambda,
                profileJobLambda,
                dqProfileJobLambda,
                recipeJobLambda,
                glueCrawlerLambda,
                spokeLineageLambda
            ],
            [
                {
                    id: 'AwsSolutions-IAM4',
                    appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
                    reason: 'This policy is the one generated by CDK.'

                },
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [
                        `Resource::*`,
                        `Action::s3:Abort*`,
                        'Action::s3:GetBucket*',
                        'Action::s3:GetObject*',
                        'Action::s3:List*',
                        `Resource::arn:aws:databrew:${region}:${accountId}:dataset/*`,
                        `Resource::arn:aws:databrew:${region}:${accountId}:recipe/*`,
                        `Resource::arn:aws:databrew:${region}:${accountId}:job/*`,
                        `Resource::arn:aws:iam::${accountId}:role/df-*`,
                        `Resource::arn:aws:secretsmanager:${region}:${accountId}:secret:*`,
                        `Resource::arn:aws:states:${region}:${accountId}:stateMachine:${namePrefix}-*`,
                        `Resource::arn:aws:ssm:${region}:${accountId}:parameter/df/spoke/dataAsset/*`,
                        `Resource::arn:aws:glue:${region}:${accountId}:crawler/*`,
                        `Resource::arn:aws:glue:${region}:${accountId}:connection/*`,
                        `Resource::arn:aws:glue:${region}:${accountId}:table/${glueDatabase.databaseName}/*`,
                        `Resource::arn:aws:glue:${region}:${accountId}:table/{"Fn::Select":[1,{"Fn::Split":["/",{"Fn::Select":[5,{"Fn::Split":[":",{"Ref":"SsmParameterValuedfspokesharedgluedatabaseArnC96584B6F00A464EAD1953AFF4B05118Parameter"}]}]}]}]}/*`,
                        `Resource::arn:<AWS::Partition>:s3:::<SsmParameterValuedfspokesharedbucketNameC96584B6F00A464EAD1953AFF4B05118Parameter>/*`,
                        `Resource::arn:aws:glue:${region}:${accountId}:dataQualityRuleset*`

                    ],
                    reason: 'This policy is required for the lambda to perform profiling.'

                }
            ],
            true);

        NagSuppressions.addResourceSuppressions([dataAssetStateMachine],
            [
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [
                        'Resource::<DataAssetSpokeCreateStartLambdaDF598F63.Arn>:*',
                        'Resource::<DataAssetSpokeProfileJobLambdaED6BD275.Arn>:*',
                        'Resource::<DataAssetSpokeCreateConnectionLambda931C6392.Arn>:*',
                        'Resource::<DataAssetSpokeCreateDataSetLambda6B3E2D95.Arn>:*',
                        'Resource::<DataAssetSpokeCreateProfileDataSetLambdaBC2367B9.Arn>:*',
                        'Resource::<DataAssetSpokeRecipeJobLambda27C4CF5E.Arn>:*',
                        'Resource::<DataAssetSpokeDQProfileJobLambda46CE9CB6.Arn>:*',
                        'Resource::<DataAssetSpokeGlueCrawlerLambda66DF909B.Arn>:*',
                        'Resource::<DataAssetSpokeSpokeLineageLambda88C4B5EF.Arn>:*'
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
