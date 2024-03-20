import type { CreateProjectCommandInput, DeleteProjectCommandInput } from '@aws-sdk/client-datazone';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface DataZoneProjectProps {
  /**
   * The ID of the Amazon DataZone domain in which this project is created.
   */
  readonly domainId: string;

  /**
   * The name of the Amazon DataZone project.
   */
  readonly name: string;

  /**
   * The description of the Amazon DataZone project.
   */
  readonly description?: string;

  /**
   * The glossary terms that can be used in this Amazon DataZone project.
   */
  readonly glossaryTerms?: string[];

  /**
   * Optional flag to asynchronously delete child entities within the project.
   */
  readonly skipDeletionCheck?: boolean;
}

export class DataZoneProject extends Construct {
  public readonly domainId: string;
  public readonly projectName: string;
  public readonly projectId: string;


  constructor(scope: Construct, id: string, props: DataZoneProjectProps) {
    super(scope, id);

    const customResource = new cr.AwsCustomResource(this, 'DataZoneProject', {
      resourceType: 'Custom::DataZoneProject',
      onCreate: {
        service: 'datazone',
        action: 'CreateProject',
        parameters: {
          domainIdentifier: props.domainId,
          name: props.name,
          description: props.description,
          glossaryTerms: props.glossaryTerms,
        } as CreateProjectCommandInput,
        physicalResourceId: cr.PhysicalResourceId.fromResponse('id'),
      },
      onDelete: {
        service: 'datazone',
        action: 'DeleteProject',
        parameters: {
          domainIdentifier: props.domainId,
          identifier: new cr.PhysicalResourceIdReference().toString(),
          skipDeletionCheck: props.skipDeletionCheck || false,
        } as DeleteProjectCommandInput,
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    this.domainId = props.domainId;
    this.projectName = props.name;
    this.projectId = customResource.getResponseField('id');
  }
}