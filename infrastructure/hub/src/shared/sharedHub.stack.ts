import { Stack, StackProps } from 'aws-cdk-lib';
import { Network, SdfVpcConfig } from './network.construct.js';
import { Cognito } from './cognito.construct.js';
import { Bus } from './eventbus.construct.js';
import { SSM } from './ssm.construct.js';
import type { Construct } from 'constructs';
import { Compute } from './compute.construct.js';


export type SharedHubStackProperties = StackProps & {
    domain: string;
    deleteBucket?: boolean;
    userVpcConfig?: SdfVpcConfig;
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


    }
}
