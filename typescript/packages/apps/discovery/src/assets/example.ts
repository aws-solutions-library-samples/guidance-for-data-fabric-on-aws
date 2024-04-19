import { Asset } from "./schemas.js";

export const assetExample: Asset = {
    type: "S3",
    detail: {
        arn: 'arn:aws:s3:::df-bucket/df-data.csv',
        region: "us-east-1"
    }
}
