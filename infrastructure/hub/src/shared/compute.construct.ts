import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Cluster } from "aws-cdk-lib/aws-ecs";
import type { IVpc } from "aws-cdk-lib/aws-ec2";

export interface ComputeConstructProperties {
    domain: string;
    vpc: IVpc;
}

export const clusterNameParameter = (domain: string) => `/sdf/${domain}/shared/clusterName`;

export class Compute extends Construct {
    constructor(scope: Construct, id: string, props: ComputeConstructProperties) {
        super(scope, id);

        const namePrefix = `sdf-${props.domain}`;

        const computeCluster = new Cluster(this, 'SDFComputeCluster', {
            vpc: props.vpc,
            clusterName: `${namePrefix}-cluster`,
            containerInsights: true
        });

        new ssm.StringParameter(this, 'clusterNameParameter', {
            parameterName: clusterNameParameter(props.domain),
            stringValue: computeCluster.clusterName,
        });
    }
}
