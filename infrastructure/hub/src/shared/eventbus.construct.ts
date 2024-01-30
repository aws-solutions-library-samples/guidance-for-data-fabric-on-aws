import { EventBus } from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib';

export interface EventBusConstructProperties {
	environment: string;
}

export const eventBusNameParameter = (environment: string) => `/sdf/${environment}/shared/eventBusName`;
export const eventBusArnParameter = (environment: string) => `/sdf/${environment}/shared/eventBusArn`;

export class Bus extends Construct {
	public readonly eventBusName: string;

	constructor(scope: Construct, id: string, props: EventBusConstructProperties) {
		super(scope, id);

		const accountId = cdk.Stack.of(this).account;
		const namePrefix = `sdf-${props.environment}`;

		const bus = new EventBus(this, 'bus', {
			eventBusName: `${namePrefix}-${accountId}`,
		});

		this.eventBusName = bus.eventBusName;

		new ssm.StringParameter(this, 'eventBusNameParameter', {
			parameterName: eventBusNameParameter(props.environment),
			stringValue: bus.eventBusName,
		});
		new ssm.StringParameter(this, 'eventBusArnParameter', {
			parameterName: eventBusArnParameter(props.environment),
			stringValue: bus.eventBusArn,
		});
	}
}
