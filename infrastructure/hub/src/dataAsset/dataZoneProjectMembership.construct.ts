import type {  CreateProjectMembershipCommandInput } from '@aws-sdk/client-datazone';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface DataZoneProjectMembershipProps {
  /**
   * The ID of the Amazon DataZone domain in which this project is created.
   */
  readonly domainId: string;

  /**
   * The ID of the Amazon DataZone project.
   */
  readonly projectId: string;

  /**
   * The ID of the User to add as a member of the project.
   */
  readonly userId: string;
}

export class DataZoneProjectMembership extends Construct {

  constructor(scope: Construct, id: string, props: DataZoneProjectMembershipProps) {
    super(scope, id);

    new cr.AwsCustomResource(this, 'DataZoneProjectMembership', {
      resourceType: 'Custom::DataZoneProjectMembership',
      onCreate: {
        service: 'datazone',
        action: 'CreateProjectMembership',
        parameters: {
            domainIdentifier: props.domainId,
            projectIdentifier: props.projectId,
            member: {
              userIdentifier: props.userId
            },
            designation: "PROJECT_OWNER"
        } as CreateProjectMembershipCommandInput,
        physicalResourceId: cr.PhysicalResourceId.of(`${props.domainId}/${props.projectId}/${props.userId}`),
      },
    //   onDelete: {
    //     service: 'datazone',
    //     action: 'DeleteProjectMembership',
    //     parameters: {
    //         domainIdentifier: props.domainId,
    //         projectIdentifier: props.projectId,
    //         member: {
    //           userIdentifier: props.userId
    //         }
    //     } as DeleteProjectMembershipCommandInput,
    //   },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
  }
}