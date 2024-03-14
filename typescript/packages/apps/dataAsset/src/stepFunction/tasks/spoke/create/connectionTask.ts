import type { BaseLogger } from "pino";
import { SFNClient, SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import type { DataAssetTask } from "../../models.js";
import {
  GetConnectionCommand,
  type CreateConnectionCommandInput,
  type GlueClient,
  CreateConnectionCommand,
  ConnectionType,
} from "@aws-sdk/client-glue";
import {
  GetSecretValueCommand,
  GetSecretValueCommandOutput,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { getConnectionType } from "../../../../common/utils.js";

export class ConnectionTask {
  constructor(
    private log: BaseLogger,
    private glueClient: GlueClient,
    private sfnClient: SFNClient,
    private secretsManagerClient: SecretsManagerClient
  ) {}

  // This step is currently a placeholder and will be implemented once we roll out support for RDS & Redshift
  public async process(event: DataAssetTask): Promise<any> {
    this.log.info(
      `ConnectionTask > process > in > event: ${JSON.stringify(event)}`
    );

    try {
      const connectionType = getConnectionType(event.dataAsset.workflow);
      if (connectionType === "redshift") {
        const connectionName = ConnectionTask.getConnectionName(event);
        await this.glueClient.send(
          new GetConnectionCommand({
            Name: connectionName,
          })
        );
      }
    } catch (error) {
      if ((error as Error).name === "EntityNotFoundException") {
        const input = await this.constructConnectionInputCommand(event);
        await this.glueClient.send(new CreateConnectionCommand(input));
      } else {
        throw error;
      }
    }
    await this.sfnClient.send(
      new SendTaskSuccessCommand({
        output: JSON.stringify(event),
        taskToken: event.execution.taskToken,
      })
    );

    this.log.info(`ConnectionTask > process > exit:`);
  }

  public static getConnectionName(event: DataAssetTask): string {
    let connectionName = event.dataAsset.workflow.dataset.connectionId;
    if (!connectionName) {
      const id = event.dataAsset?.catalog?.assetId
        ? event.dataAsset.catalog.assetId
        : event.dataAsset.requestId; 
        connectionName = `${id}-connection`
    }
    return connectionName;
  }

  private async constructConnectionInputCommand(
    event: DataAssetTask
  ): Promise<CreateConnectionCommandInput> {
    this.log.debug(
      `ConnectionTask > constructConnectionInputCommand > in > event: ${JSON.stringify(
        event
      )}`
    );

    const connectionType = getConnectionType(event.dataAsset.workflow);
	let input: CreateConnectionCommandInput;
	switch (connectionType) {
		case 'redshift':
			const { username, password } = await this.getRedshiftCredentials(
			  event.dataAsset.workflow.dataset.connection.redshift.secretArn
			);
			input = {
				ConnectionInput: {
          Name: ConnectionTask.getConnectionName(event),
          ConnectionType: ConnectionType.JDBC,
          ConnectionProperties: {
            JDBC_ENFORCE_SSL: "false", // Fix?
            JDBC_CONNECTION_URL: event.dataAsset.workflow.dataset.connection.redshift.jdbcConnectionUrl,
            PASSWORD: password,
            USERNAME: username,
            KAFKA_SSL_ENABLED: "false",
				  },
          PhysicalConnectionRequirements: {
            SubnetId: event.dataAsset.workflow.dataset.connection.redshift.subnetId,
            SecurityGroupIdList: event.dataAsset.workflow.dataset.connection.redshift.securityGroupIdList,
            AvailabilityZone: event.dataAsset.workflow.dataset.connection.redshift.availabilityZone,
          },
				},
			};
			break;
		default:
			this.log.error(`Connection Type: ${connectionType} is not supported.`)

	}

    this.log.debug(`ConnectionTask > constructConnectionInputCommand > exit`);
    return input;
  }

  private async getRedshiftCredentials(
    secretName
  ): Promise<{ username: string; password: string }> {
    try {
      const response: GetSecretValueCommandOutput =
        await this.secretsManagerClient.send(
          new GetSecretValueCommand({
            SecretId: secretName,
          })
        );

      if (response.SecretString) {
        const secretValue = JSON.parse(response.SecretString);
        const username = secretValue.username;
        const password = secretValue.password;
        return { username, password };
      } else {
        throw new Error("Expected secret value to be a string");
      }
    } catch (error) {
      this.log.error(error, "Error retrieving secret");
      throw error;
    }
  }
}
