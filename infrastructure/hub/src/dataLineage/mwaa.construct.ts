import * as cdk from 'aws-cdk-lib';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as mwaa from 'aws-cdk-lib/aws-mwaa';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
// import * as ssm from 'aws-cdk-lib/aws-ssm';
import { fileURLToPath } from 'url';
import { NagSuppressions } from 'cdk-nag';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export interface MWAAConstructProperties {
    domain: string;
    isolatedSubnetIds: string[];
    airflowSg: string
}

export class MWAA extends Construct {
    public airflowUrl: string;

    private accountId = cdk.Stack.of(this).account;
    private region = cdk.Stack.of(this).region;

    constructor(scope: Construct, id: string, props: MWAAConstructProperties) {
        super(scope, id);

        const namePrefix = `sdf-${props.domain}`;
        const mwaaBucketName = `${namePrefix}-data-lineage-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`;

        // Create bucket for MWAA.
        const mwaaBucket = new s3.Bucket(this, 'mwaaBucket', {
            bucketName: mwaaBucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
        });

        NagSuppressions.addResourceSuppressions(mwaaBucket,
			[
				{
					id: 'AwsSolutions-S1',
					reason: 'This is an internal S3 bucket used for asset management in MWAA and does not need to keep access logs.'
				}
				],
			true
            );



        new BucketDeployment(this, 'airflowDeployment', {
            destinationBucket: mwaaBucket,
            sources: [Source.asset(path.join(__dirname, `./assets/mwaa`))],
            include: ['requirements.txt', 'plugins.zip', 'dags/*'],
            exclude: ['requirements.in', 'dags.zip', 'plugins/*', '.DS_Store']
        });

        // Create role for MWAA
        const airflowRole = new iam.Role(this, 'airflowRole', {
            assumedBy: new iam.CompositePrincipal(
                new iam.ServicePrincipal('airflow-env.amazonaws.com'),
                new iam.ServicePrincipal('airflow.amazonaws.com')
            ),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite')
            ]
        });

        mwaaBucket.grantReadWrite(airflowRole);

        const airflowPolicy = new iam.Policy(this, 'airflow-policy', {
            statements: [
                new iam.PolicyStatement({
                    sid: 'airflowMetrics',
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'airflow:PublishMetrics'
                    ],
                    resources: ['*']

                }),
                new iam.PolicyStatement({
                    sid: 'cloudWatchLogs',
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'logs:CreateLogStream',
                        'logs:CreateLogGroup',
                        'logs:PutLogEvents',
                        'logs:GetLogEvents',
                        'logs:GetLogRecord',
                        'logs:GetLogGroupFields',
                        'logs:GetQueryResults',
                        'logs:DescribeLogGroups',
                    ],
                    resources: ['*']

                }),
                new iam.PolicyStatement({
                    sid: 'cloudwatchMetrics',
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'cloudwatch:PutMetricData'
                    ],
                    resources: ['*']

                }),
                new iam.PolicyStatement({
                    sid: 'sqs',
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'sqs:ChangeMessageVisibility',
                        'sqs:DeleteMessage',
                        'sqs:GetQueueAttributes',
                        'sqs:GetQueueUrl',
                        'sqs:ReceiveMessage',
                        'sqs:SendMessage',
                    ],
                    resources: [`'arn:aws:sqs:${this.region}:*:airflow-celery-*'`]

                }),
                new iam.PolicyStatement({
                    sid: 'airflowKms',
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'kms:Decrypt',
                        'kms:DescribeKey',
                        'kms:GenerateDataKey*',
                        'kms:Encrypt',
                    ],
                    notResources: [`arn:aws:kms:*:${this.accountId}:key/*`],
                    conditions: {
                        StringLike: {
                            'kms:ViaService': [
                                `sqs.${this.region}.amazonaws.com`
                            ]
                        }
                    }

                }),

            ]
        });

        airflowRole.attachInlinePolicy(airflowPolicy);

        // Create airflow environment

        const airflowEnv = new mwaa.CfnEnvironment(this, 'airflowEnv', {
            name: ``,
            environmentClass: ``,
            airflowVersion: ``,
            airflowConfigurationOptions: {
                'core.load_default_connections': false,
                'core.load_examples': false,
                'webserver.dag_default_view': 'tree',
                'webserver.dag_orientation': 'TB',
                'core.lazy_load_plugins': false,
                'secrets.backend': 'airflow.providers.amazon.aws.secrets.secrets_manager.SecretsManagerBackend',
                'secrets.backend_kwargs': {
                    'connections_prefix': 'airflow/connections',
                    'variables_prefix': 'airflow/variables',
                }
            },
            dagS3Path: 'dags',
            pluginsS3Path: 'plugins.zip',
            requirementsS3Path: 'requirements.txt',
            sourceBucketArn: mwaaBucket.bucketArn,
            networkConfiguration: {
                securityGroupIds: [props.airflowSg],
                subnetIds: props.isolatedSubnetIds
            },
            executionRoleArn: airflowRole.roleArn,
            maxWorkers: 10,
            webserverAccessMode: 'PUBLIC_ONLY',
            loggingConfiguration: {
                taskLogs: { enabled: true, logLevel: 'INFO' },
                workerLogs: { enabled: true, logLevel: 'INFO' },
                schedulerLogs: { enabled: true, logLevel: 'INFO' },
                dagProcessingLogs: { enabled: true, logLevel: 'INFO' },
                webserverLogs: { enabled: true, logLevel: 'INFO' }
            }
        });

        this.airflowUrl = airflowEnv.attrWebserverUrl;

        NagSuppressions.addResourceSuppressions(airflowRole,
			[
				{
					id: 'AwsSolutions-IAM4',
                    appliesTo:['Policy::arn:<AWS::Partition>:iam::aws:policy/SecretsManagerReadWrite'],
					reason: 'Airflow needs read and write access to secret manager.'
				},
                {
					id: 'AwsSolutions-IAM5',
                    appliesTo:['Action::s3:Abort*','Action::s3:DeleteObject*','Action::s3:GetBucket*','Action::s3:GetObject*','Action::s3:List*'],
					reason: 'Airflow needs wildecard S3 access.'
				},
                {
					id: 'AwsSolutions-IAM5',
                    appliesTo:['Resource::<MWAAmwaaBucket5CEF0B14.Arn>/*'],
					reason: 'Airflow needs wildecard S3 bucket access.'
				},
                {
					id: 'AwsSolutions-IAM5',
                    appliesTo:['Resource::*'],
					reason: 'Airflow default policy.'
				}
				],
			true
            );

            NagSuppressions.addResourceSuppressions(airflowPolicy,
                [
                    {
                        id: 'AwsSolutions-IAM5',
                        appliesTo:["Resource::'arn:aws:sqs:<AWS::Region>:*:airflow-celery-*'"],
                        reason: 'Airflow access.'
                    },
                    {
                        id: 'AwsSolutions-IAM5',
                        appliesTo:['Resource::*'],
                        reason: 'needs wildcard access for cloudwatch.'
                    },
                    {
                        id: 'AwsSolutions-IAM5',
                        appliesTo:['Action::kms:GenerateDataKey*'],
                        reason: 'Airflow needs access to generate kms key.'
                    }
                    ],
                true
                );
    }
}