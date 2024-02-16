# Deployment

## Prerequisites
-   Enable IAM Identity Center
-   Enable Data Zone    
-   SSL Certificate in ACM

## Deployments Steps
The deployment of the hub applications is a multi step process.
At the time of writing IAM Identity Center does not support the creation of SAML based applications because of this we need to do the deployment in multiple stages.  

### Uploading SSL certificate in ACM 

In order for the Application Load Balancer to be configured with [Cognito](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html#cognito-requirements) requires `HTTPS`. To create an HTTPS listener, you must deploy at least one SSL server certificate on your load balancer, follow the instruction below to issue or upload self-signed certificate in ACM.

1. Generate a private key. Be sure to provide valid (even though false) domain names when needed.
    ```shell
    openssl genrsa 2048 > my-aws-private.key
    ```
2. Generate the certificate providing the key generated in #1.
    ```shell
    openssl req -new -x509 -nodes -sha1 -days 3650 -extensions v3_ca -key my-aws-private.key > my-aws-public.crt
    ```
3. Upload the generated certificate (my-aws-public.crt) and the private key (my-aws-private.key) to AWS Certificate Manager. You will need to install AWS CLI and setup credentials to run the following command.
    ```shell
    aws acm import-certificate — certificate file://my-aws-public.crt — private-key file://my-aws-private.key — region us-east-2
    ```

### Deploy the shared hub infrastructure
Note: this step only needs to be performed once for the initial deployment.
In this step we will deploy the infrastructure needed to support the next step where we configure `IAM Identity Center`.

Sample command to deploy the CDK stack:
```
npm run cdk -- deploy \
--require-approval never --concurrency=10 \
-c domain=<enter your domain>
``` 

You have now deploy the shared infrastructure needed to integrate with `IAM Identity Center` 

After deployment grab the cognito domain and userPoolId created during the stack deployment.

Sample cli command:
```
aws ssm get-parameter --name "/sdf/<enter domain>/shared/cognito/userPoolDomain"
aws ssm get-parameter --name "/sdf/<enter domain>/shared/cognito/userPoolId"

```

### Configure IAM Identity Center
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


### Redeploy the hub infrastructure

```
npm run cdk -- deploy \
    --all  --require-approval never --concurrency=10 \
    -c domain=<enter your domain> \
    -c ssoInstanceArn=<enter your IAM Identity center Instance ARN> \
    -c samlMetaDataUrl=<enter your SAML 2.0 application metadata url> \
    -c callbackUrls=<enter a comma separated list of urls>
    -c adminEmail=<enter the admin email you want to be used>
```
