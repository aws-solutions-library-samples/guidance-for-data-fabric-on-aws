import { Stack, StackProps } from 'aws-cdk-lib';
import { EventBusSpoke } from './eventBus.construct.js';
import type { Construct } from 'constructs';
import { S3Spoke, bucketArnParameter, bucketNameParameter } from './s3.construct.js';
import * as ssm from 'aws-cdk-lib/aws-ssm';


export type SharedSpokeStackProperties = StackProps & {
    deleteBucket?: boolean;
    hubAccountId: string;
};


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

        new EventBusSpoke(this, 'SpokeEventBus', {
            hubAccountId: props.hubAccountId
        }
        )




    }
}
