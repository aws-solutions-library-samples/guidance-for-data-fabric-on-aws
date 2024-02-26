import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import type { IVpc } from "aws-cdk-lib/aws-ec2";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { NagSuppressions } from "cdk-nag";

export interface DfVpcConfig {
  vpcId: string;
  publicSubnetIds: string[];
  privateSubnetIds: string[];
  isolatedSubnetIds: string[];
}

export interface NetworkConstructProperties {
  deleteBucket?: boolean;
  userVpcConfig?: DfVpcConfig;
}

export const accessLogBucketNameParameter = `/df/shared/s3/accessLogBucketName`;
export const vpcIdParameter = `/df/shared/network/vpcId`;

export const publicSubnetIdsParameter = `/df/shared/network/publicSubnets`;
export const publicSubnetIdListParameter = `/df/shared/network/publicSubnetList`;

export const privateSubnetIdsParameter = `/df/shared/network/privateSubnets`;
export const privateSubnetIdListParameter = `/df/shared/network/privateSubnetList`;

export const isolatedSubnetIdsParameter = `/df/shared/network/isolatedSubnets`;
export const isolatedSubnetIdListParameter = `/df/shared/network/isolatedSubnetList`;

export class Network extends Construct {
  public vpc: IVpc;
  public dfVpcConfig: DfVpcConfig;

