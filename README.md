# df-core

df-core is a monorepo project that implements a data fabric on AWS. It is managed by Rush, and infrastructure is deployed using the AWS Cloud Development Kit (CDK).

## Structure

The project is structured as a monorepo with the following folders:

- `infrastructure`: Contains infrastructure-as-code (IaC) for deploying the data fabric.
  - `hub`: CDK app for deploying resources in the hub account.
  - `spoke`: CDK app for deploying resources in the spoke accounts.
- `typescript/packages`: Contains the TypeScript code.
  - `apps`: Applications and services.
  - `libraries`: Shared libraries and utilities.

### Hub Account

The hub account is where the Amazon DataZone domain is deployed. It acts as a central management point for the data fabric.

### Spoke Accounts

The spoke accounts are where the data assets reside. The spoke infrastructure needs to be deployed in each spoke account that will be used with the data fabric.

## Prerequisites

- [Rush](https://rushjs.io/): A monorepo manager for building and publishing JavaScript packages.
- [AWS CDK](https://aws.amazon.com/cdk/): An infrastructure-as-code framework for deploying AWS resources.
- [AWS Organizations](https://aws.amazon.com/organizations/): The hub and spoke account(s) must be part of the same AWS Organization.

## Account Setup

1. **IAM Identity Center**: Create an IAM Identity Center instance. This is required for authentication and authorization.
   - If the IAM Identity Center instance is created in a different account than the hub account, create a role in the hub account to access it.
      - TODO: Details of that role

2. **SSL Certificate**: Upload an SSL certificate to AWS Certificate Manager (ACM) in the hub account. This is required for configuring the Application Load Balancer with Cognito.
   - To generate a self-signed certificate and upload it to ACM, follow these steps:
     1. Generate a private key:
        ```
        openssl genrsa 2048 > my-aws-private.key
        ```
     2. Generate the certificate using the private key from the previous step:
        ```
        openssl req -new -x509 -nodes -sha1 -days 3650 -extensions v3_ca -key my-aws-private.key > my-aws-public.crt
        ```
     3. Install the AWS CLI and set up your AWS credentials.
     4. Upload the generated certificate and private key to ACM:
        ```
        aws acm import-certificate --certificate file://my-aws-public.crt --private-key file://my-aws-private.key --region <your-aws-region>
        ```

3. **Organization Setup**: Ensure that the hub and spoke accounts are part of the same AWS Organization.
   - Configure the necessary organizational units (OUs) and service control policies (SCPs) as needed.
4. **DataZone**: An Amazon DataZone domain must be created in the hub account. It needs to be be linked to the same IAM Identity Center Identity Store as the one used with Cognito.
   1. Users of in Amazon DataZone must be members of the projects that they intend to use with the API.

5. TODO: Lakeformation setup
6. TODO: Soft Limit increases

## Data Asset Prerequisites

### Redshift

- Amazon Redshift Serverless is recommended.
- TODO: Additional redshift requirements
- Data assets will be stored as Redshift tables.

### S3

- Amazon S3 objects can be used as data assets. They will be published as AWS Glue Table assets.

## Using the API

Users who need to access the API must be registered as users with the IAM Identity Center instance.

- TODO: Add token generation instructions
- TODO: Add postman (or similar) collection info

## Deployment

### Prerequisites

- Install the required dependencies by running `rush update`.
- Set the necessary AWS credentials (access key, secret access key, session token, and region) in your environment.

### Building

- To rebuild all packages, run `rush rebuild`.

### Deploying the Hub

1. **Upload SSL Certificate to ACM**:
   - Follow the provided instructions in Account Setup to generate a self-signed certificate and upload it to ACM in the hub account.

2. **Deploy the Shared Hub Infrastructure**:
   - Ensure your environment credentials are configured for the spoke account and run the following CDK command to deploy the shared infrastructure needed for integrating with IAM Identity Center:
   
     ```
     cd infrastructure/hub
     npm run cdk -- deploy \
     --require-approval never --concurrency=10 \
     -c identityStoreId=<Identity Store ID> \
     -c orgId=<AWS Organization ID> \
     -c orgRootId=<AWS Organization Root ID> \
     -c orgOuId=<AWS Organization OU ID>
     ```

3. **Configure IAM Identity Center**: Follow the provided steps to configure IAM Identity Center and set up a SAML 2.0 application.
   Note: this step only needs to be performed once for the initial deployment    

   1.    Open the IAM Identity Center console and then, from the navigation pane, choose Applications.

   2.    Choose Add application and Add custom SAML 2.0 application, and then choose Next.

   3.    On the Configure application page, enter a Display name and a Description.

   4.    Copy the URL of the IAM Identity Center SAML metadata file. You use these resources in later steps to create an IdP in a user pool.

   5.    Under Application metadata, choose Manually type your metadata values. Then provide the following values.

   Important: Make sure to replace the domain, region, and userPoolId values with information ypu gather after the CDK deployment.
   ```
   Application Assertion Consumer Service (ACS) URL: https://<domain>.auth.<region>.amazoncognito.com/saml2/idpresponse
   Application SAML audience: urn:amazon:cognito:sp:<userPoolId>
   ```

   6.    Choose Submit. Then, go to the Details page for the application that you added.

   7.    Select the Actions dropdown list and choose Edit attribute mappings. Then, provide the following attributes.
   ```
   User attribute in the application: subject
   Note: subject is prefilled.
   Maps to this string value or user attribute in IAM Identity Center: ${user:subject}
   Format: Persistent

   User attribute in the application: email
   Maps to this string value or user attribute in IAM Identity Center: ${user:email}
   Format: Basic
   ```

4. **Redeploy the Hub Infrastructure**:
   - Run the following CDK command to redeploy the hub infrastructure with the necessary parameters:
   
     ```
     npm run cdk -- deploy \
     --all --require-approval never --concurrency=10 \
     -c ssoInstanceArn=<enter your IAM Identity center Instance ARN> \
     -c samlMetaDataUrl=<enter your SAML 2.0 application metadata url> \
     -c callbackUrls=<enter a comma separated list of urls> \
     -c adminEmail=<enter the admin email you want to be used> \
     -c identityStoreId=<Identity Store ID> \
     -c orgId=<AWS Organization ID> \
     -c orgRootId=<AWS Organization Root ID> \
     -c orgOuId=<AWS Organization OU ID>
     ```

### Deploying the Spoke

1. **Deploy the Spoke Infrastructure**:
   - Ensure your environment credentials are configured for the spoke account and run the following CDK command to deploy the spoke infrastructure:
   
     ```
     cd infrastructure/spoke
     npm run cdk -- deploy \
     -c hubAccountId=<AWS Account ID of Hub Account> \
     -c orgId=<AWS Organization ID> \
     -c orgRootId=<AWS Organization Root ID> \
     -c orgOuId=<AWS Organization OU ID> \
     --require-approval never --concurrency=10
     ```