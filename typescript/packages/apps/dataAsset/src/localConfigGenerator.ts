import * as fs from 'fs';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const { DOMAIN_ID, AWS_REGION  } = process.env;

if (!DOMAIN_ID || !AWS_REGION) {
	throw new Error(`Environment Variable DOMAIN_ID or AWS_REGION is not being specified`);
}

const ssm = new SSMClient({ region: process.env['AWS_REGION'] });

const getValues = async (module: string, mapping: Record<string, string>) => {
	for (const key in mapping) {
		let prefix = `/df/${module}/`;
		if( module != 'dataAsset' ){
			prefix = `/df/${DOMAIN_ID}/${module}/`;
		}
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

let outputFile = `NODE_ENV=${DOMAIN_ID}\r\n`;
outputFile += 'MODULE_NAME=dataAsset\r\n';
outputFile += 'ENABLE_DELETE_RESOURCE=true\r\n';

await getValues('shared', {
	EVENT_BUS_NAME: 'eventBusName',
});

await getValues('dataAsset', {
	TABLE_NAME: 'tableName',
	ASSET_MANAGEMENT_HUB_STATE_MACHINE_ARN: 'stateMachineArn'
});

fs.writeFileSync('.env', outputFile);
