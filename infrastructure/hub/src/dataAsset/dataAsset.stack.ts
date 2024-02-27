import { Stack, StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';

import { DataAsset } from "./dataAsset.construct.js";
import { dfEventBusName, userPoolIdParameter } from '@df/cdk-common';
import { bucketNameParameter } from '../shared/s3.construct.js';

export type DataAssetStackProperties = StackProps & {
    moduleName:string;
};


export const dataAssetApiUrlParameter = `/df/dataAsset/apiUrl`;
export const dataAssetFunctionNameParameter = `/df/dataAsset/functionName`;
export const dataAssetTableNameParameter = `/df/dataAsset/tableName`;
export const dataAssetTableArnParameter = `/df/dataAsset/tableArn`;
export const dataAssetStateMachineArnParameter = `/df/dataAsset/stateMachineArn`;

export class DataAssetStack extends Stack {
    constructor(scope: Construct, id: string, props: DataAssetStackProperties) {
        super(scope, id, props);

        const userPoolId = StringParameter.valueForStringParameter(this, userPoolIdParameter);
        const bucketName = StringParameter.valueForStringParameter(this, bucketNameParameter );
        



        const dataAsset = new DataAsset(this, 'DataAsset', {
            moduleName: props.moduleName,
            eventBusName: dfEventBusName,
            bucketName,
            cognitoUserPoolId: userPoolId
        });

        new StringParameter(this, 'dataAssetFunctionNameParameter', {
            parameterName: dataAssetFunctionNameParameter,
            stringValue: dataAsset.functionName
        });

        new StringParameter(this, 'dataAssetApiUrlParameter', {
            parameterName: dataAssetApiUrlParameter,
            stringValue: dataAsset.apiUrl
        });

        new StringParameter(this, 'dataAssetTableNameParameter', {
            parameterName: dataAssetTableNameParameter,
            stringValue: dataAsset.tableName
        });

        new StringParameter(this, 'dataAssetTableArnParameter', {
            parameterName: dataAssetTableArnParameter,
            stringValue: dataAsset.tableArn
        });

        new StringParameter(this, 'dataAssetStateMachineArnParameter', {
            parameterName: dataAssetStateMachineArnParameter,
            stringValue: dataAsset.stateMachineArn
        });

        NagSuppressions.addResourceSuppressionsByPath(this,'/DataAssetStack/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource',
        [
            {
                id: 'AwsSolutions-IAM4',
                appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
                reason: 'This policy is the one generated by CDK.'

            }, 
            {
                id: 'AwsSolutions-IAM5',
                appliesTo: ['Resource::*'
                ],
                reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments actions.'

            }
        ],
        true);

        NagSuppressions.addResourceSuppressionsByPath(this,'/DataAssetStack/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource',
        [
            {
                id: 'AwsSolutions-IAM4',
                appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
                reason: 'This policy is the one generated by CDK.'

            }
        ],
        true);
    }


}
