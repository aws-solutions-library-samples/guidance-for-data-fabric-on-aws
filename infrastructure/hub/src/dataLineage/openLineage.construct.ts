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
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import * as cr from 'aws-cdk-lib/custom-resources';
import { CustomResource } from 'aws-cdk-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface OpenLineageConstructProperties {
    vpc: IVpc,
    openlineageApiCpu: number;
    openlineageApiMemory: number;
    openlineageWebCpu: number;
    openlineageWebMemory: number;
    clusterName: string;
    marquezVersionTag: string;
    databaseCluster: IDatabaseCluster;
    databaseUsername: string;
    databaseName: string;
    databasePassword: ISecret;
    databaseSecurityGroup: ISecurityGroup;
    loadBalancerCertificateArn: string;
    userPoolDomainName: string;
    userPoolId: string;
}

export class OpenLineage extends Construct {

    public openLineageWebUrl: string;
    public openLineageApiUrl: string;

    constructor(scope: Construct, id: string, props: OpenLineageConstructProperties) {
        super(scope, id);

        const namePrefix = `df`;

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
            image: ContainerImage.fromAsset(path.join(__dirname, './assets/openlineage'), {
                buildArgs: {
                    MARQUEZ_VERSION_TAG: props.marquezVersionTag
                }
            }),
            readonlyRootFilesystem: false,
            containerName: 'openlineageApi',
            logging: LogDriver.awsLogs({streamPrefix: 'openlineage-api', mode: AwsLogDriverMode.NON_BLOCKING}),
            environment: {
                POSTGRES_HOST: props.databaseCluster.clusterEndpoint.hostname,
                MARQUEZ_CONFIG: "marquez.config.yml",
                POSTGRES_DB: props.databaseName,
                POSTGRES_USER: props.databaseUsername
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

        const dnsSubDomain = `df`;

        const openlineageNamespace = new PrivateDnsNamespace(this, 'OpenLineageNamespace', {
            name: dnsSubDomain,
            vpc: props.vpc
        });

        const openlineageApiCloudMapServiceName = `openlineage.api`;

        const openlineageApiService = new FargateService(this, 'OpenlineageApiService', {
            taskDefinition: apiTaskDefinition,
            cluster: computeCluster,
            cloudMapOptions: {
                dnsRecordType: DnsRecordType.A,
                cloudMapNamespace: openlineageNamespace,
                name: openlineageApiCloudMapServiceName
            },
            desiredCount: 1,
            vpcSubnets: {
                subnets: props.vpc.privateSubnets
            },
        });

        openlineageApiService.connections.allowFrom(Peer.anyIpv4(), Port.tcp(5000), 'Allow application inside VPC to access the api endpoint');
        openlineageApiService.connections.allowFrom(Peer.anyIpv4(), Port.tcp(5001), 'Allow application inside VPC to access the administrator endpoint');

        this.openLineageApiUrl = `http://${openlineageApiCloudMapServiceName}.${dnsSubDomain}:5000`;

        props.databaseSecurityGroup.addIngressRule(openlineageApiService.connections.securityGroups[0]!, Port.tcp(5432), 'Allow openlineageApi to access the RDS database')

        const openlineageWebService = new ApplicationLoadBalancedFargateService(this, "OpenlineageWebService", {
            cluster: computeCluster,
            cpu: props.openlineageWebCpu,
            memoryLimitMiB: props.openlineageWebMemory,
            certificate: Certificate.fromCertificateArn(this, 'OpenLineageWebCertificate', props.loadBalancerCertificateArn),
            taskImageOptions: {
                image: ContainerImage.fromRegistry(`marquezproject/marquez-web:${props.marquezVersionTag}`),
                containerPort: 3000,
                logDriver: LogDriver.awsLogs({streamPrefix: 'openlineage-api', mode: AwsLogDriverMode.NON_BLOCKING}),
                enableLogging: true,
                environment: {
                    MARQUEZ_HOST: `${openlineageApiCloudMapServiceName}.${dnsSubDomain}`,
                    MARQUEZ_PORT: "5000"
                },
            },
            publicLoadBalancer: true,
            protocol: ApplicationProtocol.HTTPS
        });

        this.openLineageWebUrl = `https://${openlineageWebService.loadBalancer.loadBalancerDnsName}`;

        // This custom resource is needed to handle this case issue for Cognito
        // https://github.com/aws/aws-cdk/issues/11171
        const transformLowerCaseLambda = new Function(this, 'TransformLowerCaseFunction', {
            handler: 'index.handler',
            code: Code.fromInline(`
                exports.handler = async (event) => {
                    console.log("Event payload: " + JSON.stringify(event))
                    try {
                        switch (event.RequestType) {
                            case 'Create':
                            case 'Update':
                            case 'Delete':
                                const {InputString} = event.ResourceProperties;
                                return {Data: {OutputString:InputString.toLowerCase()}};
                            default: {
                                console.log('Unknown request type');
                            }
                        }
                    } catch (error) {
                        console.log(error);
                    }
                };
              `),
            runtime: Runtime.NODEJS_18_X
        });

        const customResourceProvider = new cr.Provider(this, 'TransformLowerLambdaCrProvider', {
            onEventHandler: transformLowerCaseLambda,
        });

        const customResourceTransformLower = new CustomResource(this, 'CustomResourceTransformLower', {
            serviceToken: customResourceProvider.serviceToken,
            properties: {
                uniqueToken: Date.now(),
                InputString: openlineageWebService.loadBalancer.loadBalancerDnsName
            }
        });

        NagSuppressions.addResourceSuppressions([transformLowerCaseLambda, customResourceProvider], [
            {
                id: 'AwsSolutions-IAM4',
                reason: 'This only contains the policy the create and insert log to log group.',
                appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
            },
            {
                id: 'AwsSolutions-IAM5',
                reason: 'This only applies to the seeder lambda defined in this construct and its versions.',
                appliesTo: ['Resource::<OpenLineageTransformLowerCaseFunction46AD14A6.Arn>:*']
            },
            {
                id: 'AwsSolutions-L1',
                reason: 'The cr.Provider library is not maintained by this project.'
            }
        ], true);

        const userPool = UserPool.fromUserPoolId(this, 'UserPool', props.userPoolId);

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
                    `https://${customResourceTransformLower.getAtt("OutputString")}/oauth2/idpresponse`,
                ],
            },
        });

        const cfnClient = userPoolClient.node.defaultChild as CfnUserPoolClient;
        cfnClient.addPropertyOverride('RefreshTokenValidity', 1);
        cfnClient.addPropertyOverride('SupportedIdentityProviders', ['COGNITO']);

        const userPoolDomain = UserPoolDomain.fromDomainName(this, 'UserPoolDomain', props.userPoolDomainName);

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
