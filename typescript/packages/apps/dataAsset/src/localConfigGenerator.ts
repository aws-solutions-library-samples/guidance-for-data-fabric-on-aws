import * as fs from 'fs';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { dfEventBusName } from '@df/cdk-common';

const { AWS_REGION, IDENTITY_STORE_ID, IDENTITY_STORE_REGION, IDENTITY_STORE_ROLE_ARN } = process.env;

if (!AWS_REGION || !IDENTITY_STORE_ID || !IDENTITY_STORE_REGION || !IDENTITY_STORE_ROLE_ARN ) {
	throw new Error(`Environment Variables  [AWS_REGION, IDENTITY_STORE_ID, IDENTITY_STORE_REGION, IDENTITY_STORE_ROLE_ARN ] is not being specified`);
}

const ssm = new SSMClient({ region: process.env['AWS_REGION'] });

const getValues = async (module: string, mapping: Record<string, string>) => {
	for (const key in mapping) {
		let prefix = `/df/${module}/`;
		const name = `${prefix}${mapping[key]}`;
		try {
			const response = await ssm.send(
				new GetParameterCommand({
					Name: name,
					WithDecryption: false,
				})
			);
			if (response) {
				outputFile += `${key}=${response.Parameter?.Value}\r\n`;
			}
		} catch (e) {
			throw new Error(`Parameter ${name} NOT Found !!!`);
		}
	}
};

let outputFile = `NODE_ENV=local\r\n`;
outputFile += 'MODULE_NAME=dataAsset\r\n';
outputFile += 'ENABLE_DELETE_RESOURCE=true\r\n';
outputFile += `EVENT_BUS_NAME=${dfEventBusName}\r\n`;
outputFile += `LOG_LEVEL=debug\r\n`;

await getValues('shared', {

});

await getValues('dataAsset', {
	TABLE_NAME: 'tableName',
	HUB_CREATE_STATE_MACHINE_ARN: 'createStateMachineArn'
});

fs.writeFileSync('.env', outputFile);