  constructor(scope: Construct, id: string, props: NetworkConstructProperties) {
    super(scope, id);

    const accessLogBucketName = `df-access-logs-${
      cdk.Stack.of(this).account
    }-${cdk.Stack.of(this).region}`;

    const accessLogBucket = new s3.Bucket(this, "s3AccessLog", {
      bucketName: accessLogBucketName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      intelligentTieringConfigurations: [
        {
          name: "archive",
          archiveAccessTierTime: Duration.days(90),
          deepArchiveAccessTierTime: Duration.days(180),
        },
      ],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      autoDeleteObjects: props.deleteBucket,
      versioned: !props.deleteBucket,
      removalPolicy: props.deleteBucket
        ? RemovalPolicy.DESTROY
        : RemovalPolicy.RETAIN,
    });

    new ssm.StringParameter(this, "accessLogBucketNameParameter", {
      parameterName: accessLogBucketNameParameter,
      stringValue: accessLogBucket.bucketName,
    });

    NagSuppressions.addResourceSuppressions(accessLogBucket, [
      {
        id: "AwsSolutions-S1",
        reason:
          "This is only the access log not the log that contains the vpc traffic information.",
      },
    ]);

    if (props.userVpcConfig === undefined) {
      const vpc = new ec2.Vpc(this, "Vpc", {
        subnetConfiguration: [
          {
            name: "isolated-subnet",
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
            cidrMask: 24,
          },
          {
            name: "private-subnet",
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            cidrMask: 24,
          },
          {
            name: "public-subnet",
            subnetType: ec2.SubnetType.PUBLIC,
            cidrMask: 24,
          },
        ],
      });

      const bucketName = `df-vpc-logs-${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }`;

      // Create log bucket.
      const s3LogBucket = new s3.Bucket(this, "s3LogBucket", {
        bucketName,
        encryption: s3.BucketEncryption.S3_MANAGED,
        serverAccessLogsBucket: accessLogBucket,
        serverAccessLogsPrefix: `vpc-logs/`,
        intelligentTieringConfigurations: [
          {
            name: "archive",
            archiveAccessTierTime: Duration.days(90),
            deepArchiveAccessTierTime: Duration.days(180),
          },
        ],
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        autoDeleteObjects: props.deleteBucket,
        removalPolicy: props.deleteBucket
          ? RemovalPolicy.DESTROY
          : RemovalPolicy.RETAIN,
        versioned: !props.deleteBucket,
      });

      const flowLogName = `df-flowlogs`;

      // Add flow logs.
      const vpcFlowLogRole = new iam.Role(this, "vpcFlowLogRole", {
        assumedBy: new iam.ServicePrincipal("vpc-flow-logs.amazonaws.com"),
      });

      s3LogBucket.grantWrite(vpcFlowLogRole, `${flowLogName}/*`);

      NagSuppressions.addResourceSuppressions(
        vpcFlowLogRole,
        [
          {
            id: "AwsSolutions-IAM5",
            reason: "The role an only modify to a specific flowlog.",
            appliesTo: [
              "Action::s3:Abort*",
              "Action::s3:DeleteObject*",
              `Resource::<Networks3LogBucketD8B712E9.Arn>/df-flowlogs/*`,
            ],
          },
        ],
        true
      );

      // Create flow logs to S3.
      new ec2.FlowLog(this, "sharedVpcLowLogs", {
        destination: ec2.FlowLogDestination.toS3(
          s3LogBucket,
          `${flowLogName}/`
        ),
        trafficType: ec2.FlowLogTrafficType.ALL,
        flowLogName: flowLogName,
        resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
      });

      this.vpc = vpc;

      new ssm.StringParameter(this, "vpcIdParameter", {
        parameterName: vpcIdParameter,
        stringValue: this.vpc.vpcId,
      });

      new ssm.StringParameter(this, "publicSubnetIdsParameter", {
        parameterName: publicSubnetIdsParameter,
        description: "Public subnet IDs used for DF.",
        stringValue: this.vpc
          .selectSubnets({ subnetGroupName: "public-subnet" })
          .subnets.map((o) => o.subnetId)
          .join(","),
      });

      new ssm.StringListParameter(this, "publicSubnetIdListParameter", {
        parameterName: publicSubnetIdListParameter,
        description: "Public subnet IDs used for DF.",
        stringListValue: this.vpc
          .selectSubnets({ subnetGroupName: "public-subnet" })
          .subnets.map((o) => o.subnetId),
      });

      new ssm.StringParameter(this, "privateSubnetIdsParameter", {
        parameterName: privateSubnetIdsParameter,
        description: "Private subnet IDs used for DF.",
        stringValue: this.vpc
          .selectSubnets({ subnetGroupName: "private-subnet" })
          .subnets.map((o) => o.subnetId)
          .join(","),
      });

      new ssm.StringListParameter(this, "privateSubnetIdListParameter", {
        parameterName: privateSubnetIdListParameter,
        description: "Private subnet IDs used for DF.",
        stringListValue: this.vpc
          .selectSubnets({ subnetGroupName: "private-subnet" })
          .subnets.map((o) => o.subnetId),
      });

      new ssm.StringParameter(this, "isolatedSubnetIdsParameter", {
        parameterName: isolatedSubnetIdsParameter,
        description: "Isolated subnet IDs used for DF.",
        stringValue: this.vpc
          .selectSubnets({ subnetGroupName: "isolated-subnet" })
          .subnets.map((o) => o.subnetId)
          .join(","),
      });

      new ssm.StringListParameter(this, "isolatedSubnetIdListParameter", {
        parameterName: isolatedSubnetIdListParameter,
        description: "Isolated subnet IDs used for DF.",
        stringListValue: this.vpc
          .selectSubnets({ subnetGroupName: "isolated-subnet" })
          .subnets.map((o) => o.subnetId),
      });

      this.dfVpcConfig = {
        vpcId: this.vpc.vpcId,
        publicSubnetIds: this.vpc
          .selectSubnets({ subnetGroupName: "public-subnet" })
          .subnets.map((o) => o.subnetId),
        privateSubnetIds: this.vpc
          .selectSubnets({ subnetGroupName: "private-subnet" })
          .subnets.map((o) => o.subnetId),
        isolatedSubnetIds: this.vpc
          .selectSubnets({ subnetGroupName: "isolated-subnet" })
          .subnets.map((o) => o.subnetId),
      };
    } else {
      // user provided a VPC, use that
      this.vpc = ec2.Vpc.fromLookup(this, "vpc", {
        vpcId: props.userVpcConfig?.vpcId,
      });

      new ssm.StringParameter(this, "vpcIdParameter", {
        parameterName: vpcIdParameter,
        stringValue: this.vpc.vpcId,
      });

      new ssm.StringParameter(this, "isolatedSubnetIdsParameter", {
        parameterName: isolatedSubnetIdsParameter,
        description: "Isolated subnet IDs used for DF.",
        stringValue: props.userVpcConfig.isolatedSubnetIds.join(","),
      });

      new ssm.StringListParameter(this, "isolatedSubnetIdListParameter", {
        parameterName: isolatedSubnetIdListParameter,
        description: "Isolated subnet IDs used for DF.",
        stringListValue: props.userVpcConfig.isolatedSubnetIds,
      });

      this.dfVpcConfig = {
        vpcId: this.vpc.vpcId,
        publicSubnetIds: props.userVpcConfig.publicSubnetIds,
        privateSubnetIds: props.userVpcConfig.privateSubnetIds,
        isolatedSubnetIds: props.userVpcConfig.isolatedSubnetIds,
      };
    }
  }
}
