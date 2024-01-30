import { SSOAdminClient, DescribeInstanceCommand } from '@aws-sdk/client-sso-admin';
import { IdentitystoreClient, CreateGroupCommand, CreateUserCommand,
	 CreateGroupMembershipCommand, GetGroupIdCommand, GetUserIdCommand } from '@aws-sdk/client-identitystore';

const { SSO_INSTANCE_ARN, SSO_REGION, ADMIN_EMAIL } = process.env;

const ssoClient = new SSOAdminClient({ region: SSO_REGION });
const identityStoreClient = new IdentitystoreClient({ region: SSO_REGION });

const createCognitoSamlApplication = async (): Promise<void> => {

	const instance = await ssoClient.send(new DescribeInstanceCommand({
		InstanceArn: SSO_INSTANCE_ARN
	}));

	const identityStoreId = instance.IdentityStoreId;

	let groupId: string;
	// Create Admin group
	try {
		const group = await identityStoreClient.send(new CreateGroupCommand({
			IdentityStoreId: identityStoreId,
			DisplayName: 'admin',
			Description: 'default admin group created for testing purposes'
		}));
		groupId = group.GroupId as string;

	} catch (e) {
		if (e.name === 'ConflictException') {

			//Groups already created get the id instead
			// const group = await identityStoreClient.send(new GetGroupIdCommand({
			// 	IdentityStoreId: identityStoreId,
			// 	AlternateIdentifier: {
			// 		UniqueAttribute: {
			// 			AttributePath: "DisplayName",
			// 			AttributeValue: "admin"
			// 		}
			// 	}
			// }));
			// groupId = group.GroupId as string;
			groupId = 'd9dec4d8-0031-7027-9534-dcfcb5003c7d';

		} else {
			throw (e);
		}
	}


	// Create Admin User
	let userId: string;
	try {
		const user = await identityStoreClient.send(new CreateUserCommand({
			IdentityStoreId: identityStoreId,
			UserName: ADMIN_EMAIL,
			DisplayName: ADMIN_EMAIL,
			Emails: [{
				Value: ADMIN_EMAIL,
				Primary: true,
				Type: 'work'
			}],
			Name: {
				GivenName: "admin",
				FamilyName: "admin"
			}
		}));
		userId = user.UserId as string;
	} catch (e) {
		if (e.name === 'ConflictException') {
			//Users already created get the id instead
			const user = await identityStoreClient.send(new GetUserIdCommand({
				IdentityStoreId: identityStoreId,
				AlternateIdentifier: {
					UniqueAttribute: {
						AttributePath: 'UserName',
						AttributeValue: ADMIN_EMAIL
					}
				}
			}));
			userId = user.UserId as string;
		}else {
			throw (e);
		}
	}

		// Create Group membership 
		await identityStoreClient.send(new CreateGroupMembershipCommand({
			IdentityStoreId: identityStoreId,
			GroupId: groupId,
			MemberId: {
				UserId: userId,
				$unknown: undefined
			}
		}))


		// const response= await client.send(new CreateApplicationCommand({ 
		//     Name:`sdf-${SDF_ENVIRONMENT}-cognito-application`,
		//     ApplicationProviderArn:'arn:aws:sso::aws:applicationProvider/custom-saml',
		//     InstanceArn: SSO_INSTANCE_ARN,
		//     Description: 'The SAML application for Cognito integration',
		//     Status: 'ENABLED'
		// }));

		// return response.ApplicationArn;
	};


	export const handler = async (event: any): Promise<any> => {
		console.log(`iam_control_center.customResource > handler > in : ${JSON.stringify(event)}`);
		try {
			switch (event.RequestType) {
				case 'Create': {
					return await createCognitoSamlApplication();
				}
				case 'Update': {
					return await createCognitoSamlApplication();
				}
				case 'Delete': {
					console.log(`nothing to do on delete`);
					return;
				}
				default: {
					console.log(`iam_control_center.customResource > unknown request type`);
				}
			}
		} catch (Exception) {
			console.log(`iam_control_center.customResource > error : ${Exception}`);
		}
		console.log(`iam_control_center.customResource > exit`);
	}