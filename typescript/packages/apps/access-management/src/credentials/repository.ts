/*
 *  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import {
  DataZoneClient,
  GetListingCommand,
  ListProjectMembershipsCommand,
  ListSubscriptionsCommand,
  SubscriptionStatus,
} from "@aws-sdk/client-datazone";
import {
  IdentitystoreClient,
  GetUserIdCommand,
  IsMemberInGroupsCommand,
  GetUserIdCommandOutput,
} from "@aws-sdk/client-identitystore";
import {
  STSClient,
  GetCallerIdentityCommand,
  AssumeRoleCommand,
} from "@aws-sdk/client-sts";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import pkg from "aws-xray-sdk";
import { DfForm } from "../events/models.js";

import { FastifyBaseLogger } from "fastify";
import {
  AssetNotAuthorizedError,
  UserNotAuthorizedError,
} from "../common/errors.js";
import { Credentials } from "./schemas.js";

import { haprRoleArn, saprRoleArn } from "@df/cdk-common";

export class CredentialsRepository {
  constructor(
    private readonly logger: FastifyBaseLogger,
    private readonly dataZoneClient: DataZoneClient,
    private readonly identityStoreClient: IdentitystoreClient,
    private readonly stsClient: STSClient,
    private readonly identityStoreId: string
  ) {}

  public async isUserInProject(
    cognitoUserId: string,
    domainId: string,
    projectId: string
  ): Promise<boolean> {
    this.logger.debug(
      `CredentialsRepository > isUserInProject > cognitoUserId: ${cognitoUserId}, domainId: ${domainId}, projectId: ${projectId}`
    );
    let userInProject = false;

    // Now fetch the user to get their ID
    let identityStoreUserId: GetUserIdCommandOutput;
    try {
      identityStoreUserId = await this.identityStoreClient.send(
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
    } catch (e) {
      if (e.name === "ResourceNotFoundException") {
        throw new UserNotAuthorizedError("User not found");
      } else {
        this.logger.error(
          `CredentialsRepository > isUserInProject > error: ${JSON.stringify(
            e
          )}`
        );
        throw e;
      }
    }

    this.logger.debug(
      `identityStoreUserId: ${JSON.stringify(identityStoreUserId)}`
    );

    // Now ensure this user is in the project
    const memberships = await this.dataZoneClient.send(
      new ListProjectMembershipsCommand({
        domainIdentifier: domainId,
        projectIdentifier: projectId,
      })
    );

    this.logger.debug(`memberships: ${JSON.stringify(memberships)}`);

    const groups = [];
    memberships.members.forEach((m) => {
      if (m.memberDetails.user?.userId === identityStoreUserId.UserId) {
        userInProject = true;
      }
      if (m.memberDetails.group?.groupId) {
        groups.push(m.memberDetails.group.groupId);
      }
    });

    // if user is not directly in project, check if any of the user's groups are in the project
    if (!userInProject) {
      const isMemberInGroups = await this.identityStoreClient.send(
        new IsMemberInGroupsCommand({
          IdentityStoreId: this.identityStoreId,
          MemberId: {
            UserId: identityStoreUserId.UserId,
          },
          GroupIds: groups,
        })
      );

      this.logger.debug(
        `isMemberInGroups: ${JSON.stringify(isMemberInGroups)}`
      );

      if (
        isMemberInGroups.Results &&
        isMemberInGroups.Results.filter((r) => r.MembershipExists).length > 0
      ) {
        userInProject = true;
      } else {
        userInProject = false;
      }
    }

    this.logger.debug(
      `CredentialsRepository > isUserInProject > exit: userInProject: ${userInProject}`
    );
    return userInProject;
  }

  public async isAssetInProject(
    domainId: string,
    projectId: string,
    assetListingId: string
  ): Promise<boolean> {
    this.logger.debug(
      `CredentialsRepository > assetIsInProject > domainId: ${domainId}, projectId: ${projectId}, assetListingId: ${assetListingId}`
    );
    let assetInProject = false;

    const subscriptions = await this.dataZoneClient.send(
      new ListSubscriptionsCommand({
        domainIdentifier: domainId,
        owningProjectId: projectId,
        subscribedListingId: assetListingId,
        status: SubscriptionStatus.APPROVED,
      })
    );

    this.logger.debug(`subscriptions: ${JSON.stringify(subscriptions)}`);

    if (subscriptions.items.length > 0) {
      assetInProject = true;
    }

    this.logger.debug(
      `CredentialsRepository > assetIsInProject > exit: assetInProject: ${assetInProject}`
    );
    return assetInProject;
  }

  public async generateCredentialsForAsset(
    domainId: string,
    projectId: string,
    assetListingId: string
  ): Promise<Credentials> {
    this.logger.debug(
      `CredentialsRepository > generateCredentialsForAsset > domainId: ${domainId}, assetListingId: ${assetListingId}, projectId: ${projectId}`
    );

    // Fetch the metadata form from the asset to get the asset accountId
    const metadataForm = await this.getAssetMetadataForm(
      domainId,
      assetListingId
    );

    this.logger.debug(`metadataForm: ${JSON.stringify(metadataForm)}`);

    // get hub account ID (this account) from sts
    const callerIdentity = await this.stsClient.send(
      new GetCallerIdentityCommand({})
    );
    const hubAccountId = callerIdentity.Account;

    this.logger.debug(
      `hubAccountId: ${hubAccountId}, assetAccountId: ${metadataForm.accountId}`
    );

    try {
      // create a new STS client with temporary credentials from assuming the HAPR
      const haprStsClient = pkg.captureAWSv3Client(
        new STSClient({
          credentials: fromTemporaryCredentials({
            params: {
              RoleArn: haprRoleArn(hubAccountId, domainId, projectId),
              RoleSessionName: "HAPR",
              DurationSeconds: 900, // TODO: 900 is minimum - should be config or passed in in the call limited to config?
            },
          }),
        })
      );

      // assume the SAPR and get temporary credentials to return to the caller
      const saprRoleCredentials = await haprStsClient.send(
        new AssumeRoleCommand({
          RoleArn: saprRoleArn(metadataForm.accountId, domainId, projectId),
          RoleSessionName: "SAPR",
          DurationSeconds: 900, // TODO: 900 is minimum - should be config or passed in in the call limited to config?
        })
      );

      const credentials = {
        AccessKeyId: saprRoleCredentials.Credentials.AccessKeyId,
        SecretAccessKey: saprRoleCredentials.Credentials.SecretAccessKey,
        SessionToken: saprRoleCredentials.Credentials.SessionToken,
        Expiration: saprRoleCredentials.Credentials.Expiration.toISOString(),
      };
      this.logger.debug(
        `CredentialsRepository > generateCredentialsForAsset > exit`
      );
      return credentials;
    } catch (e) {
      this.logger.error(
        `CredentialsRepository > generateCredentialsForAsset > error: ${JSON.stringify(
          e
        )}`
      );
      if (e.name === "AccessDenied") {
        throw new AssetNotAuthorizedError(
          `Unable to grant credentials for requested asset. Ensure project ${projectId} is subscribed to asset listing ${assetListingId}.`
        );
      } else {
        throw e;
      }
    }
  }

  private async getAssetMetadataForm(
    domainId: string,
    subscribedListingId: string
  ): Promise<DfForm> {
    try {
      const response = await this.dataZoneClient.send(
        new GetListingCommand({
          domainIdentifier: domainId,
          identifier: subscribedListingId,
        })
      );
      const metadataForms = JSON.parse(response.item.assetListing.forms);
      const dfS3AssetForm = metadataForms["df_s3_asset_form"];
      return this.validateDfMetadataForm(dfS3AssetForm);
    } catch (err) {
      throw new Error(
        `getAssetMetadataForm failed for domainId: ${domainId} and subscribedListingId: ${subscribedListingId} with error: ${err}`
      );
    }
  }

  private validateDfMetadataForm(rawForm: any): DfForm {
    if (!rawForm.arn) {
      throw new Error("Expected to find DF metadata form with an arn.");
    }
    if (!rawForm.accountId) {
      throw new Error("Expected to find DF metadata form with an accountId.");
    }
    return rawForm;
  }
}
