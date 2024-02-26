import { FastifyBaseLogger } from "fastify";
// @ts-ignore
import { Credentials } from "./schemas.js";
import { CredentialsRepository } from './repository.js';
import { AssetNotAuthorizedError, UserNotAuthorizedError } from "../common/errors.js";

export class CredentialsService {

	constructor(private readonly logger: FastifyBaseLogger, private readonly repository: CredentialsRepository) {
	}

	public async createTemporaryCredentialsForAsset(cognitoUserId: string, domainId: string, projectId: string, assetListingId: string): Promise<Credentials> {
		this.logger.debug(`CredentialsService > create > cognitoUserId: ${cognitoUserId}, projectId: ${projectId}, assetListingId: ${assetListingId} }`);

		// TODO: the two access calls can be done in parallel

		// First, confirm caller is in datazone project
		if (! await this.repository.isUserInProject(cognitoUserId, domainId, projectId)) {
			throw new UserNotAuthorizedError('User not in project');
		}

		// Now, confirm the project has access to the requested asset and get the assetId
		if (! await this.repository.isAssetInProject(domainId, projectId, assetListingId)) {
			throw new AssetNotAuthorizedError('Asset not in project');
		}

		// Generate temporary credentials for the asset
		const credentials = await this.repository.generateCredentialsForAsset(domainId, projectId, assetListingId);

		this.logger.debug(`CredentialsService > create > exit >`);
		return credentials;
	}

}
