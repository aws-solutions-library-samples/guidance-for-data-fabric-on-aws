import { CognitoIdentityProviderClient, DescribeIdentityProviderCommand, CreateIdentityProviderCommand, CreateUserPoolClientCommand } from '@aws-sdk/client-cognito-identity-provider';
import { SSMClient,GetParameterCommand, PutParameterCommand, DescribeActivationsCommandOutput,GetParametersCommandOutput } from '@aws-sdk/client-ssm';


const { USE_POOL_ID_PARAMETER, SDF_ENVIRONMENT, IDENTITY_PROVIDER_NAME_PARAMETER, METADATA_URL_PARAMETER, COGNITO_CLIENT_ID_PARAMETER  } = process.env;

const cognitoClient = new CognitoIdentityProviderClient({});
const ssmClient = new SSMClient({});

const addFederatedIdentityProvider = async ():Promise<string | undefined> => {
	const providerName = `sdf-${SDF_ENVIRONMENT}-sso-provider`;

	// GET User Pool ID that has already been created
	const userPoolParam = await ssmClient.send (new GetParameterCommand({
		Name:USE_POOL_ID_PARAMETER
	}));

	let provider:DescribeActivationsCommandOutput|undefined = undefined;
	// GET Federated Identity Provider ID if one has already been created
	try {
		const providerNameParam = await ssmClient.send (new GetParameterCommand({
			Name:IDENTITY_PROVIDER_NAME_PARAMETER
		}));
		
		provider = await cognitoClient.send(new DescribeIdentityProviderCommand({
			UserPoolId: userPoolParam.Parameter?.Value,
			ProviderName: providerNameParam.Parameter?.Value
		})); 
	}catch (e){
		if(e.name === 'ParameterNotFound'){
			// ignore 
		} else {
			throw(e);
		}
	}

	// Create a new provider if none exists
	if (!provider){

		const metaDataUrl = await ssmClient.send (new GetParameterCommand({
			Name: METADATA_URL_PARAMETER
		}));
		console.log(`metaDataUrl: ${JSON.stringify(metaDataUrl)}`);
		if (metaDataUrl.Parameter?.Value) {
			try {
				await cognitoClient.send( new CreateIdentityProviderCommand({
					UserPoolId: userPoolParam.Parameter?.Value,
					ProviderName: providerName,
					ProviderType: 'SAML',
					ProviderDetails:{
						MetadataURL: metaDataUrl.Parameter?.Value
					},
					AttributeMapping:{
						email: "${user:email}"
					}
				}));

			} catch(e){
				if(e.name === 'DuplicateProviderException'){
					// ignore 
				} else {
					throw(e);
				}
			}

			await ssmClient.send( new PutParameterCommand({
				Name: IDENTITY_PROVIDER_NAME_PARAMETER,
				Value:providerName,
				Type:'String'
			}));
			
		}

	}

		// Create the APP Client
		let clientIdParameter: GetParametersCommandOutput|undefined =undefined;
		try {
			 clientIdParameter= await ssmClient.send (new GetParameterCommand({
				Name:COGNITO_CLIENT_ID_PARAMETER
			}));
		}catch (e){
			if(e.name === 'ParameterNotFound'){
				// ignore 
			} else {
				throw(e);
			}
		}
		
		if(!clientIdParameter){
			const client = await cognitoClient.send(new CreateUserPoolClientCommand({
				UserPoolId: userPoolParam.Parameter?.Value,
				ClientName:`sdf-${SDF_ENVIRONMENT}-sso-client`,
				SupportedIdentityProviders: [providerName],
				CallbackURLs:[
					'http://localhost:8080'
				],
				AllowedOAuthFlows:['implicit'],
				AllowedOAuthScopes:['openid','email']
			}));
	
			await ssmClient.send( new PutParameterCommand({
				Name: COGNITO_CLIENT_ID_PARAMETER,
				Value:client.UserPoolClient?.ClientId,
				Type:'String'
			}));
		}
		
	return

};


export const handler = async (event: any): Promise<any> => {
	console.log(`cognito.customResource > handler > in : ${JSON.stringify(event)}`);
	try {
		switch (event.RequestType) {
			case 'Create': {
				return await addFederatedIdentityProvider();
			}
			case 'Update': {
				return await addFederatedIdentityProvider();
			}
			case 'Delete': {
				console.log(`nothing to do on delete`);
				return;
			}
			default: {
				console.log(`cognito.customResource > unknown request type`);
			}
		}
	} catch (Exception) {
		console.log(`cognito.customResource > error : ${Exception}`);
	}
	console.log(`cognito.customResource > exit`);
};