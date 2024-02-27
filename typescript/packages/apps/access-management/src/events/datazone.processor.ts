import { FastifyBaseLogger } from "fastify";
import type {
  DataZoneSubscriptionEventDetail,
  DfEventDetail,
  DfForm,
} from "./models";
import { DataZoneClient, GetListingCommand } from "@aws-sdk/client-datazone";
import {
  EventBridgeClient,
  PutEventsCommand,
  PutEventsRequestEntry,
} from "@aws-sdk/client-eventbridge";
import {
  DFEventDetailType,
  DFEventSource,
  dfEventBusName,
} from "@df/cdk-common";

export class DataZoneEventProcessor {
  constructor(
    private readonly logger: FastifyBaseLogger,
    private readonly dataZoneClient: DataZoneClient,
    private readonly eventBridgeClient: EventBridgeClient
  ) {}

  public async processSubscriptionCreatedEvent(
    subscriptionEventDetail: DataZoneSubscriptionEventDetail
  ): Promise<void> {
    this.logger.debug(
      `DataZoneEventProcessor > processSubscriptionCreatedEvent > subscriptionEventDetail: ${JSON.stringify(
        subscriptionEventDetail
      )}`
    );

    this.assertIsProjectSubscriber(subscriptionEventDetail);
    const enrichedEvent = await this.createEnrichedSubscriptionEvent(
      subscriptionEventDetail
    );
    await this.writeToEventBridge(enrichedEvent);

    this.logger.debug(
      `DataZoneEventProcessor > processSubscriptionCreatedEvent > exit`
    );
  }

  private assertIsProjectSubscriber(event: DataZoneSubscriptionEventDetail) {
    if (event.data.subscribedPrincipal.type !== "PROJECT") {
      throw new Error("Expected to find a project subscriber.");
    }
  }

  private validateDfMetadataForm(rawForm: any): DfForm {
    this.logger.debug(
      `DataZoneEventProcessor > validateDfMetadataForm > rawForm: ${JSON.stringify(
        rawForm
      )}`
    );
    if (!rawForm.arn) {
      throw new Error("Expected to find DF metadata form with an arn.");
    }
    if (!rawForm.accountId) {
      throw new Error("Expected to find DF metadata form with an accountId.");
    }
    this.logger.debug(
      `DataZoneEventProcessor > validateDfMetadataForm > exit`
    );
    return rawForm;
  }

  public async getAssetMetadataForm(
    domainId: string,
    subscribedListingId: string
  ): Promise<DfForm> {
    this.logger.debug(
      `DataZoneEventProcessor > getAssetMetadataForm > domainId: ${domainId}, subscribedListingId: ${subscribedListingId}`
    );

    try {
      const response = await this.dataZoneClient.send(
        new GetListingCommand({
          domainIdentifier: domainId,
          identifier: subscribedListingId,
        })
      );
      const metadataForms = JSON.parse(response.item.assetListing.forms);
      const dfS3AssetForm = metadataForms["df_s3_asset_form"];
      const validatedForm = this.validateDfMetadataForm(dfS3AssetForm);
      this.logger.debug(`DataZoneEventProcessor > getAssetMetadataForm > exit`);
      return validatedForm;
    } catch (err) {
      throw new Error(
        `getAssetMetadataForm failed for domainId: ${domainId} and subscribedListingId: ${subscribedListingId} with error: ${err}`
      );
    }
  }

  private async createEnrichedSubscriptionEvent(
    event: DataZoneSubscriptionEventDetail
  ): Promise<PutEventsRequestEntry> {
    this.logger.debug(
      `DataZoneEventProcessor > createEnrichedSubscriptionEvent > event: ${JSON.stringify(
        event
      )}`
    );
    const domainId = event.metadata.domain;
    const subscribedListingId = event.data.subscribedListing.id;

    // const assetId = await this.getAssetId(domainId, owningProjectId, subscribedListingId);
    const s3MetadataForm = await this.getAssetMetadataForm(
      domainId,
      subscribedListingId
    );

    const eventDetail: DfEventDetail = {
      ...event,
      dfData: {
        assetDetail: {
          assetArn: s3MetadataForm.arn,
          type: "S3",
        },
        hubAccountId: event.metadata.awsAccountId,
        spokeAccountId: s3MetadataForm.accountId,
        subscribedProjectId: event.data.subscribedPrincipal.id,
        subscriptionId: event.data.subscriptionRequestId,
      },
    };
    const completeEvent = {
      Time: new Date(),
      Source: DFEventSource.SUBSCRIPTION_ENRICHMENT,
      DetailType: DFEventDetailType.ENRICHED_SUBSCRIPTION_CREATED,
      Detail: JSON.stringify(eventDetail),
      EventBusName: dfEventBusName,
    };
    this.logger.debug(
      `DataZoneEventProcessor > createEnrichedSubscriptionEvent > exit`
    );
    return completeEvent;
  }

  private async writeToEventBridge(
    event: PutEventsRequestEntry
  ): Promise<void> {
    this.logger.debug(
      `DataZoneEventProcessor > writeToEventBridge > event: ${JSON.stringify(
        event
      )}`
    );
    try {
      await this.eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [event],
        })
      );
    } catch (err) {
      throw new Error(
        `DataZoneEventProcessor > writeToEventBridge failed with error: ${err}`
      );
    }
  }
}
