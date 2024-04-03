import { STS } from '@aws-sdk/client-sts';

export interface DfAwsEnvironment {
	accountId?: string;
	region?: string;
}

const getDfAwsEnvironment = async (): Promise<DfAwsEnvironment> => {
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
	getDfAwsEnvironment
};
