import { DescribeInstanceCommand, CreateApplicationCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';

const { SSO_INSTANCE_ARN, SSO_REGION, SDF_ENVIRONMENT } = process.env;

const client = new SSOAdminClient({region:SSO_REGION});

const createSamlApplication = async () => {

	const instance = await client.send(new DescribeInstanceCommand({ InstanceArn: SSO_INSTANCE_ARN}));
    const instanceName = instance.Name;
	const applicationArn= await client.send(new CreateApplicationCommand({ 
        Name:`sdf-${SDF_ENVIRONMENT}-cognito-application`,
        ApplicationProviderArn:'arn:aws:sso::aws:applicationProvider/custom-saml',
        InstanceArn: SSO_INSTANCE_ARN,
        Description: 'The SAML application for Cognito integration',
        Status: 'enabled'
    }));
};


export const handler = async (event: any): Promise<any> => {
	console.log(`iam_control_center.customResource > handler > in : ${JSON.stringify(event)}`);
	try {
		switch (event.RequestType) {
			case 'Create': {
				await createSamlApplication();
				return;
			}
			case 'Update': {
				await createSamlApplication();
				return;
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
};