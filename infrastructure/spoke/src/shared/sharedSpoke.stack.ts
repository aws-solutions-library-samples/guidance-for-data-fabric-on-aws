import { Stack, StackProps } from 'aws-cdk-lib';
import { EventBusSpoke } from './eventBus.construct.js';
import type { Construct } from 'constructs';
import { S3Spoke, bucketArnParameter, bucketNameParameter } from './s3.construct.js';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';


export type SharedSpokeStackProperties = StackProps & {
    deleteBucket?: boolean;
    hubAccountId: string;
};

export const JobBucketAccessPolicyNameParameter = `/df/spoke/shared/databrew/jobBucket-policy-name`;

export class SharedSpokeInfrastructureStack extends Stack {
    constructor(scope: Construct, id: string, props: SharedSpokeStackProperties) {
        super(scope, id, props);

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

        // DF Job bucket access policy

        const jobBucketAccessPolicy = new ManagedPolicy(this, 'JobBucketAccessPolicy', {
            managedPolicyName: `df-databrew-access-policy`,
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
                })
            ]
        });

        new ssm.StringParameter(this, 'JobBucketAccessPolicyNameParameter', {
            parameterName: JobBucketAccessPolicyNameParameter,
            description: 'shared Iam Policy name for accessing the job bucket via databrew',
            stringValue: jobBucketAccessPolicy.managedPolicyName
        });

        new EventBusSpoke(this, 'SpokeEventBus', {
            hubAccountId: props.hubAccountId
        }
        );

        NagSuppressions.addResourceSuppressions([jobBucketAccessPolicy],
            [

                {
                    id: 'AwsSolutions-IAM5',
                    appliesTo: ['Resource::<S3dfBucket5A13E120.Arn>/*'],
                    reason: 'This policy is required for the policy that will grant glue access to publish job results.'

                }
            ],
            true);

    }
}
