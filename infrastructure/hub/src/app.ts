#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { SharedHubInfrastructureStack } from './shared/sharedHub.stack.js';
import { SsoCustomStack } from './shared/ssoCustom.stack.js';
import { CognitoCustomStack } from './shared/cognitoCustom.stack.js';
import { DataLineageStack } from './dataLineage/dataLineage.stack.js';
import { AwsSolutionsChecks } from 'cdk-nag';
import { getOrThrow } from './shared/stack.utils.js';
import { tryGetBooleanContext } from '@df/cdk-common';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import { userPoolIdParameter } from "./shared/cognito.construct.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new cdk.App();

// mandatory requirements
const domain = getOrThrow(app, 'domain');

const deleteBucket = tryGetBooleanContext(app, 'deleteBucket', false);

// user VPC config
const useExistingVpc = tryGetBooleanContext(app, 'useExistingVpc', false);

// Optional requirements to specify the cognito SAML provider
const ssoInstanceArn = app.node.tryGetContext('ssoInstanceArn');
const ssoRegion = app.node.tryGetContext('ssoRegion');
const adminEmail = app.node.tryGetContext('adminEmail');
const samlMetaDataUrl = app.node.tryGetContext('samlMetaDataUrl');
const callbackUrls = app.node.tryGetContext('callbackUrls');


let userVpcId;
let userIsolatedSubnetIds, userPrivateSubnetIds, userPublicSubnetIds;
if (useExistingVpc) {
    userVpcId = getOrThrow(app, 'existingVpcId');
    userPublicSubnetIds = getOrThrow(app, 'existingPublicSubnetIds').toString().split(',');
    userPrivateSubnetIds = getOrThrow(app, 'existingPrivateSubnetIds').toString().split(',');
    userIsolatedSubnetIds = getOrThrow(app, 'existingIsolatedSubnetIds').toString().split(',');
}

// tags the entire platform with cost allocation tags
cdk.Tags.of(app).add('df:domain', domain);

Aspects.of(app).add(new AwsSolutionsChecks({verbose: true}));

const stackNamePrefix = `df-shared-${domain}`;

const stackName = (suffix: string) => `${stackNamePrefix}-${suffix}`;
const stackDescription = (moduleName: string) => `Infrastructure for ${moduleName} module`;

const deployPlatform = (callerEnvironment?: { accountId?: string, region?: string }): void => {


    const sharedStack = new SharedHubInfrastructureStack(app, 'SharedHubStack', {
        stackName: stackName('hub'),
        description: stackDescription('SharedHub'),
        domain,
        userVpcConfig: useExistingVpc ? {
            vpcId: userVpcId,
            isolatedSubnetIds: userIsolatedSubnetIds,
            privateSubnetIds: userPrivateSubnetIds,
            publicSubnetIds: userPublicSubnetIds
        } : undefined,
        deleteBucket,
        userPoolIdParameter: userPoolIdParameter(domain),
        env: {
            // The DF_REGION domain variable
            region: process.env?.['DF_REGION'] || callerEnvironment?.region,
            account: callerEnvironment?.accountId
        }
    });

    if (samlMetaDataUrl && callbackUrls) {
        const cognitoCustomStack = new CognitoCustomStack(app, 'CognitoCustomStack', {
            stackName: stackName('CognitoCustomStack'),
            description: stackDescription('CognitoCustomStack'),
            domain,
            ssoRegion,
            samlMetaDataUrl,
            userPoolIdParameter: userPoolIdParameter(domain),
            callbackUrls
        });
        cognitoCustomStack.node.addDependency(sharedStack);

        // Optional requirement for DataLineage
        const openlineageApiMemory = (app.node.tryGetContext('openlineageApiMemory') as number) ?? 8192;
        const openlineageApiCpu = (app.node.tryGetContext('openlineageApiCpu') as number) ?? 2048;
        const openlineageWebMemory = (app.node.tryGetContext('openlineageApiMemory') as number) ?? 2048;
        const openlineageWebCpu = (app.node.tryGetContext('openlineageApiCpu') as number) ?? 512;
        const marquezVersionTag = app.node.tryGetContext('marquezVersionTag') ?? '0.43.1';
        const loadBalancerCertificateArn = getOrThrow(app, 'loadBalancerCertificateArn');

        const dataLineage = new DataLineageStack(app, 'DataLineageStack', {
            stackName: stackName('datalineage'),
            description: stackDescription('DataLineage'),
            domain,
            openlineageApiCpu,
            openlineageApiMemory,
            openlineageWebCpu,
            openlineageWebMemory,
            marquezVersionTag,
            loadBalancerCertificateArn
        });
        dataLineage.node.addDependency(sharedStack);
    }

    if (ssoInstanceArn && adminEmail) {
        const ssoCustomStack = new SsoCustomStack(app, 'SsoCustomStack', {
            stackName: stackName('SsoCustomStack'),
            description: stackDescription('SsoCustomStack'),
            domain,
            ssoInstanceArn,
            ssoRegion,
            adminEmail
        });
        ssoCustomStack.node.addDependency(sharedStack);
    }


};

const getCallerEnvironment = (): { accountId?: string, region?: string } | undefined => {
    if (!fs.existsSync(`${__dirname}/predeploy.json`)) {
        throw new Error('Pre deployment file does not exist\n' +
            'Make sure you run the cdk using npm script which will run the predeploy script automatically\n' +
            'EXAMPLE\n' +
            '$ npm run cdk deploy -- -e sampleEnvironment');
    }
    const {callerEnvironment} = JSON.parse(fs.readFileSync(`${__dirname}/predeploy.json`, 'utf-8'));
    return callerEnvironment;
};

deployPlatform(getCallerEnvironment());




