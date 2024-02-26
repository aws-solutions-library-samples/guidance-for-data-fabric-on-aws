import { Static, Type, TString } from '@sinclair/typebox';

/**
 * Credentials specific path parameters
 */

/**
 * Credentials specific query string parameters
 */

export const domainId: TString = 
	Type.String({
		description: 'The DataZone Domain ID',
	});
export const projectId: TString = 
	Type.String({
		description: 'The DataZone Project ID through which you would like to access to the asset.',
	});
export const assetListingId: TString =
	Type.String({
		description: 'The Asset Listing Id for the DataZone asset you would like credentials to access.',
	});

/**
 * Credentials specific resources
 */
export const credentialsResource = Type.Object(
	{
		AccessKeyId: Type.String({description: 'The access key ID that identifies the temporary security credentials.'}),
		Expiration: Type.String({description: 'The date on which the current credentials expire.'}),
		SecretAccessKey: Type.String({description: 'The secret access key that can be used to sign requests.'}),
		SessionToken: Type.String({description: 'The token that users must pass to the service API to use the temporary credentials.'}),
	},
	{ $id: 'credentials' })
export type Credentials = Static<typeof credentialsResource>