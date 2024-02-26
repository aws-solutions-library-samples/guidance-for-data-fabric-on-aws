# Deployment

Sample command to deploy the CDK stack:
```
npm run cdk -- deploy \
--require-approval never --concurrency=10 \
-c hubAccountId=<AWS Account ID for the Hub account>
``` 
