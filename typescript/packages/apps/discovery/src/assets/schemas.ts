import { Static, TString, Type } from "@sinclair/typebox";

export const domainId: TString = Type.String({description: 'Amazon DataZone Identifier.'});

const assetType = Type.Enum({
    S3: 'S3',
    Glue: 'Glue',
}, {description: 'Asset Type'});


const s3DetailType = Type.Object({arn: Type.String(), region: Type.String()}, {$id: 's3DetailType'})

/**
 * Amazon DataZone Asset Resource
 */
export const assetResource = Type.Object(
    {
        type: assetType,
        detail: Type.Union([s3DetailType])
    },
    {$id: 'asset'})

export type Asset = Static<typeof assetResource>
