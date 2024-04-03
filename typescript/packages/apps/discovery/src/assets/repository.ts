import {
  DataZoneClient,
  GetListingCommand,
  GetUserProfileCommand,
} from "@aws-sdk/client-datazone";
import {
  IdentitystoreClient,
  GetUserIdCommand,
  GetUserIdCommandOutput,
} from "@aws-sdk/client-identitystore";
import { InvalidAssetError, UserNotAuthorizedError } from "../common/errors.js";
import { FastifyBaseLogger } from "fastify";
import { Asset } from "./schemas.js";


export enum DFAssetType {
    S3 = "DF_S3_Custom_Asset"
}

export enum DFMetadataFormName {
    S3 = "df_s3_asset_form"
}

export interface S3DfForm {
    arn: string;
    accountId: string;
    region: string;
  }

export class AssetsRepository {
  constructor(
    private readonly logger: FastifyBaseLogger,
    private readonly dataZoneClient: DataZoneClient,
    private readonly identityStoreClient: IdentitystoreClient,
    private readonly identityStoreId: string
  ) {}

  public async isUserInDomain(
    cognitoUserId: string,
    domainId: string
  ): Promise<boolean> {
    this.logger.debug(
      `AssetsRepository > isUserInDomain > cognitoUserId: ${cognitoUserId}, domainId: ${domainId}`
    );

    let getUserIdResponse: GetUserIdCommandOutput;
    try {
      getUserIdResponse = await this.identityStoreClient.send(
        new GetUserIdCommand({
          IdentityStoreId: this.identityStoreId,
          AlternateIdentifier: {
            UniqueAttribute: {
              AttributePath: "Username",
              AttributeValue: cognitoUserId,
            },
          },
        })
      );
      this.logger.debug(
        `getUserIdResponse: ${JSON.stringify(getUserIdResponse)}`
      );
    } catch (e) {
      this.logger.error(
        `AssetsRepository > isUserInDomain > error: ${JSON.stringify(e)}`
      );
      if (e.name === "ResourceNotFoundException") {
        throw new UserNotAuthorizedError(
          "Cognito user ID not found in the identity store"
        );
      } else {
        throw e;
      }
    }

    try {
      await this.dataZoneClient.send(
        new GetUserProfileCommand({
          domainIdentifier: domainId,
          userIdentifier: getUserIdResponse.UserId,
        })
      );
      return true;
    } catch (e) {
      if (e.name === "ResourceNotFoundException") {
        this.logger.debug(
          `AssetsRepository > isUserInDomain > False: The user is not part of this domain.`
        );
        return false;
      } else {
        this.logger.error(
          `AssetsRepository > isUserInDomain > error: ${JSON.stringify(e)}`
        );
        throw e;
      }
    }
  }

  public async getAsset(
    domainId: string,
    assetListingId: string
  ): Promise<Asset> {

    try {
        const response = await this.dataZoneClient.send(
          new GetListingCommand({
            domainIdentifier: domainId,
            identifier: assetListingId,
          })
        );
        const assetType = response.item.assetListing.assetType;
        if (assetType !== DFAssetType.S3) {
            throw new InvalidAssetError("The requested assetListing has an unsupported type");
        }
        const metadataForms = JSON.parse(response.item.assetListing.forms);
        const dfS3MetadataForm = metadataForms[DFMetadataFormName.S3];
        const validatedForm = this.validateDfS3MetadataForm(dfS3MetadataForm);
        const asset: Asset = {
            type: "S3",
            detail: {
                arn: validatedForm.arn,
                region: validatedForm.region
            }
        }
        this.logger.debug(`AssetsRepository > getAssetMetadataForm > exit > Asset: ${JSON.stringify(asset)}`);
        return asset;
      } catch (err) {
        throw new Error(
          `getAssetMetadataForm failed for domainId: ${domainId} and assetListingId: ${assetListingId} with error: ${err}`
        );
      }
  }

  private validateDfS3MetadataForm(rawForm: any): S3DfForm {
    this.logger.debug(
      `AssetsRepository > validateDfS3MetadataForm > rawForm: ${JSON.stringify(
        rawForm
      )}`
    );
    if (!rawForm.arn) {
      throw new Error("Expected to find DF metadata form with an arn.");
    }
    if (!rawForm.accountId) {
      throw new Error("Expected to find DF metadata form with an accountId.");
    }
    if (!rawForm.region) {
        throw new Error("Expected to find DF metadata form with a region.");
      }
    this.logger.debug(
      `AssetsRepository > validateDfS3MetadataForm > exit`
    );
    return rawForm;
  }
}
