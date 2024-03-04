# Deployment

Sample command to deploy the CDK stack:
```
npm run cdk -- deploy \
-c hubAccountId= <AWS Account ID of Hub Account> \
-c orgId=<AWS Organization ID> \
-c orgRootId=<AWS Organization Root ID> \
-c orgOuId=<AWS Organization OU ID> \
--require-approval never --concurrency=10
``` 
