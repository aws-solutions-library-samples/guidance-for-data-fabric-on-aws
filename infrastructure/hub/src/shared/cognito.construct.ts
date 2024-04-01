import { RemovalPolicy } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import {
	AccountRecovery,
	StringAttribute,
	UserPool,
	UserPoolDomain,
	UserPoolEmail
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { NagSuppressions } from 'cdk-nag';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import path from 'path';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { getLambdaArchitecture } from '@df/cdk-common';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CognitoConstructProperties {
	userPoolIdParameter: string;
	userPoolEmail?: {
		fromEmail: string;
		fromName: string;
		replyTo: string;
		sesVerifiedDomain: string;
	};
}


export const userPoolArnParameter = `/df/shared/cognito/userPoolArn`;
export const userPoolClientIdParameter = `/df/shared/cognito/userPoolClientId`;
export const userPoolDomainParameter = `/df/shared/cognito/userPoolDomain`;

export class Cognito extends Construct {
	public readonly userPoolId: string;

	constructor(scope: Construct, id: string, props: CognitoConstructProperties) {
		super(scope, id);

		const namePrefix = `df`;

		const preTokenGenerationLambdaTrigger = new NodejsFunction(this, 'PreTokenGenerationLambdaTrigger', {
			functionName: `${namePrefix}-preTokenGenerationLambdaTrigger`,
			description: `Cognito Construct Pre Token Generation Lambda Trigger`,
			entry: path.join(__dirname, './triggers/preTokenGeneration.trigger.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: cdk.Duration.seconds(15),
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk']
			},
			environment: {
				
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		const userPoolEmailSettings: UserPoolEmail | undefined = props.userPoolEmail
			? cognito.UserPoolEmail.withSES({
				fromEmail: props.userPoolEmail.fromEmail,
				fromName: props.userPoolEmail.fromName,
				replyTo: props.userPoolEmail.replyTo,
				sesVerifiedDomain: props.userPoolEmail.sesVerifiedDomain,
				sesRegion: cdk.Stack.of(this).region
			})
			: undefined;

		/**
		 * Create and configure the Cognito user pool
		 */
		const userPool = new UserPool(this, 'UserPool', {
			userPoolName: namePrefix,
			email: userPoolEmailSettings,
			selfSignUpEnabled: false,
			signInAliases: {
				email: true
			},
			autoVerify: {
				email: true
			},
			customAttributes: {
				role: new StringAttribute({ mutable: true })
			},
			lambdaTriggers: {
				preTokenGeneration: preTokenGenerationLambdaTrigger
			},
			passwordPolicy: {
				minLength: 6,
				requireLowercase: true,
				requireDigits: true,
				requireUppercase: false,
				requireSymbols: false
			},
			accountRecovery: AccountRecovery.EMAIL_ONLY,
			removalPolicy: RemovalPolicy.DESTROY
		});

		this.userPoolId = userPool.userPoolId;

		new ssm.StringParameter(this, 'cognitoUserPoolIdParameter', {
			parameterName: props.userPoolIdParameter,
			stringValue: userPool.userPoolId
		});

		new ssm.StringParameter(this, 'cognitoUserPoolArnParameter', {
			parameterName: userPoolArnParameter,
			stringValue: userPool.userPoolArn
		});

		const domain = new UserPoolDomain(this, 'UserPoolDomain', {
			userPool: userPool,
			cognitoDomain: {
				domainPrefix: `${namePrefix}-${cdk.Stack.of(this).account}`
			}
		});

		new ssm.StringParameter(this, 'userPoolDomainParameter', {
			parameterName: userPoolDomainParameter,
			stringValue: domain.domainName
		});

		NagSuppressions.addResourceSuppressions(userPool,
			[
				{
					id: 'AwsSolutions-COG3',
					reason: 'User can turn on AdvancedSecurity mode if they want to, the open source solution will not enforce it.'
				},
				{
					id: 'AwsSolutions-COG1',
					reason: 'User can modify the password policy as necessary.'

				}],
			true);

			NagSuppressions.addResourceSuppressions([preTokenGenerationLambdaTrigger],
				[
					{
						id: 'AwsSolutions-IAM4',
						appliesTo:[
							`Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`,
						],
						reason: 'Lambda execution permissions.'
					},
					{
						id: 'AwsSolutions-IAM5',
						appliesTo:[
							`Resource::*`
						],
						reason: 'Lambda execution permissions.'
	
					}],
				true);

	}
}
