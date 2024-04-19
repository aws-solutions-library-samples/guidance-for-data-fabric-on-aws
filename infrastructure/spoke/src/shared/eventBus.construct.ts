import { Bus, OrganizationUnitPath } from "@df/cdk-common";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

export interface EventBusSpokeConstructProps {
  hubAccountId: string;
  orgPath: OrganizationUnitPath;
}

export class EventBusSpoke extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: EventBusSpokeConstructProps
  ) {
    super(scope, id);

    // DF Spoke Event Bus
    const dfSpokeEventBus = new Bus(this, "SpokeEventBus", true);

    // Allow hub account to put events to this event bus
    dfSpokeEventBus.eventBus.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowHubAccountToPutEvents",
        effect: iam.Effect.ALLOW,
        principals: [new iam.AccountPrincipal(props.hubAccountId)],
        actions: ["events:PutEvents"],
        resources: [dfSpokeEventBus.eventBus.eventBusArn],
        conditions: {
          "ForAnyValue:StringEquals": {
            "aws:PrincipalOrgPaths": `${props.orgPath.orgId}/${props.orgPath.rootId}/${props.orgPath.ouId}/`,
          },
        },
      })
    );
  }
}
