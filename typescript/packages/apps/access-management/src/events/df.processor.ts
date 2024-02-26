import { FastifyBaseLogger } from "fastify";
import type { DfEventDetail } from "./models";
import {
  CreateRoleCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  IAMClient,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  credentialVendorExecutionRoleArn,
  haprPermissionsBoundaryArn,
  haprRoleArn,
  haprRoleName,
  haprRolePolicyName,
  saprPermissionsBoundaryArn,
  saprRoleArn,
  saprRoleName,
  saprRolePolicyName,
} from "@df/cdk-common";

export class DfEventProcessor {
  constructor(
    private readonly logger: FastifyBaseLogger,
    private readonly iamClient: IAMClient
  ) {}

  public async processDfHaprEvent(
    dfEventDetail: DfEventDetail
  ): Promise<void> {
    this.logger.debug(
      `DfEventProcessor > processDfHaprEvent > subscriptionEventDetail: ${JSON.stringify(
        dfEventDetail
      )}`
    );

    const domainId = dfEventDetail.metadata.domain;
    const hubAccountId = dfEventDetail.dfData.hubAccountId;
    const spokeAccountId = dfEventDetail.dfData.spokeAccountId;
    const projectId = dfEventDetail.dfData.subscribedProjectId;

    if (!(await this.roleExists(haprRoleName(domainId, projectId)))) {
      await this.createHaprRole({
        domainId,
        projectId,
        accountId: hubAccountId,
      });
    }

    if (
      !(await this.inlinePolicyExists(
        haprRoleName(domainId, projectId),
        haprRolePolicyName(spokeAccountId)
      ))
    ) {
      await this.putInlineHaprPolicy({
        spokeAccountId: spokeAccountId,
        domainId,
        projectId,
      });
    }

    this.logger.debug(`DfEventProcessor > processDfHaprEvent > exit`);
  }

  public async processDfSaprEvent(
    dfEventDetail: DfEventDetail
  ): Promise<void> {
    this.logger.debug(
      `DfEventProcessor > processDfSaprEvent > subscriptionEventDetail: ${JSON.stringify(
        dfEventDetail
      )}`
    );

    const domainId = dfEventDetail.metadata.domain;
    const hubAccountId = dfEventDetail.dfData.hubAccountId;
    const spokeAccountId = dfEventDetail.dfData.spokeAccountId;
    const projectId = dfEventDetail.dfData.subscribedProjectId;
    const subscriptionId = dfEventDetail.dfData.subscriptionId;
    const assetArn = dfEventDetail.dfData.assetDetail.assetArn;
    const assetType = dfEventDetail.dfData.assetDetail.type;

    if (assetType !== "S3") {
      throw new Error("Only S3 assets are supported");
    }

    if (!(await this.roleExists(saprRoleName(domainId, projectId)))) {
      await this.createSaprRole({
        domainId,
        projectId,
        hubAccountId,
        spokeAccountId,
      });
    }
    if (
      !(await this.inlinePolicyExists(
        saprRoleName(domainId, projectId),
        saprRolePolicyName(subscriptionId)
      ))
    ) {
      await this.putInlineSaprPolicy({
        assetArn,
        subscriptionId,
        domainId,
        projectId,
        accountId: spokeAccountId,
      });
    }

    this.logger.debug(`DfEventProcessor > processDfSaprEvent > exit >`);
  }

  public async roleExists(roleName: string): Promise<boolean> {
    this.logger.debug(`DfEventProcessor > roleExists > roleName: ${roleName}`);
    try {
      await this.iamClient.send(
        new GetRoleCommand({
          RoleName: roleName,
        })
      );
      this.logger.debug(`DfEventProcessor > roleExists > exit > true`);
      return true;
    } catch (err) {
      this.logger.debug(`DfEventProcessor > roleExists > exit > false`);
      return false;
    }
  }

  public async inlinePolicyExists(
    roleName: string,
    policyName: string
  ): Promise<boolean> {
    this.logger.debug(
      `DfEventProcesor > inlinePolicyExists > roleName: ${roleName}, policyName: ${policyName}`
    );
    try {
      await this.iamClient.send(
        new GetRolePolicyCommand({
          RoleName: roleName,
          PolicyName: policyName,
        })
      );
      this.logger.debug(`DfEventProcessor > inlinePolicyExists > exit > true`);
      return true;
    } catch (err) {
      this.logger.debug(
        `DfEventProcessor > inlinePolicyExists > exit > false`
      );
      return false;
    }
  }

  public async createHaprRole(props: {
    domainId: string;
    projectId: string;
    accountId: string;
  }) {
    try {
      await this.iamClient.send(
        new CreateRoleCommand({
          RoleName: haprRoleName(props.domainId, props.projectId),
          PermissionsBoundary: haprPermissionsBoundaryArn(props.accountId),
          AssumeRolePolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: {
                  AWS: credentialVendorExecutionRoleArn(
                    props.accountId
                  ),
                },
                Action: "sts:AssumeRole",
              },
            ],
          }),
        })
      );
    } catch (err) {
      throw new Error(
        `Could not create the HAPR Role. Got error: ${JSON.stringify(err)}`
      );
    }
  }

  public async createSaprRole(props: {
    domainId: string;
    projectId: string;
    hubAccountId: string;
    spokeAccountId: string;
  }) {
    try {
      await this.iamClient.send(
        new CreateRoleCommand({
          RoleName: saprRoleName(props.domainId, props.projectId),
          PermissionsBoundary: saprPermissionsBoundaryArn(props.spokeAccountId),
          AssumeRolePolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: {
                  AWS: haprRoleArn(
                    props.hubAccountId,
                    props.domainId,
                    props.projectId
                  ),
                },
                Action: "sts:AssumeRole",
              },
            ],
          }),
        })
      );
    } catch (err) {
      throw new Error("Could not create the SAPR Role");
    }
  }

  public async putInlineHaprPolicy(props: {
    spokeAccountId: string;
    domainId: string;
    projectId: string;
  }): Promise<void> {
    try {
      await this.iamClient.send(
        new PutRolePolicyCommand({
          RoleName: haprRoleName(props.domainId, props.projectId),
          PolicyName: haprRolePolicyName(props.spokeAccountId),
          PolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Resource: [
                  saprRoleArn(props.spokeAccountId, props.domainId, props.projectId),
                ],
                Action: "sts:AssumeRole",
              },
            ],
          }),
        })
      );
    } catch (err) {
      throw new Error("Could not put the HAPR inline policy");
    }
  }

  public async putInlineSaprPolicy(props: {
    assetArn: string;
    subscriptionId: string;
    domainId: string;
    projectId: string;
    accountId: string;
  }): Promise<void> {
    try {
      await this.iamClient.send(
        new PutRolePolicyCommand({
          RoleName: saprRoleName(props.domainId, props.projectId),
          PolicyName: saprRolePolicyName(props.subscriptionId),
          PolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Resource: [props.assetArn],
                Action: "s3:GetObject",
              },
            ],
          }),
        })
      );
    } catch (err) {
      throw new Error("Could not put the SAPR inline policy");
    }
  }
}
