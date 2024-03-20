import type { CreateFormTypeCommandInput, DeleteFormTypeCommandInput, FormTypeStatus } from '@aws-sdk/client-datazone';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';


export interface DataZoneFormTypeProps {
  /**
   * The ID of the Amazon DataZone domain in which this form type is created.
   */
  readonly domainId: string;

  /**
   * The project ID of the Amazon DataZone project in which this form type is created.
   */
  readonly owningProjectIdentifier: string;

  /**
   * The name of the Amazon DataZone form type.
   */
  readonly name: string;

  /**
   * The model of the Amazon DataZone form type. This parameter is not typed. It is recommended
   * to create a Form Type manually and to call the Get Form Type command from the CLI to get
   * this value: https://awscli.amazonaws.com/v2/documentation/api/latest/reference/datazone/get-form-type.html
   */
  readonly model: {smithy: string};

  /**
   * The description of the Amazon DataZone form type.
   */
  readonly description?: string;

  /**
   * The status fo the Amazon DataZone form type.
   * NOTE: Deletion of the Form Type will fail if this is set to 'ENABLED'.
   */
  readonly status?: FormTypeStatus;
}

export class DataZoneFormType extends Construct {

  constructor(scope: Construct, id: string, props: DataZoneFormTypeProps) {
    super(scope, id);

    new cr.AwsCustomResource(this, 'DataZoneFormType', {
      resourceType: 'Custom::DataZoneFormType',
      onCreate: {
        service: 'datazone',
        action: 'CreateFormType',
        parameters: {
            domainIdentifier: props.domainId,
            name: props.name,
            model: props.model,
            owningProjectIdentifier: props.owningProjectIdentifier,
            description: props.description,
            status: props.status,
        } as CreateFormTypeCommandInput,
        physicalResourceId: cr.PhysicalResourceId.fromResponse('name'),
      },
      onUpdate: {
        service: 'datazone',
        action: 'CreateFormType',
        parameters: {
            domainIdentifier: props.domainId,
            name: props.name,
            model: props.model,
            owningProjectIdentifier: props.owningProjectIdentifier,
            description: props.description,
            status: props.status,
        } as CreateFormTypeCommandInput,
        physicalResourceId: cr.PhysicalResourceId.fromResponse('name'),
      },
      onDelete: {
        service: 'datazone',
        action: 'DeleteFormType',
        parameters: {
            domainIdentifier: props.domainId,
            formTypeIdentifier: new cr.PhysicalResourceIdReference().toString(),
        } as DeleteFormTypeCommandInput,
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
  }
}