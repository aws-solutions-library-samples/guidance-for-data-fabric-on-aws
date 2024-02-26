import { Stack, StackProps } from 'aws-cdk-lib';
import { Network, DfVpcConfig } from './network.construct.js';
import { Cognito } from './cognito.construct.js';
import { Bus, userPoolIdParameter } from '@df/cdk-common';
import { SSM } from './ssm.construct.js';
import type { Construct } from 'constructs';
import { Compute } from './compute.construct.js';


export type SharedHubStackProperties = StackProps & {
	deleteBucket?: boolean;
	userVpcConfig?: DfVpcConfig;
};


export class SharedHubInfrastructureStack extends Stack {
	vpcId: string;
	constructor(scope: Construct, id: string, props: SharedHubStackProperties) {
		super(scope, id, props);

		const network = new Network(this, 'Network', {
			deleteBucket: props.deleteBucket,
			userVpcConfig: props.userVpcConfig ? props.userVpcConfig : undefined
		});

        new Compute(this, 'Compute', {
            vpc: network.vpc,
        });


		new Cognito(this, 'Cognito',{
			userPoolIdParameter,
		});

        new Bus(this, 'EventBus');

        new SSM(this, 'ApiFunctionNameParameters');

	}
}
