import { Stack, StackProps } from 'aws-cdk-lib';
import { Network, SdfVpcConfig } from './network.construct.js';
import { Cognito } from './cognito.construct.js';
import { Bus } from './eventbus.construct.js';
import type { Construct } from 'constructs';




export type SharedHubStackProperties = StackProps & {
	environment: string;
	deleteBucket?: boolean;
	userVpcConfig?: SdfVpcConfig;
	userPoolIdParameter: string;

};


export class SharedHubInfrastructureStack extends Stack {
	constructor(scope: Construct, id: string, props: SharedHubStackProperties) {
		super(scope, id, props);

		// validation
		if (props.environment === undefined) {
			throw new Error('environment is required');
		}

		new Network(this, 'Network', {
			environment: props.environment,
			deleteBucket: props.deleteBucket,
			userVpcConfig: props.userVpcConfig ? props.userVpcConfig : undefined
		});

		new Cognito(this, 'Cognito',{
			environment: props.environment,
			userPoolIdParameter: props.userPoolIdParameter,
		});

		new Bus(this, 'EventBus',{
			environment: props.environment
		})


	}
}
