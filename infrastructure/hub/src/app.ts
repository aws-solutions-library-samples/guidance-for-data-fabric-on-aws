#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { SharedPlatformInfrastructureStack } from './shared/sharedPlatform.stack.js';
import { SsoCustomStack } from './shared/ssoCustom.stack.js';
import { CognitoCustomStack } from './shared/cognitoCustom.stack.js';
import { AwsSolutionsChecks } from 'cdk-nag';
import { getOrThrow } from './shared/stack.utils.js';
import { Aspects } from 'aws-cdk-lib';
import { tryGetBooleanContext } from '@sdf/cdk-common';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new cdk.App();

// mandatory requirements
const environment = getOrThrow(app, 'environment');

const deleteBucket = tryGetBooleanContext(app, 'deleteBucket', false);

// user VPC config
const useExistingVpc = tryGetBooleanContext(app, 'useExistingVpc', false);
// Optional requirements to specify the cognito SAML provider
const ssoInstanceArn = app.node.tryGetContext('ssoInstanceArn');
const ssoRegion = app.node.tryGetContext('ssoRegion');
const adminEmail = app.node.tryGetContext('adminEmail');
const samlMetaDataUrl = app.node.tryGetContext('samlMetaDataUrl');
export const userPoolIdParameter = (environment: string) => `/sdf/${environment}/shared/cognito/userPoolId`;

let userVpcId;
let userIsolatedSubnetIds;
let userPrivateSubnetIds;
if (useExistingVpc) {
	userVpcId = getOrThrow(app, 'existingVpcId');
	userIsolatedSubnetIds = getOrThrow(app, 'existingIsolatedSubnetIds').toString().split(',');
	userPrivateSubnetIds = getOrThrow(app, 'existingPrivateSubnetIds').toString().split(',');
}

// tags the entire platform with cost allocation tags
cdk.Tags.of(app).add('sdf:environment', environment);

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

const stackNamePrefix = `sdf-shared-${environment}`;

const stackName = (suffix: string) => `${stackNamePrefix}-${suffix}`;
const platformStackDescription = (moduleName: string) => `Infrastructure for ${moduleName} module`;

const deployPlatform = (callerEnvironment?: { accountId?: string, region?: string }): void => {


	const platformStack = new SharedPlatformInfrastructureStack(app, 'SharedPlatformStack', {
		stackName: stackName('platform'),
		description: platformStackDescription('SharedPlatform'),
		environment,
		userVpcConfig: useExistingVpc ? { vpcId: userVpcId, isolatedSubnetIds: userIsolatedSubnetIds, privateSubnetIds: userPrivateSubnetIds, publicSubnetIds: [] } : undefined,
		deleteBucket,
		userPoolIdParameter: userPoolIdParameter(environment),
		env: {
			// The SDF_REGION environment variable
			region: process.env?.['SDF_REGION'] || callerEnvironment?.region,
			account: callerEnvironment?.accountId
		}
	});

	if (samlMetaDataUrl) {
		const cognitoCustomStack = new CognitoCustomStack(app, 'CognitoCustomStack', {
			stackName: stackName('CognitoCustomStack'),
			description: platformStackDescription('CognitoCustomStack'),
			environment,
			ssoRegion,
			samlMetaDataUrl,
			userPoolIdParameter: userPoolIdParameter(environment),
		});
		cognitoCustomStack.node.addDependency(platformStack);
	}

	if (ssoInstanceArn && adminEmail) {
		const ssoCustomStack = new SsoCustomStack(app, 'SsoCustomStack', {
			stackName: stackName('SsoCustomStack'),
			description: platformStackDescription('SsoCustomStack'),
			environment,
			ssoInstanceArn,
			ssoRegion,
			adminEmail,
			samlMetaDataUrl
		});
		ssoCustomStack.node.addDependency(platformStack);
	}
};


const getCallerEnvironment = (): { accountId?: string, region?: string } | undefined => {
	if (!fs.existsSync(`${__dirname}/predeploy.json`)) {
		throw new Error('Pre deployment file does not exist\n' +
			'Make sure you run the cdk using npm script which will run the predeploy script automatically\n' +
			'EXAMPLE\n' +
			'$ npm run cdk deploy -- -e sampleEnvironment');
	}
	const { callerEnvironment } = JSON.parse(fs.readFileSync(`${__dirname}/predeploy.json`, 'utf-8'));
	return callerEnvironment;
};

deployPlatform(getCallerEnvironment());




