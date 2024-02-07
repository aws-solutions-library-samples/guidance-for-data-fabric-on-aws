import { Stack, StackProps } from 'aws-cdk-lib';
import { DataLineage } from './dataLineage.construct.js';
import type { Construct } from 'constructs';




export type DataLineageStackProperties = StackProps & {
	domain: string;
	deleteBucket?: boolean;
	userVpcConfig?: SdfVpcConfig;
	userPoolIdParameter: string;

};


export class DataLineageInfrastructureStack extends Stack {
	constructor(scope: Construct, id: string, props: DataLineageStackProperties) {
		super(scope, id, props);

		// validation
		if (props.domain === undefined) {
			throw new Error('domain is required');
		}


		new DataLineage(this, 'EventBus',{
			eventBusName: props.domain
		})


	}
}
