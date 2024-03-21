import * as cdk from 'aws-cdk-lib';
import { Fn, Stack, StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { AuroraDatabase } from './aurora.construct.js';
import { accessLogBucketNameParameter, isolatedSubnetIdListParameter, privateSubnetIdListParameter, publicSubnetIdListParameter, vpcIdParameter } from '../shared/network.construct.js';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { StringListParameter, StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import { clusterNameParameter } from "../shared/compute.construct.js";
import { userPoolDomainParameter } from "../shared/cognito.construct.js";
import { OpenLineage } from "./openLineage.construct.js";
import { userPoolIdParameter, OrganizationUnitPath } from '@df/cdk-common';
import { DataLineage } from "./dataLineage.construct.js";


export type DataLineageStackProperties = StackProps & {
    openlineageApiCpu: number;
    openlineageApiMemory: number;
    openlineageWebCpu: number;
    openlineageWebMemory: number;
    marquezVersionTag: string;
    loadBalancerCertificateArn: string;
    orgPath: OrganizationUnitPath
};

export const rdsClusterWriterEndpoint = `/df/dataLineage/aurora/rdsClusterWriterEndpoint`;
export const openLineageWebUrlParameter = `/df/dataLineage/openLineageWebUrl`;
export const openLineageApiUrlParameter = `/df/dataLineage/openLineageApiUrl`;


export class DataLineageStack extends Stack {
    constructor(scope: Construct, id: string, props: DataLineageStackProperties) {
        super(scope, id, props);

        const accessLogBucketName = StringParameter.valueForStringParameter(this, accessLogBucketNameParameter);

        const vpcId = StringParameter.valueForStringParameter(this, vpcIdParameter);

        const isolatedSubnetIds = StringListParameter.valueForTypedListParameter(this, isolatedSubnetIdListParameter);

        const privateSubnetIds = StringListParameter.valueForTypedListParameter(this, privateSubnetIdListParameter);

        const publicSubnetIds = StringListParameter.valueForTypedListParameter(this, publicSubnetIdListParameter);

        const userPoolDomainName = StringParameter.valueForStringParameter(this, userPoolDomainParameter);

        const userPoolId = StringParameter.valueForStringParameter(this, userPoolIdParameter);

        const availabilityZones = cdk.Stack.of(this).availabilityZones;

        const accessLogBucket = Bucket.fromBucketName(this, 'AccessLogBucket', accessLogBucketName);

        const vpc = Vpc.fromVpcAttributes(this, 'Vpc', {
            vpcId,
            availabilityZones,
            isolatedSubnetIds: availabilityZones.map((_, index) => Fn.select(index, isolatedSubnetIds)),
            privateSubnetIds: availabilityZones.map((_, index) => Fn.select(index, privateSubnetIds)),
            publicSubnetIds: availabilityZones.map((_, index) => Fn.select(index, publicSubnetIds))
        });

        const aurora = new AuroraDatabase(this, 'OpenLineageDatabase', {
            vpc,
            minClusterCapacity: 1,
            maxClusterCapacity: 1,
            clusterDeletionProtection: true
        });

        new StringParameter(this, 'rdsClusterWriterEndpoint', {
            parameterName: rdsClusterWriterEndpoint,
            stringValue: aurora.rdsClusterWriterEndpoint
        });

        const clusterName = StringParameter.valueForStringParameter(this, clusterNameParameter);

        const openLineage = new OpenLineage(this, 'OpenLineage', {
            accessLogBucket,
            vpc,
            clusterName,
            userPoolDomainName,
            userPoolId,
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
            parameterName: openLineageWebUrlParameter,
            stringValue: openLineage.openLineageWebUrl
        });

        new StringParameter(this, 'openLineageApiUrlParameter', {
            parameterName: openLineageApiUrlParameter,
            stringValue: openLineage.openLineageApiUrl
        });

        new DataLineage(this, 'DataLineage', {
            vpc,
            marquezUrl: openLineage.openLineageApiUrl,
            orgPath: props.orgPath
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
