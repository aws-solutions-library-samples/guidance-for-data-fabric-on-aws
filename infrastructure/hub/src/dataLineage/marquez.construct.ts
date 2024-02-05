// import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import { StringParameter } from 'aws-cdk-lib/aws-ssm';
// import {
// 	dataLineageApiFunctionNameParameter,
//     dataLineageOpenLineageUrlParameter,
//     dataLineageOpenLineageAPIParameter,
//     dataLineageMarquezUrlParameter
// } from '../shared/ssm.construct.js';



export interface MarquezConstructProperties {
	domain: string;
}

export class Marquez extends Construct {

	constructor(scope: Construct, id: string, props: MarquezConstructProperties) {
		super(scope, id);

		const namePrefix = `sdf-${props.domain}`;
        console.log(namePrefix);
        // TODO Data Lineage service infrastructure will go here


    }
}