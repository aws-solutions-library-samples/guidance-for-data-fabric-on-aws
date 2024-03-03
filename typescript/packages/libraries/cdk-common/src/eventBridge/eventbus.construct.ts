import { EventBus } from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import { dfEventBusName, dfSpokeEventBusName } from '../accessManagement/util.js';

export interface EventBusConstructProperties {
}

export class Bus extends Construct {
	public readonly eventBusName: string;
	public readonly eventBus: EventBus

	constructor(scope: Construct, id: string, isSpoke:boolean) {
		super(scope, id);

		const bus = new EventBus(this, 'EventBus', {
			eventBusName: (isSpoke)? dfSpokeEventBusName : dfEventBusName,
		});

		this.eventBus = bus;
	}
}
