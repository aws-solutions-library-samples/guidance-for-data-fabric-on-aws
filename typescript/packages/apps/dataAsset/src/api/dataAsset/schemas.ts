
import { Static, Type } from '@sinclair/typebox';
import { stringEnum } from '../../common/types.js'


/**
 * Resource specific path parameters
 */
export const id = Type.String({ description: 'Unique id.' });
export const version = Type.Optional(Type.Number({ description: 'specify the version number' }));
export const createdBy = Type.String({ description: 'ID of owner.' });
export const createdAt = Type.String({
    description: 'Date/time created',
    format: 'date-time'
});
export const updatedBy = Type.String({ description: 'Last ID of user who made a change.' });
export const updatedAt = Type.String({
    description: 'Date/time updated',
    format: 'date-time'
});

export const state = Type.String({ description: 'State of the Data asset.' });

export const format = stringEnum(
    ['avro', 'csv', 'json', 'parquet', 'orc', 'grok'],
    'The format of the data set.'
);

export const count = Type.Optional(
    Type.Integer({
        description: 'No. of results returned when pagination requested.'
    })
);
export const paginationToken = Type.String({ description: 'Token used to paginate to the next page of search result.' });
export const countPaginationParam = Type.Optional(Type.Integer({ description: 'Count of results to return.' }));

export const tags = Type.Optional(
	Type.Record(Type.String(), Type.Any(), {
		description: 'tags to be added to our data brew constructs description etc.'
	})
);
export type Tags = Static<typeof tags>;

/**
 * API specific resources
 */

export const catalog = Type.Object({
    domainId: Type.String({ description: 'Data Zone domain id' }),
    projectId: Type.String({ description: 'Data Zone project id' }),
    assetName: Type.String({ description: 'Data Zone asset name' }),
    assetId: Type.Optional(Type.String({ description: 'Data Zone asset id' })),
    accountId: Type.String({ description: 'The account id here the asset resides' }),
    autoPublish: Type.Boolean({
        description: 'Publish the asset automatically.',
        default: true,
    }),
    revision: Type.Optional(Type.Number({ description: 'specify the version number of the datazone asset' })),

});

export const dataLakeConnection = Type.Object({
    s3: Type.Object({
        path: Type.String({ description: 'The uri of the source S3 file' }),
        region: Type.String({ description: 'The region of the S3 bucket' })
    })
});

export const glueConnection = Type.Object({
    accountId: Type.String({ description: 'The account Id the glue table belongs to' }),
    region: Type.String({ description: 'The region of the glue table' }),
    databaseName: Type.String({ description: 'The database name the glue table belongs to' }),
    tableName: Type.String({ description: 'The glue table name' }),
});

export const connection = Type.Optional(Type.Object({
    dataLake: Type.Optional(dataLakeConnection),
    glue: Type.Optional(glueConnection)
}));

export const dataset = Type.Object({
    name: Type.String({ description: 'The name of the workflow' }),
    format,
    connectionId: Type.Optional(Type.String({ description: 'Data Zone project id' })),
    connection,

});

export const sampling = Type.Optional(Type.Object({
    // TODO to be implemented
}));

export const transforms = Type.Optional(Type.Object({
    // TODO to be implemented
}));

export const schedule = Type.Optional(Type.Object({
    // TODO to be implemented
}));

export const profileSummary = Type.Object(
    {
        sampleSize: Type.Number({ description: 'The number of rows used as a sample size from the dataset' }),
        columnCount: Type.Number({ description: 'The number of columns in the dataset' }),
        duplicateRowsCount: Type.Number({ description: 'The number of duplicate rows' }),
        location: Type.String({ description: 'The location of the S3 file containing the profile information' }),
        totalMissingValues: Type.Number({ description: 'The number of total missing values across all columns' })
    }
); 

export const columnProfile = Type.Object(
    {
        name: Type.String({ description: 'The name of the column' }),
        type: Type.String({ description: 'The type of the column' }),
        distinctValuesCount: Type.Number({ description: 'The number of distinct values'}),
        uniqueValuesCount: Type.Number({ description: 'The number of unique Values' }),
        missingValuesCount: Type.Number({ description: 'The number of missing values' }),
        mostCommonValues: Type.Number({ description: 'Top 5 most common values' }),
        max: Type.Number({ description: 'The number of total missing values across all columns' }),
        min: Type.Number({ description: 'The number of total missing values across all columns' }),
        mean: Type.Number({ description: 'The number of total missing values across all columns' })
    }
);

export const columns = Type.Optional(
	Type.Array(columnProfile, {
		description: 'column profiles that are to be added to our asset.'
	})
);

export const profile = Type.Object({
    summary: profileSummary,
    columns
});

export const workflow = Type.Object({
    name: Type.String({ description: 'The name of the workflow' }),
    roleArn: Type.String({ description: 'The Arn of the IAM Role to be used for the job execution' }),
    dataset,
    sampling,
    transforms,
    tags,
});

export const execution = Type.Object({
    hubExecutionArn: Type.Optional(Type.String({ description: 'The hub execution id of the state machine' }))   ,
    spokeExecutionArn: Type.Optional(Type.String({ description: 'The Spoke execution id of the state machine' })),
    jobRunId: Type.Optional(Type.String({ description: 'The job runId from databrew' })),
    jobRunStatus: Type.Optional(Type.String({ description: 'The run status of the job' })),
    jobStartTime: Type.Optional(Type.String({ description: 'The start time of the last job run' })),
    jobStopTime: Type.Optional(Type.String({ description: 'The stop time of the last job run' }))

});

export const dataAssetResource = Type.Object({
    id,
    state,
    version,
    createdBy: createdBy,
    createdAt: createdAt,
    updatedBy: Type.Optional(updatedBy),
    updatedAt: Type.Optional(updatedAt),
    execution: Type.Optional(execution),
    catalog,
    workflow,
    profile:Type.Optional(profile)
}, { $id: 'dataAssetResource' });

export const newDataAssetResource = Type.Object({
    catalog,
    workflow
}, {
    $id: 'newDataAssetRequestBody',
}
);

export const editDataAssetResource = Type.Object({
    state,
    execution: Type.Optional(execution),
    catalog,
    workflow
}, {
    $id: 'editDataAssetRequestBody',
});

export const dataAssetListOptions = Type.Object(
    {
        count: Type.Optional(count),
        lastEvaluatedToken: Type.Optional(paginationToken)
    }
);

export const listDataAssetResource = Type.Object(
    {
        dataAssets: Type.Array(Type.Ref(dataAssetResource)),
        pagination: Type.Optional(
            dataAssetListOptions
        ),
    },
    {
        $id: 'listDataAsset',
    }
);



export type Catalog = Static<typeof catalog>;
export type Workflow = Static<typeof workflow>;
export type DataAsset = Static<typeof dataAssetResource>;
export type NewDataAsset = Static<typeof newDataAssetResource>;
export type EditDataAsset = Static<typeof editDataAssetResource>;
export type DataAssetListOptions = Static<typeof dataAssetListOptions>;
export type ListDataAsset = Static<typeof listDataAssetResource>;
export type DataProfile = Static<typeof profile>;
export type ProfileColumns = Static<typeof columns>;