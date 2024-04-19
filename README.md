# Guidance for Data Fabric on AWS

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Deployment Steps](#deployment-steps)
4. [Deployment Validation](#deployment-validation)
5. [Running the Guidance](#running-the-guidance)
6. [Next Steps](#next-steps)
7. [Cleanup](#cleanup)

## Overview
The Guidance for Data Fabric on AWS is an opinionated data fabric implementation on AWS.

## Prerequisites

### Operating System

These deployment instructions are intended for use on MacOS. Deployment using a different operating system may require additional steps.

### Third-Party tools

1. [Rush](https://rushjs.io/)
2. [Node](https://nodejs.org/en/learn/getting-started/introduction-to-nodejs) 18.17 

### AWS Account Requirements

1. For this guidance, you will need to have or set up three accounts in the same AWS Organization.
    1. A management account where IAM Identity Center is enabled.
    2. A hub account where a DataZone domain will be created. This must be part of the same OU as the spoke account.
    3. A spoke account where data assets will reside. This must be part of the same OU as the hub account. You may set up multiple spoke accounts.
2. All resources in these accounts are assumed to be in the same region unless specified otherwise.
3. [Create a DataZone Domain](https://docs.aws.amazon.com/datazone/latest/userguide/create-domain.html)
    1. [Enable IAM Identity Center](https://docs.aws.amazon.com/datazone/latest/userguide/enable-IAM-identity-center-for-datazone.html) for DataZone
4. [Request association of the spoke account](https://docs.aws.amazon.com/datazone/latest/userguide/invite-account-to-associate.html) in the hub account for the DataZone domain and [accept the request in the spoke account](https://docs.aws.amazon.com/datazone/latest/userguide/accept-invitation-to-associate.html)
    1. Enable the Data Lake and Data Warehouse blueprints when accepting the request.
5. Create roles
    1. Create a role in the organization’s account where the IAM Identity Center instance is and save the role ARN for the deployment steps
        1. It should have the following trust policy:
            ```
            {
               "Version": "2012-10-17",
               "Statement": [
                  {
                        "Effect": "Allow",
                        "Principal": {
                           "AWS": [
                              "arn:aws:iam::<HUB_ACCOUNT_ID>:root"
                              ]
                        },
                        "Action": "sts:AssumeRole",
                        "Condition": {}
                  }
               ]
            }
            ```
        2. It should have the following permissions:
            ```
            {
               "Version": "2012-10-17",
               "Statement": [
                  {
                        "Effect": "Allow",
                        "Action": [
                           "identitystore:IsMemberInGroups",
                           "identitystore:GetUserId"
                        ],
                        "Resource": "*"
                  }
               ]
            }
            ```
    2. In your Spoke account create an IAM role to be used when creating assets in DF. You will pass the role’s Amazon Resource Name (ARN) to DF when you create assets. DF will pass this role to Glue and Glue DataBrew as needed.
        1. The role name must be prefixed with `df-`. This enables the role to be passed by DF.
        2. The trust policy is as follows:
            ```
            {
               "Version": "2012-10-17",
               "Statement": [
                  {
                        "Sid": "dataBrew",
                        "Effect": "Allow",
                        "Principal": {
                           "Service": "databrew.amazonaws.com"
                        },
                        "Action": "sts:AssumeRole"
                  },
                  {
                        "Sid": "glue",
                        "Effect": "Allow",
                        "Principal": {
                           "Service": "glue.amazonaws.com"
                        },
                        "Action": "sts:AssumeRole"
                  }
               ]
            }
            ```
        3. Add the following policies to the role
            1. [AWSGlueServiceRole](https://us-east-1.console.aws.amazon.com/iam/home?region=us-west-2#/policies/details/arn%3Aaws%3Aiam%3A%3Aaws%3Apolicy%2Fservice-role%2FAWSGlueServiceRole)
            2. [AWSGlueDataBrewServiceRole](https://us-east-1.console.aws.amazon.com/iam/home?region=us-west-2#/policies/details/arn%3Aaws%3Aiam%3A%3Aaws%3Apolicy%2Fservice-role%2FAWSGlueDataBrewServiceRole)
            3. [AmazonS3FullAccess](https://us-east-1.console.aws.amazon.com/iam/home?region=us-west-2#/policies/details/arn%3Aaws%3Aiam%3A%3Aaws%3Apolicy%2FAmazonS3FullAccess)
6. Generate and upload a certificate
    1. `openssl genrsa 2048 > my-aws-private.key`
    2. `openssl req -new -x509 -nodes -sha1 -days 3650 -extensions v3_ca -key my-aws-private.key > my-aws-public.crt`
        1. Leave all prompts blank except `Common Name (e.g. server FQDN or YOUR name) []:` can be set as  `df.amazonaws.com`.
    3. `aws acm import-certificate --certificate fileb://my-aws-public.crt --private-key fileb://my-aws-private.key --region <REGION> --profile <AWS_PROFILE>`
    4. Note the ARN that is returned. You will need to provide this as `loadBalancerCertificateArn` when deploying the hub infrastructure

### AWS CDK Bootstrap

The hub and spoke accounts must be [bootstrapped](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) for the [AWS Cloud Development Kit](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html).

1. `cdk bootstrap <HUB_ACCOUNT_ID>/<REGION> --profile <HUB_PROFILE>`
2. `cdk bootstrap <SPOKE_ACCOUNT_ID>/<REGION> --profile <SPOKE_PROFILE>`

### Service limits

## Deployment Steps

### Pre-Deployment Steps

1. Create your first DataZone project.
2. Create DataZone environments.
    1. Create a Data Warehouse environment in the newly created project
        1. [Create a Redshift Serverless data warehouse](https://docs.aws.amazon.com/redshift/latest/gsg/new-user-serverless.html#serverless-console-resource-creation) in the spoke account with the following settings:
            1. Customize admin user credentials
                1. Manage admin credentials in AWS Secrets Manager
            2. Select private subnets
            3. Enhanced VPC routing on
        2. Go to Secrets Manager and open the secret that was created for your new data warehouse.
            1. Add the following tags:
                1. AmazonDataZoneDomain
                    1. Key: AmazonDataZoneDomain
                    2. Value: `<DATAZONE_DOMAIN_ID>`
                2. AmazonDataZoneProject
                    1. Key: AmazonDataZoneProject
                    2. Value: `<DATAZONE_PROJECT_ID>`
        3. Create VPC endpoints in the VPC and private subnets where redshift is deployed
            1. S3 gateway
            2. Glue
            3. Databrew
        4. [Create a DataZone data warehouse environment](https://docs.aws.amazon.com/datazone/latest/userguide/create-new-environment.html) for the newly created Redshift resources.
    2. [Create a Data Lake Environment](https://docs.aws.amazon.com/datazone/latest/userguide/create-new-environment.html) in the newly created project
3. Go to AWS Lake Formation in the console of the spoke account
    1. Make sure you are an Admin along with the CDK execution role.
        1. If this is your first time going to LakeFormation, there will be a prompt to “Add myself”, select that box. Also select the box that says “Add other AWS users or roles”. Select the CDK CloudFormation execution role. It will begin with: `cdk-<ID>cfn-exec-role` and click “Get Started”.
        2. If you have previously used LakeFormation, add them under the **Administrative roles and tasks** section under the **Administration** section

### Deployment Steps
We will need to deploy the hub stack in three separate steps

#### Step 1: **Setup the shared stack**
**_Note:_** this step only needs to be performed once for the initial deployment
1. `git clone git@github.com:aws-solutions-library-samples/guidance-for-data-fabric-on-aws.git`
2. `cd guidance-for-data-fabric-on-aws`
3. Install dependencies `rush update --bypass-policy`
4. Build `rush build`
5. `cd infrastructure/hub`
6. [Export credentials for the hub account and the AWS region to the environment](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html)
7. Deploy `npm run cdk -- deploy --require-approval never --concurrency=10 -c identityStoreId=<IAM_IDENTITY_CENTER_IDENTITY_STORE_ID> -c identityStoreRoleArn=<IAM_IDENTITY_CENTER_ROLE_ARN> -c identityStoreRegion=<IDENTITY_STORE_REGION> -c ssoRegion=<SSO_REGION> -c orgId=<AWS_ORGANIZATIONS_ORG_ID> -c orgRootId=<AWS_ORGANIZATIONS_ROOT_ID> -c orgOuId=<AWS_ORGANIZATIONS_OU_ID> -c ssoInstanceArn=<AWS_IDENTITY_CENTER_INSTANCE_ARN> -c adminEmail=<ADMIN_EMAIL> --all`
#### Step 2: **Configure IAM Identity Center**
**_Note:_** this step only needs to be performed once for the initial deployment
1. Open the IAM Identity Center console and then, from the navigation pane, choose Applications.
    2. Choose Add application, I have an application I want to set up, and Add custom SAML 2.0 application, and then choose Next.
    3. On the Configure application page, enter a Display name and a Description.
    4. Copy the URL of the IAM Identity Center SAML metadata file. You use these resources in later steps to create an IdP in a user pool.
    5. Under Application metadata, choose Manually type your metadata values. Then provide the following values.
    6. Important: Make sure to replace the domain, region, and userPoolId values with information you gather after the CDK deployment.
         - Application Assertion Consumer Service (ACS) URL: `<userPoolDomain>/saml2/idpresponse`
         - Application SAML audience: `urn:amazon:cognito:sp:<userPoolId>`
    7. Choose Submit. Then, go to the Details page for the application that you added.
    8. Select the **Actions** dropdown list and choose **Edit attribute mappings**. Then, provide the following attributes.
         - User attribute in the application: `Subject`
            - Note: Subject is prefilled.
            - Maps to this string value or user attribute in IAM Identity Center: `${user:subject}`
            - Format: `Persistent`
      
         - User attribute in the application: `email`
            - Maps to this string value or user attribute in IAM Identity Center: `${user:email}`
            - Format: `Basic`
#### Step 3: **Redeploy the hub stack**
1. Redeploy `npm run cdk -- deploy --require-approval never --concurrency=10 -c identityStoreId=<IAM_IDENTITY_CENTER_IDENTITY_STORE_ID> -c identityStoreRoleArn=<IAM_IDENTITY_CENTER_ROLE_ARN> -c identityStoreRegion=<IDENTITY_STORE_REGION> -c ssoRegion=<SSO_REGION> -c orgId=<AWS_ORGANIZATIONS_ORG_ID> -c orgRootId=<AWS_ORGANIZATIONS_ROOT_ID> -c orgOuId=<AWS_ORGANIZATIONS_OU_ID> -c ssoInstanceArn=<AWS_IDENTITY_CENTER_INSTANCE_ARN> -c samlMetaDataUrl=<SAML_METADATA_URL> -c callbackUrls=http://localhost:3000 -c adminEmail=<ADMIN_EMAIL> -c loadBalancerCertificateArn=<LOAD_BALANCER_CERTIFICATE_ARN> --all`

#### Deploy the spoke stack
1. `cd ../spoke`
2. [Export credentials for the spoke account and the AWS region to the environment](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html)
3. `npm run cdk -- deploy -c hubAccountId=<HUB_ACCOUNT_ID> -c orgId=<AWS_ORGANIZATIONS_ORG_ID> -c orgRootId=<AWS_ORGANIZATIONS_ROOT_ID> -c orgOuId=<AWS_ORGANIZATIONS_OU_ID> -c deleteBucket=true --require-approval never --concurrency=10 --all`

### Post-Deployment Steps

1. Open the AWS Lake Formation console in the spoke account
    1. Go to the `df-spoke-<SPOKE_ACCOUNT_ID>-<REGION>` database
    2. Click **Edit** and uncheck the “Use only IAM access control for new tables in this database” and click **Save**.
    3. Click **Actions/permissions/view**
        1. Select **IAMAllowedPrincipals** and click **Revoke**
    4. Click **Actions/permissions/Grant**
        1. For each of the following, you will need to click through and grant the permissions
            1. [DataZone database access](https://docs.aws.amazon.com/datazone/latest/userguide/lake-formation-permissions-for-datazone.html)
                1. Principals
                    1. IAM users and roles: `AmazonDataZoneGlueAccess-<REGION>-<DOMAIN_ID>`
                2. LF-Tags or catalog resources
                    1. Select **Named Data Catalog resources**
                    2. Databases: `df-spoke-<SPOKE_ACCOUNT_ID>-<REGION>`
                3. Database permissions:
                    1. Database permissions: `Describe`
                    2. Grantable permissions: `Describe`
            2. [DataZone table access](https://docs.aws.amazon.com/datazone/latest/userguide/lake-formation-permissions-for-datazone.html)
                1. Principals
                    1. IAM users and roles: `AmazonDataZoneGlueAccess-<REGION>-<DOMAIN_ID>`
                2. LF-Tags or catalog resources
                    1. Select **Named Data Catalog resources**
                    2. Databases: `df-spoke-<SPOKE_ACCOUNT_ID>-<REGION>`
                    3. Tables: All tables
                3. Table permissions:
                    1. Table permissions: `Describe`, `Select`
                    2. Grantable permissions: `Describe`, `Select`
            3. Service role database access
                1. Principals
                    1. IAM users and roles: `<SERVICE_ROLE>`
                2. LF-Tags or catalog resources
                    1. Select **Named Data Catalog resources**
                    2. Databases: `df-spoke-<SPOKE_ACCOUNT_ID>-<REGION>`
                3. Database permissions:
                    1. Database permissions: `Create table`, `Describe`
                    2. Grantable permissions: None
            4. Service role table access
                1. Principals
                    1. IAM users and roles: `<SERVICE_ROLE>`
                2. LF-Tags or catalog resources
                    1. Select **Named Data Catalog resources**
                    2. Databases: `df-spoke-<SPOKE_ACCOUNT_ID>-<REGION>`
                    3. Tables: All tables
                3. Table permissions:
                    1. Table permissions: `Alter`, `Describe`, `Insert`, `Select`
                    2. Grantable permissions: None
    5. Add the S3 bucket as a data location
        1. Go to **Data lake locations**
        2. Click **Register location**
        3. Enter the `df-spoke-<SPOKE_ACCOUNT_ID>-<REGION>` location
        4. Switch **Permission mode** to **Lake Formation**
        5. Click **Register Location**
    6. Grant the service role access to the data location
        1. Go to **Data locations**
        2. Click **Grant**
        3. Select the service role created earlier
        4. Enter the `df-spoke-<SPOKE_ACCOUNT_ID>-<REGION>` location for **Storage locations**
        5. Click **Grant**
2. Sign in to DataZone with the user that you will be making API calls with
    1. Create a user in IAM Identity center in the Management account
        1. Go to IAM Identity Center in the console in the Management account
        2. Click Users
        3. Click Add User and follow the prompts
        4. You should get an email to set up your new user. Follow the prompts in the email to complete setup.
    2. Assign the user you created to the custom application
        1. Go to IAM Identity Center in the console in the Management account
        2. Click Applications
        3. Click Customer Managed
        4. Click on the customer application that was created earlier
        5. Click Assign users and groups and assign your user
    3. Sign into DataZone with your SSO user
        1. Go to IAM Identity Center in the Management account
        2. Under **Settings summary**, open the **AWS access portal URL**
        3. Sign in with your new user.
        4. Click on the DataZone application to open the UI. Click **Sign in with SSO**. This step is needed to get DataZone to recognize your user ID.

## Deployment Validation

1. Check that the following CloudFormation stacks have been successfully created in the spoke account:
    1. `df-spoke-shared`
    2. `df-spoke-dataAsset`
2. Check that the following CloudFormation stacks have been successfully created in the hub account:
    1. `df-hub-shared`
    2. `df-hub-CognitoCustomStack`
    3. `df-hub-SsoCustomStack`
    4. `df-hub-datalineage`
    5. `df-hub-dataAsset`

## Running the Guidance

### Creating Assets

The following outlines steps to be done to create an asset using the Data Asset API. Below this are examples using a simple sample dataset.

1. Generate a token
    1. Go to Amazon Cognito in the Hub account
    2. Select the `df` user pool
    3. Click **App Integration**
    4. Scroll the the bottom of the page and select `df-sso-client` from the App client list
    5. Scroll to the Hosted UI section and click View Hosted UI
    6. Log in with your configured IAM Identity Center User
    7. You should be redirected to localhost in your browser
    8. Copy the url from your browser into a text editor
    9. It should take the form of `localhost:3000/#access_token=<ACCESS_TOKEN>&id_token=<ID_TOKEN>&token_type=Bearer&expires_in=3600`
    10. Copy the ID token, which should be valid for 1 hour. You can click through the hosted UI again to generate a new token.
2. Open an API client of your choice
    1. Go to AWS Systems Manager Parameter Store and open the `/df/dataAsset/apiUrl` parameter. This is the API URL.
    2. Configure the client as follows:
        1. Method `POST` 
        2. URL:  `<API_URL>dataAssetTasks`
        3. Auth: Bearer token generated above
        4. Headers:
            1. `accept-version`: `1.0.0`
            2. `accept`: `application/json`
        5. Body:
           ```  
            {
               "catalog": {
                  "domainId": "<DATAZONE_DOMAIN_ID>",
                  "domainName": "<DATAZONE_DOMAIN_NAME>",
                  "environmentId": "<DATAZONE_ENVIRONMENT_ID>",
                  "projectId": "<DATAZONE_PROJECT_ID>",
                  "region": "<REGION>",
                  "assetName": "my-asset",
                  "accountId": "<SPOKE_ACCOUNT_ID>",
                  "autoPublish": true,
                  "revision": 1
               },
               "workflow": <SEE_BELOW>
            }
            ```
        6. Run the request
        7. Check that the Step Functions have completed successfully.
            1. Go to the AWS Console in the hub account and look at the `df-data-asset` State Machine in AWS Step Functions. You should see a successful an execution running.
            2. Go to the AWS Console in the spoke account and look at the `df-spoke-data-asset` State Machine in AWS Step Functions. You should see an execution running.
            3. Once the executions complete, you should be able to[find the new assets in the DataZone data catalog](https://docs.aws.amazon.com/datazone/latest/userguide/search-for-data.html).

#### Sample Dataset

A simple sample dataset file can be found [in docs/sample_data/sample_products.csv](./docs/sample_data/sample_products.csv). Below are a few sample rows:

| sku     | units | weight | cost    |
| ------- | ------| ------ | ------- |
| Alpha   | 104   | 8      | 846.00  |
| Bravo   | 102   | 5      | 961.00  |
| Charlie | 155   | 4      | 472.00  |

These rows represent a table of product names, the number of units in inventory, their weight, and their cost. Below we will add this data as assets in the data fabric using the Data Asset API. There is an example of creating a Glue table asset backed by S3 or a Redshift table. Both of these assets will be managed assets in DataZone meaning other users of DataZone can subscribe to and consume these when published.

#### Glue Tables

1. Load the CSV file into the `df-spoke-<SPOKE_ACCOUNT_ID>-<REGION>` S3 bucket
2. Make an API request replacing the request body `workflow` with:
   ```
    {
        "name": "sample-products-workflow",
        "roleArn": "<SERVICE_ROLE_ARN>",
        "dataset": {
            "name": "sample-products-dataset",
            "format": "csv",
            "connection": {
                "dataLake": {
                    "s3": {
                    "path": "s3://<S3 PATH>/sample_products.csv",
                    "region": "<REGION>"
                    }
                }
            }
        },
        "transforms": {
            "recipe": {
            "steps": [
                {
                    "Action": {
                        "Operation": "LOWER_CASE",
                        "Parameters": {
                            "sourceColumn": "sku"
                        }
                    }
                }
            ]
            }
        },
        "dataQuality": {
            "ruleset": "Rules = [ (ColumnValues \"units\" >= 0) ]"
        }
    }
   ```

This workflow includes a transform and a user-defined data quality check. The transform takes the form of a Glue DataBrew recipe. In this case the transform converts the product names in the `sku` column to lowercase. The data quality check will define and run a Glue Data Quality check and include the results of the check in the metadata of the asset created in Data Zone. In this case the data quality check will ensure the `units` column contains non-negative values.

#### Redshift Tables

1. Load a table into your Redshift data warehouse.
2. Make an API request with the following request body `workflow`:
   ```
    {
        "name": "sample-products-redshift-workflow",
        "roleArn": "<SERVICE_ROLE_ARN>",
        "dataset": {
            "name": "sample-products-redshift-dataset",
            "format": "csv",
            "connection": {
                "redshift": {
                    "secretArn": "REDSHIFT_ADMIN_SECRET_ARN",
                    "jdbcConnectionUrl": "REDSHIFT_CONNECTION_URL",
                    "subnetId": "REDSHIFT_SUBNET_ID",
                    "securityGroupIdList": ["REDSHIFT_SG_ID"],
                    "availabilityZone": "REDSHIFT_AZ",
                    "path": "<DB_NAME>/<SCHEMA_NAME>/sample_product_table",
                    "databaseTableName": "<SCHEMA_NAME>.sample_product_table",
                    "workgroupName": "REDSHIFT_WORKGROUP_NAME"
                }
            }
        }
    }
   ```
This workflow does not include a transform or user-defined data quality check as in the Glue Table example above. These can be added to the request if desired.

### Viewing Assets
After the data asset workflow completes a new data asset will be published to the fabric.
#### Catalog
The data fabric catalog can be searched within Amazon DataZone. See the [documentation](https://docs.aws.amazon.com/datazone/latest/userguide/search-for-data.html) for more information.

#### Lineage
You can view the lineage information from the Marquez portal or the Marquez API. The location of these endpoints can be found in the following SSM parameters `/df/dataLineage/openLineageApiUrl` and `/df/dataLineage/openLineageWebUrl`.

## Next Steps

1. Customers can bring their own tools for profiling/quality, etc. to the Data Fabric.
2. Customers can attach into *DF message bus (EventBridge) to trigger any other processes that need to be added.
3. Customers can author their own data products. See the [Guidance for Sustainability Data Fabric on AWS](https://github.com/aws-solutions-library-samples/guidance-for-sustainability-data-fabric-on-aws) for an example data product implementation. If you would like to develop your own data product, see the guide on [Authoring Your Own Data Product](./docs/tutorials/dataProduct/README.md).

## Cleanup

1. Go to the CloudFormation console in the spoke account and delete all stacks prefixed by `df-spoke`.
2. Go to the CloudFormation console in the hub account and delete all stacks prefixed by `df-hub`.

## Notices

*Customers are responsible for making their own independent assessment of the information in this Guidance. This Guidance: (a) is for informational purposes only, (b) represents AWS current product offerings and practices, which are subject to change without notice, and (c) does not create any commitments or assurances from AWS and its affiliates, suppliers or licensors. AWS products or services are provided “as is” without warranties, representations, or conditions of any kind, whether express or implied. AWS responsibilities and liabilities to its customers are controlled by AWS agreements, and this Guidance is not part of, nor does it modify, any agreement between AWS and its customers.*
