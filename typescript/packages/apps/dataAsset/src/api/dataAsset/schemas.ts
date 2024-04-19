import { Static, Type } from '@sinclair/typebox';
import { stringEnum } from '../../common/types.js'


/**
 * Resource specific path parameters
 */
export const id = Type.String({description: 'the identifier of the Amazon DataZone inventory asset..'});
export const version = Type.Optional(Type.Number({description: 'specify the version number'}));
export const createdBy = Type.String({description: 'ID of owner.'});
export const createdAt = Type.String({
    description: 'Date/time created',
    format: 'date-time'
});
export const updatedBy = Type.String({description: 'Last ID of user who made a change.'});
export const updatedAt = Type.String({
    description: 'Date/time updated',
    format: 'date-time'
});

export const format = stringEnum(
    ['avro', 'csv', 'json', 'parquet', 'orc', 'grok'],
    'The format of the data set.'
);

export const compression = stringEnum(
    ['brotli', 'bzip2', 'deflate', 'gzip', 'lz4', 'lzo', 'snappy', 'zlib', 'zstd'],
    'The compression of the data set.'
);

export const count = Type.Optional(
    Type.Integer({
        description: 'No. of results returned when pagination requested.'
    })
);
export const paginationToken = Type.String({description: 'Token used to paginate to the next page of search result.'});
export const countPaginationParam = Type.Optional(Type.Integer({description: 'Count of results to return.'}));

export const tags = Type.Optional(
    Type.Record(Type.String(), Type.Any(), {
        description: 'tags to be added to our data brew constructs description etc.'
    })
);
export type Tags = Static<typeof tags>;

/**
 * API specific resources
 */

export const dataAssetResource = Type.Object({
    id,
    domainId: Type.Optional(Type.String({description: 'The identifier of the Amazon DataZone domain in which the inventory asset exists.'})),
    name: Type.String({description: 'The identifier of the Amazon DataZone domain in which the inventory asset.'}),
    description: Type.Optional(Type.String({description: 'The description of an Amazon DataZone inventory asset.'})),
    owningProjectId: Type.String({description: 'The identifier of the Amazon DataZone project that owns the inventory asset.'}),
    typeIdentifier: Type.String({description: 'The identifier of the asset type of the specified Amazon DataZone inventory asset.'}),
    typeRevision: Type.String({description: 'The revision of the inventory asset type.'}),
    createdAt: Type.Optional(Type.String({description: 'The timestamp of when the Amazon DataZone inventory asset was created.'})),
    createdBy: Type.Optional(Type.String({description: 'The Amazon DataZone user who created the inventory asset.'})),
}, {$id: 'dataAssetResource'});

export const dataAssetListOptions = Type.Object(
    {
        count: Type.Optional(count),
        lastEvaluatedToken: Type.Optional(paginationToken)
    }
);

export const dataAssetResourceList = Type.Object(
    {
        dataAssets: Type.Array(Type.Ref(dataAssetResource)),
        pagination: Type.Optional(
            dataAssetListOptions
        ),
    },
    {
        $id: 'dataAssetResourceList',
    }
);

export type DataAssetResource = Static<typeof dataAssetResource>;
export type DataAssetResourceList = Static<typeof dataAssetResourceList>;
export type DataAssetListOptions = Static<typeof dataAssetListOptions>;
