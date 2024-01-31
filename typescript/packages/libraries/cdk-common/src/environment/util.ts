import { STS } from '@aws-sdk/client-sts';

export interface SdfAwsEnvironment {
	accountId?: string;
	region?: string;
}

const getSdfAwsEnvironment = async (): Promise<SdfAwsEnvironment> => {
	const sts = new STS({});
	
	let accountId, region;
	try {
		const callerIdentity = await sts.getCallerIdentity({});
		accountId = callerIdentity.Account;
		region = await sts.config.region();
	} catch (Exception) {
		console.log(`Could not retrieve caller identity when fetching environment`);
	}

	return {
		accountId, region
	};
};

export {
	getSdfAwsEnvironment
};
