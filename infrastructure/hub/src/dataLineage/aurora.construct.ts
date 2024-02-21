import { Aspects, Duration, RemovalPolicy, } from 'aws-cdk-lib';
import { InstanceType, IVpc, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { AuroraPostgresEngineVersion, CfnDBCluster, DatabaseCluster, DatabaseClusterEngine, IDatabaseCluster, ParameterGroup, SubnetGroup } from 'aws-cdk-lib/aws-rds';
import { HostedRotation, ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface AuroraDatabaseConstructProperties {
    vpc: IVpc;
    domain: string;
    minClusterCapacity: number;
    maxClusterCapacity: number;
    clusterDeletionProtection: boolean;
}

export class AuroraDatabase extends Construct {
    instanceName: string;
    databaseSecurityGroup: SecurityGroup;
    clusterIdentifier: string;
    rdsClusterWriterEndpoint: string;
    databaseUsername: string;
    databaseName: string;
    databaseSecret: ISecret;
    databaseCluster: IDatabaseCluster;

    constructor(scope: Construct, id: string, props: AuroraDatabaseConstructProperties) {
        super(scope, id);

        this.instanceName = `df-${props.domain}`;
        this.databaseUsername = 'marquez';
        this.databaseName = 'marquez';

        const clusterName = `df-${props.domain}-cluster`;

        const iamPolicy = new Policy(this, 'iam-policy', {
            statements: [
                new PolicyStatement({
                    sid: 'CreateRDSSLR',
                    actions: ['iam:CreateServiceLinkedRole'],
                    resources: [
                        `arn:aws:iam::*:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS*`,
                    ],
                    conditions: {
                        'StringLike': {
                            'iam:AWSServiceName': 'rds.amazonaws.com'
                        }
                    }
                }),
                new PolicyStatement({
                    sid: 'CreateECSSLR',
                    actions: ['iam:CreateServiceLinkedRole'],
                    resources: [
                        'arn:aws:iam::*:role/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS*'
                    ],
                    conditions: {
                        'StringLike': {
                            'iam:AWSServiceName': 'ecs.amazonaws.com'
                        }
                    }
                })
                , new PolicyStatement({
                    sid: 'AttachPolicy',
                    actions: [
                        'iam:AttachRolePolicy',
                        'iam:PutRolePolicy'
                    ],
                    resources: [
                        `arn:aws:iam::*:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS*`,
                        `arn:aws:iam::*:role/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS*`,
                    ]
                })
            ]
        });

        NagSuppressions.addResourceSuppressions(iamPolicy, [
            {
                id: 'AwsSolutions-IAM5',
                reason: 'This policy only allow the lambda to create RDS service linked role.'
            }
        ]);

        this.databaseSecurityGroup = new SecurityGroup(this, id.concat(`${this.instanceName}-sg`), {
            vpc: props.vpc,
            description: `${this.instanceName}-instance-sg`,
            securityGroupName: `${this.instanceName}-instance-sg`,
            allowAllOutbound: true
        });

        this.databaseSecret = new Secret(this, 'DBSecret', {
            secretName: `${this.instanceName}-credentials`,
            generateSecretString: {
                excludePunctuation: true
            }
        });

        this.databaseSecret.addRotationSchedule('RotationSchedule', {
            hostedRotation: HostedRotation.postgreSqlSingleUser({
                functionName: `df-${props.domain}-dataLineage-secret-rotation`
            })
        });

        const dbEngine = DatabaseClusterEngine.auroraPostgres({version: AuroraPostgresEngineVersion.VER_14_8});

        /**
         let's suppose you need to create a trigger on your database,
         this custom parameter group it's responsible to perform this with the following parameter log_bin_trust_function_creators,
         because the default parameter group is not editable
         */
        const parameterGroupForInstance = new ParameterGroup(this, `${this.instanceName}-${dbEngine.engineVersion?.fullVersion}`, {
            engine: dbEngine,
            description: `Aurora RDS Instance Parameter Group for database ${this.instanceName}`,
            parameters: {}
        });

        const subnetGroup = new SubnetGroup(this, 'aurora-rds-subnet-group', {
            description: `Aurora RDS Subnet Group for database ${this.instanceName}`,
            subnetGroupName: `df-${props.domain}-aurora-rds-subnet-group`,
            vpc: props.vpc,
            removalPolicy: RemovalPolicy.DESTROY,
            vpcSubnets: {
                subnets: props.vpc.isolatedSubnets
            },
        });

        this.databaseCluster = new DatabaseCluster(this, clusterName, {
            engine: dbEngine,
            storageEncrypted: true,
            // This is the only valid option for postgresql
            cloudwatchLogsExports: ['postgresql'],
            instanceProps: {
                instanceType: new InstanceType('serverless'),
                vpc: props.vpc,
                vpcSubnets: {
                    subnets: props.vpc.isolatedSubnets
                },
                securityGroups: [this.databaseSecurityGroup],
                parameterGroup: parameterGroupForInstance,
            },
            backup: {
                retention: Duration.days(RetentionDays.ONE_WEEK),
                preferredWindow: '03:00-04:00'
            },
            defaultDatabaseName: this.databaseName,
            credentials: {
                username: this.databaseUsername,
                password: this.databaseSecret.secretValue
            },
            // something wrong with the construct where it always accepts parameter as string
            deletionProtection: props.clusterDeletionProtection,
            instances: 1,
            cloudwatchLogsRetention: RetentionDays.ONE_WEEK,
            iamAuthentication: false,
            clusterIdentifier: `df-${props.domain}-aurora-cluster`,
            subnetGroup: subnetGroup,
        });

        this.clusterIdentifier = this.databaseCluster.clusterIdentifier;


        if (!props.clusterDeletionProtection) {
            NagSuppressions.addResourceSuppressions(this.databaseCluster, [
                {
                    id: 'AwsSolutions-RDS10',
                    reason: 'Cluster deletion protection is a configurable value (it\'s set to true by default).'
                }
            ], true);
        }

        this.rdsClusterWriterEndpoint = this.databaseCluster.clusterEndpoint.hostname;

        // this is temporary workaround cause cdk does not have support for
        // serverlessV2ScalingConfiguration yet
        Aspects.of(this.databaseCluster).add({
            visit(node) {
                if (node instanceof CfnDBCluster) {
                    node.serverlessV2ScalingConfiguration = {
                        minCapacity: props.minClusterCapacity,
                        maxCapacity: props.maxClusterCapacity
                    };
                }
            }
        });

        NagSuppressions.addResourceSuppressions(this.databaseCluster, [
            {
                id: 'AwsSolutions-RDS6',
                reason: 'All connection to RDS is through the RDS proxy (IAM database authentication is enabled for this), RDS proxy needs to connect to RDS using database auth.'
            }
        ]);

        this.databaseSecurityGroup.addIngressRule(this.databaseSecurityGroup, Port.tcp(5432), 'allow db connection');
    }
}
