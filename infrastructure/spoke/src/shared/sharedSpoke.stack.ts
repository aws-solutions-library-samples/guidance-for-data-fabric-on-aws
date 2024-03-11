import { Stack, StackProps } from 'aws-cdk-lib';
import { EventBusSpoke } from './eventBus.construct.js';
import type { Construct } from 'constructs';
import { S3Spoke, bucketArnParameter, bucketNameParameter } from './s3.construct.js';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { OrganizationUnitPath } from '@df/cdk-common';
import { NagSuppressions } from 'cdk-nag';
import { GlueSpoke } from './glue.construct.js';


export type SharedSpokeStackProperties = StackProps & {
    deleteBucket?: boolean;
    hubAccountId: string;
    orgPath: OrganizationUnitPath;
};

export const JobBucketAccessPolicyNameParameter = `/df/spoke/shared/databrew/jobBucketPolicyName`;
export const GlueDatabaseNameParameter = `/df/spoke/shared/glue/databaseName`;

export class SharedSpokeInfrastructureStack extends Stack {
    constructor(scope: Construct, id: string, props: SharedSpokeStackProperties) {
        super(scope, id, props);

        const region = Stack.of(this).region;
        const accountId = Stack.of(this).account;

        const s3 = new S3Spoke(this, 'S3', {
            deleteBucket: false
        });

        new ssm.StringParameter(this, 'bucketNameParameter', {
            parameterName: bucketNameParameter,
            description: 'shared Bucket Name for DF Spoke',
            stringValue: s3.bucketName
        });

        new ssm.StringParameter(this, 'bucketArnParameter', {
            parameterName: bucketArnParameter,
            description: 'shared Bucket Arn for DF',
            stringValue: s3.bucketArn
        });

        // DF Job bucket access policy, this policy can be used by end users to grant access to databrew to put the result in our bucket 
        const jobBucketAccessPolicy = new ManagedPolicy(this, 'JobBucketAccessPolicy', {
            managedPolicyName: `df-spoke-${region}-databrew-access-policy`,
            statements: [
                new PolicyStatement({
                    sid: `databrewJobBucketAccess`,
                    actions: [
                        's3:GetObject',
                        's3:PutObject',
                        's3:ListBucket',
                        's3:DeleteObject',
                        's3:PutObjectAcl'
                    ],
                    resources: [
                        `${s3.bucketArn}/*`,
                        `${s3.bucketArn}`
                    ],
                    conditions: {
                        StringEquals: {
                            's3:x-amz-acl': 'bucket-owner-full-control'
                        }
                    }
                }),
                new PolicyStatement({
                    sid: `glueAccess`,
                    actions: [
                        'logs:PutLogEvents'
                    ],
                    resources: [
                        `arn:aws:logs:${region}:${accountId}:log-group:/aws-glue/*`
                    ]
                })
            ]
        });

        new ssm.StringParameter(this, 'JobBucketAccessPolicyNameParameter', {
            parameterName: JobBucketAccessPolicyNameParameter,
            description: 'shared Iam Policy name for accessing the job bucket via databrew',
            stringValue: jobBucketAccessPolicy.managedPolicyName
        });

        new EventBusSpoke(this, 'SpokeEventBus', {
            hubAccountId: props.hubAccountId,
            orgPath: props.orgPath
        }
        );


        const glueDatabase = new GlueSpoke(this, 'GlueDatabase',{
            accountId,
            region
        });

        new ssm.StringParameter(this, 'GlueDatabaseNameParameter', {
            parameterName: GlueDatabaseNameParameter,
            description: 'shared glue database name used for creation of all the glue tables by SF',
            stringValue: glueDatabase.glueDatabaseName
        });

        NagSuppressions.addResourceSuppressions([jobBucketAccessPolicy],
            [

                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: [
                        'Resource::<S3dfBucket5A13E120.Arn>/*',
                        `Resource::arn:aws:logs:${region}:${accountId}:log-group:/aws-glue/*`
                    ],
                    reason: 'This policy is required for the policy that will grant glue access to publish job results.'

                }
            ],
            true);

    }
}
