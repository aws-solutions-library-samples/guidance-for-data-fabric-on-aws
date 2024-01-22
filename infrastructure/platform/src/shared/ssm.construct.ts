import { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface SSMConstructProperties {
	environment: string;
}

export const accessControlApiFunctionNameParameter = (environment: string) => `/sdf/${environment}/accessControl/apiFunctionName`;
export const dataLineageApiFunctionNameParameter = (environment: string) => `/sdf/${environment}/dataLineage/apiFunctionName`;
export const dataQualityApiFunctionNameParameter = (environment: string) => `/sdf/${environment}/dataQuality/apiFunctionName`;


export class SSM extends Construct {

	constructor(scope: Construct, id: string, props: SSMConstructProperties) {
		super(scope, id);

		const namePrefix = `sdf-${props.environment}`;

		new StringParameter(this, 'accessControlApiFunctionNameParameter', {
			parameterName: accessControlApiFunctionNameParameter(props.environment),
			stringValue: `${namePrefix}-accessControlApi`,
		});

		new StringParameter(this, 'dataLineageApiFunctionNameParameter', {
			parameterName: dataLineageApiFunctionNameParameter(props.environment),
			stringValue: `${namePrefix}-dtaLineageApi`,
		});

		new StringParameter(this, 'dataQualityApiFunctionNameParameter', {
			parameterName: dataQualityApiFunctionNameParameter(props.environment),
			stringValue: `${namePrefix}-dataQualityApi`,
		});

	}
}
