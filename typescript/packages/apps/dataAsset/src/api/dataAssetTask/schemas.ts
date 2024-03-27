import { Static, Type } from '@sinclair/typebox';
import { stringEnum } from '../../common/types.js'


/**
 * Resource specific path parameters
 */
export const id = Type.String({description: 'Unique id of the request.'});
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

export const state = Type.String({description: 'State of the Data asset.'});

export const format = stringEnum(
    ['avro', 'csv', 'json', 'parquet', 'orc', 'grok', 'excel'],
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
export const paginationToken = Type.String({
    description: 'Token used to paginate to the next page of search result.'
})
export const countPaginationParam = Type.Optional(Type.Integer({description: 'Count of results to return.'}));

export const tags = Type.Optional(
    Type.Record(Type.String(), Type.Any(), {
        description: 'tags to be added to our data brew constructs description etc.'
    })
);
export type Tags = Static<typeof tags>;

export const redshiftDbType = stringEnum(
    ['serverless', 'cluster'],
    'The type of the redshift db used.'
);

/**
 * API specific resources
 */
export const catalog = Type.Object({
    domainId: Type.String({description: 'Data Zone domain id'}),
    domainName: Type.Optional(Type.String({description: 'Data Zone domain name'})),
    environmentId: Type.String({description: 'Data Zone environment id'}),
    projectId: Type.Optional(Type.String({description: 'Data Zone project id'})),
    region: Type.Optional(Type.String({description: 'Data Zone environment region'})),
    dataSourceId: Type.Optional(Type.String({description: 'Data Zone asset data source id'})),
    assetName: Type.String({description: 'Data Zone asset name'}),
    assetId: Type.Optional(Type.String({description: 'Data Zone asset id'})),
    accountId: Type.String({description: 'The account id here the asset resides'}),
    autoPublish: Type.Optional(Type.Boolean({
        description: 'Publish the asset automatically.',
        default: true,
    })),
    revision: Type.Optional(Type.Number({description: 'specify the version number of the datazone asset'})),

});

export const dataLakeConnection = Type.Object({
    s3: Type.Object({
        path: Type.String({description: 'The uri of the source S3 file'}),
        region: Type.String({description: 'The region of the S3 bucket'})
    })
});

export const redshiftConnection = Type.Object({
    secretArn: Type.String({description: 'The ARN of the Secrets Manager secret containing redshift credentials.'}),
    jdbcConnectionUrl: Type.String({description: 'JDBC URL for the redshift cluster or workgroup.'}),
    subnetId: Type.String({description: 'Subnet ID for the Glue connection.'}),
    securityGroupIdList: Type.Array(Type.String(), {description: "Security group Ids for the Glue connection."}),
    availabilityZone: Type.String({description: 'Availability zone for the Glue connection.'}),
    path: Type.String({description: "Path for the Glue Crawler data source (e.g. /dev/public/table_x) (used in glue crawler without recipe job)"}),
    databaseTableName: Type.String({description: "The database table name for DataBrew dataset (used in recipe job data set)."}),
    queryString: Type.Optional(Type.String({description: "The query string for DataBrew dataset (used in recipe job data set)."})),
    type: Type.Optional(redshiftDbType),
    workgroupName: Type.Optional(Type.String({description: "The name of the serverless workgroup the DB belongs to(used by data zone)."})),
    clusterName: Type.Optional(Type.String({description: "The cluster name of the DB cluster to(used by data zone)."})),

});

export const glueConnection = Type.Object({
    accountId: Type.String({description: 'The account Id the glue table belongs to'}),
    region: Type.String({description: 'The region of the glue table'}),
    databaseName: Type.String({description: 'The database name the glue table belongs to'}),
    tableName: Type.String({description: 'The glue table name'}),
});

export const connection = Type.Optional(Type.Object({
    dataLake: Type.Optional(dataLakeConnection),
    glue: Type.Optional(glueConnection),
    redshift: Type.Optional(redshiftConnection)
}));

export const dataset = Type.Object({
    name: Type.String({description: 'The name of the workflow'}),
    format,
    connection,
    connectionId: Type.Optional(Type.String({description: 'Glue connection name'})),
    version: Type.Optional(Type.String({description: 'The version of the dataset.'})),
    dataSource: Type.Optional(Type.Object({
        name: Type.String({description: 'Name of 3rd party source.'}),
        url: Type.String({description: 'Url of 3rd party source.'}),
    }))
});

export const sampling = Type.Optional(Type.Object({
    // TODO to be implemented
}));

export const dataQuality = Type.Optional(Type.Object({
    ruleset: Type.String({description: 'A Data Quality Definition Language (DQDL) ruleset. For more information, see the Glue developer guide.</p>'}),
}));

export const existingRecipe = Type.Object({
    name: Type.String({description: 'The name of the existing recipe'}),
    version: Type.String({description: 'The version of the existing recipe'})
});

export const newRecipe = Type.Object({
    steps: Type.Array(Type.Any())       // can this be further specified?
});

export const transforms = Type.Optional(Type.Object({
    recipeReference: Type.Optional(existingRecipe),
    recipe: Type.Optional(newRecipe)
}));

export const dataZoneAssetInput = Type.Object({
    assetListingId: Type.String({description: 'DataZone asset listing identifier'}),
    domainId: Type.String({description: 'DataZone domain identifier'}),
    revision: Type.Optional(Type.String({description: 'DataZone asset listing revision'}))
});

export const openLineageAssetInput = Type.Object({
    assetName: Type.String({description: 'Asset name in OpenLineage'}),
    assetNamespace: Type.String({description: 'Asset namespace in OpenLineage'}),
});

export const schedule = Type.Optional(Type.Object({
    // TODO to be implemented
}));

export const workflow = Type.Object({
    name: Type.String({description: 'The name of the workflow', maxLength:64, pattern: '[a-z|A-Z|0-9-_]'}),
    roleArn: Type.String({description: 'The Arn of the IAM Role to be used for the job execution'}),
    externalInputs: Type.Optional(Type.Union([Type.Array(dataZoneAssetInput), Type.Array(openLineageAssetInput)])),
    dataset,
    sampling,
    transforms,
    dataQuality,
    tags,
});

export const job = Type.Object({
    jobRunId: Type.Optional(Type.String({description: 'The job runId from databrew'})),
    jobRunStatus: Type.Optional(Type.String({description: 'The run status of the job'})),
    jobStartTime: Type.Optional(Type.String({description: 'The start time of the last job run'})),
    jobStopTime: Type.Optional(Type.String({description: 'The stop time of the last job run'})),
    status: Type.Optional(Type.String({description: 'The status of the Job'})),
    message: Type.Optional(Type.String({description: 'The message of the Job'})),
    profileLocation: Type.Optional(Type.String({description: 'The S3 Location of the profile job results'})),
    profileSignedUrl: Type.Optional(Type.String({description: 'The Signed Url for the profile results'})),
});

export const glueTable = Type.Object({
    name: Type.String({description: 'The glue table name'}),
    location: Type.Optional(Type.String({description: 'location of the data source'})),
});

export const crawlerRun = Type.Object({
    id: Type.Optional(Type.String({description: 'The job runId from databrew'})),
    name: Type.Optional(Type.String({description: 'The run status of the job'})),
    StartTime: Type.Optional(Type.String({description: 'The start time of the last job run'})),
    StopTime: Type.Optional(Type.String({description: 'The stop time of the last job run'})),
    status: Type.Optional(Type.String({description: 'The status of the Job'})),
    message: Type.Optional(Type.String({description: 'The message of the Job'})),
    tables: Type.Optional(Type.Array(glueTable)),
});

export const execution = Type.Object({
    hubExecutionId: Type.Optional(Type.String({description: 'The Hub execution id of the state machine'})),
    spokeExecutionId: Type.Optional(Type.String({description: 'The Spoke execution id of the state machine'})),
    profileJob: Type.Optional(job),
    transformJob: Type.Optional(job),
    dataSourceRun: Type.Optional(job),
    crawlerRun: Type.Optional(crawlerRun),
});

export const dataAssetTaskResource = Type.Object({
    id,
    idcUserId: Type.String({description: "The user's IAM Identity Center User ID."}),
    catalog,
    workflow,
}, {$id: 'dataAssetTaskResource'});

export const newDataAssetTaskResource = Type.Object({
        catalog,
        workflow
    }, {
        $id: 'newDataAssetTaskResource',
    }
);

export const dataAssetTaskResourceListOptions = Type.Object(
    {
        count: Type.Optional(count),
        lastEvaluatedToken: Type.Optional(paginationToken)
    }
);

export const dataAssetTaskResourceList = Type.Object(
    {
        dataAssetTasks: Type.Array(Type.Ref(dataAssetTaskResource)),
        pagination: Type.Optional(
            dataAssetTaskResourceListOptions
        ),
    },
    {
        $id: 'dataAssetTaskListResource',
    }
);


export type Catalog = Static<typeof catalog>;
export type Workflow = Static<typeof workflow>;
export type DataZoneInput = Static<typeof dataZoneAssetInput>;
export type OpenLineageInput = Static<typeof openLineageAssetInput>;
export type DataAssetTaskResource = Static<typeof dataAssetTaskResource>;
export type NewDataAssetTaskResource = Static<typeof newDataAssetTaskResource>;
export type DataAssetTaskResourceListOptions = Static<typeof dataAssetTaskResourceListOptions>;
export type DataAssetTaskResourceList = Static<typeof dataAssetTaskResourceList>;

