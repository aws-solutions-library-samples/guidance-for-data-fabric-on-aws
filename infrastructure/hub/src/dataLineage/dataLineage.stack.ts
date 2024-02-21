import * as cdk from 'aws-cdk-lib';
import { Fn, Stack, StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { AuroraDatabase } from './aurora.construct.js';
import { isolatedSubnetIdListParameter, privateSubnetIdListParameter, publicSubnetIdListParameter, vpcIdParameter } from '../shared/network.construct.js';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { StringListParameter, StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import { clusterNameParameter } from "../shared/compute.construct.js";
import { userPoolDomainParameter, userPoolIdParameter } from "../shared/cognito.construct.js";
import { OpenLineage } from "./openLineage.construct.js";
import { DataLineage } from "./dataLineage.construct.js";
import { eventBusArnParameter } from '../shared/eventbus.construct.js';


export type DataLineageStackProperties = StackProps & {
    domain: string;
    openlineageApiCpu: number;
    openlineageApiMemory: number;
    openlineageWebCpu: number;
    openlineageWebMemory: number;
    marquezVersionTag: string;
    loadBalancerCertificateArn: string;
};

export const rdsClusterWriterEndpoint = (domain: string) => `/df/${domain}/dataLineage/aurora/rdsClusterWriterEndpoint`;
export const openLineageWebUrlParameter = (domain: string) => `/df/${domain}/dataLineage/openLineageWebUrl`;
export const openLineageApiUrlParameter = (domain: string) => `/df/${domain}/dataLineage/openLineageApiUrl`;


export class DataLineageStack extends Stack {
    constructor(scope: Construct, id: string, props: DataLineageStackProperties) {
        super(scope, id, props);

        const vpcId = StringParameter.valueForStringParameter(this, vpcIdParameter(props.domain));

        const isolatedSubnetIds = StringListParameter.valueForTypedListParameter(this, isolatedSubnetIdListParameter(props.domain));

        const privateSubnetIds = StringListParameter.valueForTypedListParameter(this, privateSubnetIdListParameter(props.domain));

        const publicSubnetIds = StringListParameter.valueForTypedListParameter(this, publicSubnetIdListParameter(props.domain));

        const userPoolDomainName = StringParameter.valueForStringParameter(this, userPoolDomainParameter(props.domain));

        const userPoolId = StringParameter.valueForStringParameter(this, userPoolIdParameter(props.domain));

        const availabilityZones = cdk.Stack.of(this).availabilityZones;

        const vpc = Vpc.fromVpcAttributes(this, 'Vpc', {
            vpcId,
            availabilityZones,
            isolatedSubnetIds: availabilityZones.map((_, index) => Fn.select(index, isolatedSubnetIds)),
            privateSubnetIds: availabilityZones.map((_, index) => Fn.select(index, privateSubnetIds)),
            publicSubnetIds: availabilityZones.map((_, index) => Fn.select(index, publicSubnetIds))
        });

        const aurora = new AuroraDatabase(this, 'OpenLineageDatabase', {
            domain: props.domain,
            vpc,
            minClusterCapacity: 1,
            maxClusterCapacity: 1,
            clusterDeletionProtection: true
        });

        new StringParameter(this, 'rdsClusterWriterEndpoint', {
            parameterName: rdsClusterWriterEndpoint(props.domain),
            stringValue: aurora.rdsClusterWriterEndpoint
        });

        const clusterName = StringParameter.valueForStringParameter(this, clusterNameParameter(props.domain));

        const openLineage = new OpenLineage(this, 'OpenLineage', {
            vpc,
            clusterName,
            userPoolDomainName,
            userPoolId,
            domain: props.domain,
            openlineageApiCpu: props.openlineageApiCpu,
            openlineageApiMemory: props.openlineageApiMemory,
            openlineageWebCpu: props.openlineageWebCpu,
            openlineageWebMemory: props.openlineageWebMemory,
            marquezVersionTag: props.marquezVersionTag,
            loadBalancerCertificateArn: props.loadBalancerCertificateArn,
            databaseCluster: aurora.databaseCluster,
            databasePassword: aurora.databaseSecret,
            databaseUsername: aurora.databaseUsername,
            databaseName: aurora.databaseName,
            databaseSecurityGroup: aurora.databaseSecurityGroup
        });

        new StringParameter(this, 'openLineageWebUrlParameter', {
            parameterName: openLineageWebUrlParameter(props.domain),
            stringValue: openLineage.openLineageWebUrl
        });

        new StringParameter(this, 'openLineageApiUrlParameter', {
            parameterName: openLineageApiUrlParameter(props.domain),
            stringValue: openLineage.openLineageApiUrl
        });

        const eventBusName = StringParameter.valueForStringParameter(this, eventBusArnParameter(props.domain));
        new DataLineage(this, 'DataLineage', {
            vpc,
            domain: props.domain,
            marquezUrl: openLineage.openLineageApiUrl,
            eventBusName
        });

        NagSuppressions.addResourceSuppressionsByPath(this, [
                '/DataLineageStack/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource'
            ],
            [
                {
                    id: 'AwsSolutions-IAM4',
                    reason: 'This only contains the policy the create and insert log to log group.',
                    appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
                }
            ],
            true);

        NagSuppressions.addResourceSuppressionsByPath(this, [
                '/DataLineageStack/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource'
            ],
            [
                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: ['Resource::*'],
                    reason: 'This policy attached to the role is generated by CDK.'
                }
            ],
            true);

    }


}
