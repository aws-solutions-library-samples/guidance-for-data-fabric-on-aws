import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Cluster } from "aws-cdk-lib/aws-ecs";
import type { IVpc } from "aws-cdk-lib/aws-ec2";

export interface ComputeConstructProperties {
    vpc: IVpc;
}

export const clusterNameParameter = `/df/shared/clusterName`;

export class Compute extends Construct {
    constructor(scope: Construct, id: string, props: ComputeConstructProperties) {
        super(scope, id);

        const namePrefix = `df`;

        const computeCluster = new Cluster(this, 'DFComputeCluster', {
            vpc: props.vpc,
            clusterName: `${namePrefix}-cluster`,
            containerInsights: true
        });

        new ssm.StringParameter(this, 'clusterNameParameter', {
            parameterName: clusterNameParameter,
            stringValue: computeCluster.clusterName,
        });
    }
}
