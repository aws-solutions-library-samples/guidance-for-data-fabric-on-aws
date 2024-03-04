import { Bus, eventBusHubReplicationRuleTargetRoleArn} from "@df/cdk-common";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

export interface EventBusSpokeConstructProps {
  hubAccountId: string;
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

    // Allow hub account role to put events to this event bus
    dfSpokeEventBus.eventBus.addToResourcePolicy(new iam.PolicyStatement({
      sid: "AllowHubAccountToPutEvents",
      effect: iam.Effect.ALLOW,
      principals: [new iam.ArnPrincipal(eventBusHubReplicationRuleTargetRoleArn(props.hubAccountId))],
      actions: ["events:PutEvents"],
      resources: [dfSpokeEventBus.eventBus.eventBusArn],
    }));

    
  }
}
