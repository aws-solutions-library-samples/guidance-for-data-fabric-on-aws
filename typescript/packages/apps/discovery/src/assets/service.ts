import { FastifyBaseLogger } from "fastify";
import { Asset } from "./schemas.js";
import { AssetsRepository } from "./repository.js";
import { UserNotAuthorizedError } from "../common/errors.js";

export class AssetsService {
    constructor(private readonly logger: FastifyBaseLogger, private readonly repository: AssetsRepository) {
    }

    public async get(cognitoUserId: string, domainId: string, assetListingId: string): Promise<Asset> {
        this.logger.debug(`AssetsService > get > domainId: ${domainId}, assetListingId: ${assetListingId}}`);

        if (! await this.repository.isUserInDomain(cognitoUserId, domainId)) {
            throw new UserNotAuthorizedError("User is not part of the domain.");
        }

        const asset = await this.repository.getAsset(domainId, assetListingId);

        this.logger.debug(`AssetsService > get > exit > assetResource: ${asset}`);

        return asset;
    }
}
