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



export interface CognitoConstructProperties {
	environment: string;
	userPoolIdParameter: string;
	userPoolEmail?: {
		fromEmail: string;
		fromName: string;
		replyTo: string;
		sesVerifiedDomain: string;
	};
}


export const userPoolArnParameter = (environment: string) => `/sdf/${environment}/shared/cognito/userPoolArn`;
export const userPoolClientIdParameter = (environment: string) => `/sdf/${environment}/shared/cognito/userPoolClientId`;
export const userPoolDomainParameter = (environment: string) => `/sdf/${environment}/shared/cognito/userPoolDomain`;

export class Cognito extends Construct {
	public readonly userPoolId: string;

	constructor(scope: Construct, id: string, props: CognitoConstructProperties) {
		super(scope, id);

		const namePrefix = `sdf-${props.environment}`;

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

		this.userPoolId = userPool.userPoolId;

		new ssm.StringParameter(this, 'cognitoUserPoolIdParameter', {
			parameterName: props.userPoolIdParameter,
			stringValue: userPool.userPoolId
		});

		new ssm.StringParameter(this, 'cognitoUserPoolArnParameter', {
			parameterName: userPoolArnParameter(props.environment),
			stringValue: userPool.userPoolArn
		});

		const domain = new UserPoolDomain(this, 'UserPoolDomain', {
			userPool: userPool,
			cognitoDomain: {
				domainPrefix: `sdf-${props.environment}-${cdk.Stack.of(this).account}`
			}
		});

		new ssm.StringParameter(this, 'userPoolDomainParameter', {
			parameterName: userPoolDomainParameter(props.environment),
			stringValue: domain.domainName
		});	
	
	}
}
