import { dfEventBusArn, dfEventBusName, OrganizationUnitPath } from '@df/cdk-common';
import { CfnEventBusPolicy, EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { EventBus as EventBusTarget } from 'aws-cdk-lib/aws-events-targets';
import { Stack } from 'aws-cdk-lib';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

// import { NagSuppressions } from 'cdk-nag';

import { Effect} from 'aws-cdk-lib/aws-iam';
import { DATA_ASSET_HUB_EVENT_SOURCE, DATA_ASSET_HUB_CREATE_REQUEST_EVENT } from '@df/events';

export type DataAssetConstructProperties = {
    moduleName: string;
    eventBusName: string;
    hubAccountId: string;
    orgPath: OrganizationUnitPath
};

export class DataAsset extends Construct {

    constructor(scope: Construct, id: string, props: DataAssetConstructProperties) {
      super(scope, id);

      const accountId = Stack.of(this).account;
      const region = Stack.of(this).region;

      const spokeEventBus = EventBus.fromEventBusName(this, "SpokeEventBus", props.eventBusName);
      const hubEventBus = EventBus.fromEventBusArn(this, "HubEventBus", dfEventBusArn(props.hubAccountId, region));

      // Add eventBus Policy for incoming job events
      new CfnEventBusPolicy(this, "JobEventBusPutEventPolicy", {
        eventBusName: dfEventBusName,
        statementId: "AllowOrgAccountsToPutJobEvents",
        statement: {
          Effect: Effect.ALLOW,
          Action: ["events:PutEvents"],
          Resource: [
            `arn:aws:events:${region}:${accountId}:event-bus/${dfEventBusName}`,
          ],
          Principal: "*",
          Condition: {
            StringEquals: {
              "events:source": [DATA_ASSET_HUB_EVENT_SOURCE],
              "events:detail-type": [DATA_ASSET_HUB_CREATE_REQUEST_EVENT],
            },
            "ForAnyValue:StringEquals": {
              "aws:PrincipalOrgPaths": `${props.orgPath.orgId}/${props.orgPath.rootId}/${props.orgPath.ouId}/`,
            },
          },
        },
      });

      // Create resources which enable the spoke account to subscribe to job events from the hub

      // Add role in this spoke account which will be used by the target in the hub account to publish hub events to this spoke bus
      const dfSpokeSubscriptionRuleTargetRole = new Role(
        this,
        "DfSpokeSubscriptionRuleTargetRole",
        {
          roleName: "DfSpokeSubscriptionRuleTargetRole",
          assumedBy: new ServicePrincipal("events.amazonaws.com"),
        }
      );
      spokeEventBus.grantPutEventsTo(dfSpokeSubscriptionRuleTargetRole);

      // Add rule and target to hub bus to subscribe to job events
      const spokeSubscriptionRule = new Rule(
        this,
        'SpokeSubscriptionRule',
        {
          eventBus: hubEventBus,
          eventPattern: {
            detailType: [DATA_ASSET_HUB_CREATE_REQUEST_EVENT],
            source: [DATA_ASSET_HUB_EVENT_SOURCE],
          },
        }
      );

      spokeSubscriptionRule.addTarget(
        new EventBusTarget(spokeEventBus, {
          role: dfSpokeSubscriptionRuleTargetRole,
        })
      );
    }
}
