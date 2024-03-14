#Prerequisite

The following meta data forms must exists within the used datazone projects, these meta data forms allow us to add the additional meta data needed for the module to run.
Note: all these steps will be automated in future tasks and this step will be redundant 

df_summary_profile_form: holds the profiling summary of the asset
| Display Name  | Technical Name | Description | Field type | Minimum value| Maximum Value | Required | Searchable |
| ------------- | -------------- | ----------- | ---------- | ------------ | ------------- | -------- | -------- |
| Total Missing Values  | totalMissingValues | The number of total missing values across all columns | Long |  |  | False | False |
| Location  | location | The location of the S3 file containing the profile information | String |  |  | False | False |
| Column Count  | columnCount | The number of columns in the dataset | Long | | | False | False |
| Duplicate Rows Count  | duplicateRowsCount | The number of duplicate rows | Long | | | False | False |
| Sample Size  | sampleSize | The number of rows used as a sample size from the dataset | Long | | | False | False |

df_asset_workflow_form : holds the workflow metadata for the asset
`TODO SCHEMA`

df_asset_execution_form: holds the asset job execution metadata from previous runs
`TODO SChEMA`

##Deployment
To Deploy the the data asset module first deploy the hub stack in the hub account

The following example uses our shared hub account `767397689259` as an example  :

```
cd df-core/infrastructure/hub
npm run cdk -- deploy -c orgId=o-lq7e4opv1i -c orgRootId=r-0cic -c orgOuId=ou-0cic-70sjyito -c loadBalancerCertificateArn=arn:aws:acm:us-west-2:767397689259:certificate/acede5b7-7f25-4e6a-a32a-ca4753590222 -c spokeAccountIds=767397875118,381492063957 -c identityStoreId=d-9267b8520e -c ssoInstanceArn=arn:aws:sso:::instance/ssoins-7907ae9daa2031e2 -c samlMetaDataUrl=https://portal.sso.us-west-2.amazonaws.com/saml/metadata/OTA1NDE4MzcwOTU4X2lucy1iYTNlODg5MWEzNDI2NzIy -c callbackUrls=http://localhost:3000 -c adminEmail=rotach+df@amazon.com --require-approval never --concurrency=10 --all
```

After deployment of the hub stack from the console of the hub account navigate to the lambda function `df-dataAsset-jobCompletion` and copy its role name:

1- go to the data zone domains and select your domain and activate the IAM role to the domain.
2- Navigate to the domains portal and add the lambda role to the projects that whish to grant access to

Deploy the spoke stacks
The following example deploys the spoke stack to our spoke account `354851405923`:

```
cd df-core/infrastructure/spoke
npm run cdk -- deploy -c orgId=o-lq7e4opv1i -c orgRootId=r-0cic -c orgOuId=ou-0cic-70sjyito -c hubAccountId=767397689259 --require-approval never --concurrency=10 --all
```

##Testing locally
Currently we do not have an auth components for our API requests, due to this testing the APIs via APIGW is not currently supported.
to run locally:
```
cd df-core/typescript/packages/apps/dataAsset
export AWS_REGION=us-west-2
npm run start
```

Sample Post request:
```
curl --location 'http://localhost:30004/dataassets' \
--header 'Accept: application/json' \
--header 'accept-version: 1.0.0' \
--header 'Content-Type: application/json' \
--data '{
    "catalog": {
        "domainId": "dzd_63b65t71bnodxs",         
        "projectId": "bqznvzbgpv9w28",        
        "assetName": "user-profile",        
        "accountId": "767397689259",        
        "autoPublish": true,
        "revision": "1"       
    },
    "workflow": {
        "name": "testWorkflow",
        "roleArn": "arn:aws:iam::767397875118:role/df-AWSGlueDataBrewServiceRole-test",
        "dataset": {
            "name": "testDataSet1",
            "format": "json",
            "connection": {
                "dataLake": {
                    "s3": {
                        "path": "s3://df-767397875118-us-west-2-data-source/users_100k.json",
                        "region": "us-west-2"
                    }
                }
            }
        }
    }
}'
```


## Prerequisites
### Redshift Serverless
- Turn on enhanced VPC routing
- Place credentials in secrets manager