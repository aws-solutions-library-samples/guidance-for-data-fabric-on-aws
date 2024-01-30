import { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface SSMConstructProperties {
	domain: string;
}

export const accessControlApiFunctionNameParameter = (domain: string) => `/sdf/${domain}/accessControl/apiFunctionName`;
export const dataLineageApiFunctionNameParameter = (domain: string) => `/sdf/${domain}/dataLineage/apiFunctionName`;
export const dataQualityApiFunctionNameParameter = (domain: string) => `/sdf/${domain}/dataQuality/apiFunctionName`;


export class SSM extends Construct {

	constructor(scope: Construct, id: string, props: SSMConstructProperties) {
		super(scope, id);

		const namePrefix = `sdf-${props.domain}`;

		new StringParameter(this, 'accessControlApiFunctionNameParameter', {
			parameterName: accessControlApiFunctionNameParameter(props.domain),
			stringValue: `${namePrefix}-accessControlApi`,
		});

		new StringParameter(this, 'dataLineageApiFunctionNameParameter', {
			parameterName: dataLineageApiFunctionNameParameter(props.domain),
			stringValue: `${namePrefix}-dtaLineageApi`,
		});

		new StringParameter(this, 'dataQualityApiFunctionNameParameter', {
			parameterName: dataQualityApiFunctionNameParameter(props.domain),
			stringValue: `${namePrefix}-dataQualityApi`,
		});

	}
}
