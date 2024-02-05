// import * as cdk from 'aws-cdk-lib';
import { AwsLogDriverMode, Cluster, ContainerImage, FargateService, FargateTaskDefinition, LogDriver, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import type { ISecurityGroup, IVpc } from "aws-cdk-lib/aws-ec2";
import { Peer, Port } from "aws-cdk-lib/aws-ec2";
import type { IDatabaseCluster } from "aws-cdk-lib/aws-rds";
import type { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import path from "path";
import { fileURLToPath } from "url";
import { NagSuppressions } from "cdk-nag";
import { DnsRecordType, PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { AuthenticateCognitoAction } from "aws-cdk-lib/aws-elasticloadbalancingv2-actions";
import { CfnUserPoolClient, OAuthScope, UserPool, UserPoolClient, UserPoolDomain } from "aws-cdk-lib/aws-cognito";
import { ApplicationProtocol, ListenerAction } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { userPoolDomainParameter, userPoolIdParameter } from "../shared/cognito.construct.js";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export interface DataLineageConstructProperties {
    domain: string;
    vpc: IVpc,
    openlineageApiCpu: number;
    openlineageApiMemory: number;
    clusterName: string;
    marquezTag: string;
    databaseCluster: IDatabaseCluster;
    databaseUsername: string;
    databasePassword: ISecret;
    databaseSecurityGroup: ISecurityGroup;
}

export class DataLineage extends Construct {

    constructor(scope: Construct, id: string, props: DataLineageConstructProperties) {
        super(scope, id);

        const namePrefix = `sdf-${props.domain}`;

        const computeCluster = Cluster.fromClusterAttributes(this, 'ComputeCluster', {
            vpc: props.vpc,
            clusterName: props.clusterName,
        });

        const apiTaskDefinition = new FargateTaskDefinition(this, 'OpenLineageApiTaskDefinition', {
            cpu: props.openlineageApiCpu,
            memoryLimitMiB: props.openlineageApiMemory,
            family: `${namePrefix}-openlineage-api`,
        });

        apiTaskDefinition.addContainer('api', {
            image: ContainerImage.fromAsset(path.join(__dirname, './assets/openlineage')),
            readonlyRootFilesystem: false,
            containerName: 'openlineageApi',
            logging: LogDriver.awsLogs({streamPrefix: 'openlineage-api', mode: AwsLogDriverMode.NON_BLOCKING}),
            environment: {
                POSTGRES_HOST: props.databaseCluster.clusterEndpoint.hostname,
                MARQUEZ_CONFIG: "marquez.config.yml",
                POSTGRES_DB: "marquez",
                POSTGRES_USER: "marquez"
            },
            secrets: {
                POSTGRES_PASSWORD: Secret.fromSecretsManager(props.databasePassword)
            },
            portMappings: [
                {
                    containerPort: 5000,
                    protocol: Protocol.TCP
                },
                {
                    containerPort: 5001,
                    protocol: Protocol.TCP
                }
            ]
        });

        const dnsSubDomain = 'openlineage.sdf';

        const openlineageNamespace = new PrivateDnsNamespace(this, 'OpenLineageNamespace', {
            name: dnsSubDomain,
            vpc: props.vpc
        });

        const openlineageApiService = new FargateService(this, 'OpenlineageApiService', {
            taskDefinition: apiTaskDefinition,
            cluster: computeCluster,
            cloudMapOptions: {
                dnsRecordType: DnsRecordType.A,
                cloudMapNamespace: openlineageNamespace,
                name: `api`
            },
            desiredCount: 1,
            vpcSubnets: {
                subnets: props.vpc.privateSubnets
            },
        });

        openlineageApiService.connections.allowFrom(Peer.anyIpv4(), Port.tcp(5000), 'Allow application inside VPC to access the api endpoint');
        openlineageApiService.connections.allowFrom(Peer.anyIpv4(), Port.tcp(5001), 'Allow application inside VPC to access the administrator endpoint');

        props.databaseSecurityGroup.addIngressRule(openlineageApiService.connections.securityGroups[0]!, Port.tcp(5432), 'Allow openlineageApi to access the RDS database')

        const openlineageWebService = new ApplicationLoadBalancedFargateService(this, "OpenlineageWebService", {
            cluster: computeCluster,
            cpu: 512,
            certificate: Certificate.fromCertificateArn(this, 'OpenLineageWebCertificate', 'arn:aws:acm:ap-southeast-2:997324462926:certificate/947554a7-008e-44b0-b558-94798a9b40cd'),
            taskImageOptions: {
                image: ContainerImage.fromRegistry('marquezproject/marquez-web:0.43.1'),
                containerPort: 3000,
                logDriver: LogDriver.awsLogs({streamPrefix: 'openlineage-api', mode: AwsLogDriverMode.NON_BLOCKING}),
                enableLogging: true,
                environment: {
                    MARQUEZ_HOST: `api.${dnsSubDomain}`,
                    MARQUEZ_PORT: "5000"
                },
            },
            memoryLimitMiB: 2048,
            publicLoadBalancer: true,
            protocol: ApplicationProtocol.HTTPS
        });

        const userPool = UserPool.fromUserPoolId(this, 'UserPool', StringParameter.valueForStringParameter(this, userPoolIdParameter(props.domain)))

        const userPoolClient = new UserPoolClient(this, 'Client', {
            userPool: userPool,
            generateSecret: true,
            authFlows: {
                userPassword: true,
            },
            disableOAuth: false,
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                },
                scopes: [OAuthScope.EMAIL],
                callbackUrls: [
                    `https://${openlineageWebService.loadBalancer.loadBalancerDnsName}/oauth2/idpresponse`,
                ],
            },
        });

        const cfnClient = userPoolClient.node.defaultChild as CfnUserPoolClient;
        cfnClient.addPropertyOverride('RefreshTokenValidity', 1);
        cfnClient.addPropertyOverride('SupportedIdentityProviders', ['COGNITO']);

        const userPoolDomain = UserPoolDomain.fromDomainName(this, 'UserPoolDomain', StringParameter.valueForStringParameter(this, userPoolDomainParameter(props.domain)));

        openlineageWebService.listener.addAction('CognitoListener', {
            action: new AuthenticateCognitoAction({
                next: ListenerAction.forward([openlineageWebService.targetGroup]),
                userPool: userPool,
                userPoolDomain: userPoolDomain,
                userPoolClient
            })
        })

        NagSuppressions.addResourceSuppressions([openlineageWebService], [
            {
                id: 'AwsSolutions-ELB2',
                reason: 'We will use the ecs log.'
            }
        ], true);

        NagSuppressions.addResourceSuppressions([apiTaskDefinition, openlineageWebService], [
            {
                id: 'AwsSolutions-ECS2',
                reason: 'Secrets are being injected using the using the ECS "secret" variable functionality.'
            },
            {
                id: 'AwsSolutions-IAM5',
                reason: 'This is the role that is generated by CDK.'
            }
        ], true);

        NagSuppressions.addResourceSuppressions([openlineageApiService, openlineageWebService], [
            {
                id: 'AwsSolutions-EC23',
                reason: 'Since the openlineage api can only be accessible from inside the VPC, this will not be an issue.'
            }
        ], true);

    }
}
