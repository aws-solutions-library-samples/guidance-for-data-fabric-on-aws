import { Stack, StackProps } from 'aws-cdk-lib';
import { Network, DfVpcConfig } from './network.construct.js';
import { Cognito } from './cognito.construct.js';
import { Bus } from './eventbus.construct.js';
import { SSM } from './ssm.construct.js';
import type { Construct } from 'constructs';
import { Compute } from './compute.construct.js';
import { S3, bucketArnParameter, bucketNameParameter } from './s3.construct.js';
import * as ssm from 'aws-cdk-lib/aws-ssm';


export type SharedHubStackProperties = StackProps & {
    domain: string;
    deleteBucket?: boolean;
    userVpcConfig?: DfVpcConfig;
    userPoolIdParameter: string;

};


export class SharedHubInfrastructureStack extends Stack {
    constructor(scope: Construct, id: string, props: SharedHubStackProperties) {
        super(scope, id, props);

        // validation
        if (props.domain === undefined) {
            throw new Error('domain is required');
        }

        const network = new Network(this, 'Network', {
            domain: props.domain,
            deleteBucket: props.deleteBucket,
            userVpcConfig: props.userVpcConfig ? props.userVpcConfig : undefined
        });

        new Compute(this, 'Compute', {
            vpc: network.vpc,
            domain: props.domain
        });

        new Cognito(this, 'Cognito', {
            domain: props.domain,
            userPoolIdParameter: props.userPoolIdParameter,
        });

        new Bus(this, 'EventBus', {
            domain: props.domain
        });

        new SSM(this, 'ApiFunctionNameParameters', {
            domain: props.domain
        });

        const s3 = new S3(this, 'S3', {
            deleteBucket: false
        });

        new ssm.StringParameter(this, 'bucketNameParameter', {
            parameterName: bucketNameParameter,
            description: 'shared Bucket Name for SDF',
            stringValue: s3.bucketName
        });

        new ssm.StringParameter(this, 'bucketArnParameter', {
            parameterName: bucketArnParameter,
            description: 'shared Bucket Arn for SDF',
            stringValue: s3.bucketArn
        });
    }
}
