import { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface SSMConstructProperties {
	domain: string;
}
// Access Control Parameters
export const accessControlApiFunctionNameParameter = (domain: string) => `/sdf/${domain}/accessControl/apiFunctionName`;

// Data Lineage Parameters
export const dataLineageApiFunctionNameParameter = (domain: string) => `/sdf/${domain}/dataLineage/apiFunctionName`;



// Data Quality Parameters
export const dataQualityApiFunctionNameParameter = (domain: string) => `/sdf/${domain}/dataQuality/apiFunctionName`;


export class SSM extends Construct {

	constructor(scope: Construct, id: string, props: SSMConstructProperties) {
		super(scope, id);

		const namePrefix = `sdf-${props.domain}`;
		/*
			* Access Control parameters
		*/
		new StringParameter(this, 'accessControlApiFunctionNameParameter', {
			parameterName: accessControlApiFunctionNameParameter(props.domain),
			stringValue: `${namePrefix}-accessControlApi`,
		});

		/*
			* Data Lineage parameters
		*/

		new StringParameter(this, 'dataLineageApiFunctionNameParameter', {
			parameterName: dataLineageApiFunctionNameParameter(props.domain),
			stringValue: `${namePrefix}-dataLineageApi`,
		});

		/*
			* Data Quality parameters
		*/
		new StringParameter(this, 'dataQualityApiFunctionNameParameter', {
			parameterName: dataQualityApiFunctionNameParameter(props.domain),
			stringValue: `${namePrefix}-dataQualityApi`,
		});

	}
}
