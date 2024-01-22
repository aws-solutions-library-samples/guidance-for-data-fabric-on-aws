#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { SharedPlatformInfrastructureStack } from './shared/sharedPlatform.stack.js';
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
	new SharedPlatformInfrastructureStack(app, 'SharedPlatform', {
		stackName: stackName('platform'),
		description: platformStackDescription('SharedPlatform'),
		environment,
		userVpcConfig: useExistingVpc ? { vpcId: userVpcId, isolatedSubnetIds: userIsolatedSubnetIds, privateSubnetIds: userPrivateSubnetIds, publicSubnetIds: [] } : undefined,
		deleteBucket,
		env: {
			// The SDF_REGION environment variable
			region: process.env?.['SDF_REGION'] || callerEnvironment?.region,
			account: callerEnvironment?.accountId
		}
	});
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




