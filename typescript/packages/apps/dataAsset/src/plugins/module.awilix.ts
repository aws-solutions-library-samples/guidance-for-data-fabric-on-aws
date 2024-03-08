import pkg from 'aws-xray-sdk';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { SFNClient } from '@aws-sdk/client-sfn';
import { DataZoneClient } from '@aws-sdk/client-datazone';
import { Cradle, diContainer, FastifyAwilixOptions, fastifyAwilixPlugin } from '@fastify/awilix';
import { asFunction, Lifetime } from 'awilix';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { DynamoDbUtils } from '@df/dynamodb-utils';
import { JobEventProcessor } from '../events/job.eventProcessor.js';
import { DataAssetRepository } from '../api/dataAsset/repository.js';
import { DataAssetService } from '../api/dataAsset/service.js';
import { BaseCradle, registerBaseAwilix } from '@df/resource-api-base';
import { EventPublisher, DATA_ASSET_HUB_EVENT_SOURCE } from '@df/events';
import { ConnectionTask } from '../stepFunction/tasks/spoke/create/connectionTask.js';
import { ProfileJobTask } from '../stepFunction/tasks/spoke/create/profileJobTask.js';
import { DataSetTask } from '../stepFunction/tasks/spoke/create/dataSetTask.js';
import { DataQualityProfileJobTask } from '../stepFunction/tasks/spoke/create/dataQualityProfileJobTask.js';
import { GlueClient } from '@aws-sdk/client-glue';
import { DataBrewClient } from '@aws-sdk/client-databrew';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StartTask as HubCreateStartTask} from '../stepFunction/tasks/hub/create/startTask.js';
import { StartTask as SpokeCreateStartTask} from '../stepFunction/tasks/spoke/create/startTask.js';
import { SpokeResponseTask } from '../stepFunction/tasks/hub/create/spokeResponseTask.js';
import { LineageTask } from '../stepFunction/tasks/hub/create/lineageTask.js';
import { CreateDataSourceTask } from '../stepFunction/tasks/hub/create/createDataSourceTask.js';
import { SSMClient } from '@aws-sdk/client-ssm';
import { RecipeJobTask } from '../stepFunction/tasks/spoke/create/recipeJobTask.js';
import { GlueCrawlerTask } from '../stepFunction/tasks/spoke/create/glueCrawlerTask.js';



const { captureAWSv3Client } = pkg;


declare module '@fastify/awilix' {
	interface Cradle extends BaseCradle {
		jobEventProcessor: JobEventProcessor;
		eventBridgeClient: EventBridgeClient;
		dynamoDbUtils: DynamoDbUtils;
		stepFunctionClient: SFNClient;
		dataZoneClient: DataZoneClient;
		glueClient: GlueClient;
		dataBrewClient: DataBrewClient;
		s3Client: S3Client;
		ssmClient: SSMClient;
		eventPublisher: EventPublisher;
		dataAssetRepository: DataAssetRepository;
		dataAssetService: DataAssetService;

		// Hub Tasks
		hubCreateStartTask: HubCreateStartTask;
		spokeResponseTask: SpokeResponseTask;
		createDataSourceTask: CreateDataSourceTask,
		lineageTask: LineageTask

		//Spoke Tasks
		spokeCreateStartTask: SpokeCreateStartTask
		connectionTask: ConnectionTask;
		profileJobTask: ProfileJobTask;
		dataSetTask: DataSetTask;
		dataQualityProfileJobTask: DataQualityProfileJobTask;
		recipeJobTask: RecipeJobTask;
		glueCrawlerTask: GlueCrawlerTask;
	}
}

class EventBridgeClientFactory {
	public static create(region: string | undefined): EventBridgeClient {
		const eb = captureAWSv3Client(new EventBridgeClient({ region }));
		return eb;
	}
}

class StepFunctionClientFactory {
	public static create(region: string | undefined): SFNClient {
		const sfn = captureAWSv3Client(new SFNClient({ region }));
		return sfn;
	}
}

class DataZoneClientFactory {
	public static create(region: string | undefined): DataZoneClient {
		const dz = captureAWSv3Client(new DataZoneClient({ region }));
		return dz;
	}
}

class GlueClientFactory {
	public static create(region: string | undefined): GlueClient {
		const glue = captureAWSv3Client(new GlueClient({ region }));
		return glue;
	}
}

class DataBrewClientFactory {
	public static create(region: string | undefined): DataBrewClient {
		const db = captureAWSv3Client(new DataBrewClient({ region }));
		return db;
	}
}

class S3ClientFactory {
	public static create(region: string): S3Client {
		const s3 = captureAWSv3Client(new S3Client({ region }));
		return s3;
	}
}

class SSMClientFactory {
	public static create(region: string): SSMClient {
		const ssm = captureAWSv3Client(new SSMClient({ region }));
		return ssm;
	}
}

const registerContainer = (app?: FastifyInstance) => {
	const commonInjectionOptions = {
		lifetime: Lifetime.SINGLETON
	};

	const awsRegion = process.env['AWS_REGION'];
	const hubEventBusName = process.env['HUB_EVENT_BUS_NAME'];
	// const spokeEventBusName = process.env['SPOKE_EVENT_BUS_NAME'];
	const hubCreateStateMachineArn = process.env['HUB_CREATE_STATE_MACHINE_ARN'];
	// const spokeCreateStateMachineArn = process.env['SPOKE_CREATE_STATE_MACHINE_ARN'];
	const JobsBucketName = process.env['JOBS_BUCKET_NAME'];
	const JobsBucketPrefix = process.env['JOBS_BUCKET_PREFIX'];
	const TableName = process.env['TABLE_NAME'];
	const GlueDatabaseName = process.env['SPOKE_GLUE_DATABASE_NAME'];

	diContainer.register({

		// Clients
		eventBridgeClient: asFunction(() => EventBridgeClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),
		stepFunctionClient: asFunction(() => StepFunctionClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),

		dataZoneClient: asFunction(() => DataZoneClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),

		glueClient: asFunction(() => GlueClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),

		dataBrewClient: asFunction(() => DataBrewClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),

		s3Client: asFunction(() => S3ClientFactory.create(awsRegion), {
			...commonInjectionOptions,
		}),

		ssmClient: asFunction(() => SSMClientFactory.create(awsRegion), {
			...commonInjectionOptions,
		}),

		dynamoDbUtils: asFunction((container: Cradle) => new DynamoDbUtils(app.log, container.dynamoDBDocumentClient), {
			...commonInjectionOptions,
		}),

		eventPublisher: asFunction((container: Cradle) => new EventPublisher(app.log, container.eventBridgeClient, hubEventBusName, DATA_ASSET_HUB_EVENT_SOURCE), {
			...commonInjectionOptions
		}),

		// Event Processors
		jobEventProcessor: asFunction(
			(container) =>
				new JobEventProcessor(
					app.log,
					container.dataAssetService,
					container.dataBrewClient,
					container.s3Client,
					container.stepFunctionClient,
					container.ssmClient,
					getSignedUrl),
			{
				...commonInjectionOptions
			}
		),

		// Repositories

		dataAssetRepository: asFunction(
			(container) =>
				new DataAssetRepository(
					app.log,
					container.dynamoDBDocumentClient,
					TableName,
					container.dynamoDbUtils
				),
			{
				...commonInjectionOptions,
			}
		),

		// Services

		dataAssetService: asFunction(
			(container) =>
				new DataAssetService(
					app.log,
					container.dataAssetRepository,
					container.dataZoneClient,
					container.stepFunctionClient,
					hubCreateStateMachineArn
					// container.eventPublisher,
					// eventBusName
				),
			{
				...commonInjectionOptions,
			}
		),

		// Hub Tasks
		hubCreateStartTask: asFunction((container: Cradle) => new HubCreateStartTask(app.log, hubEventBusName, container.eventPublisher), {
			...commonInjectionOptions
		}),

		spokeResponseTask: asFunction((container: Cradle) => new SpokeResponseTask(app.log, container.stepFunctionClient), {
			...commonInjectionOptions
		}),

		createDataSourceTask: asFunction((container: Cradle) => new CreateDataSourceTask(app.log, container.dataZoneClient, container.stepFunctionClient), {
			...commonInjectionOptions
		}),

		lineageTask: asFunction((container: Cradle) => new LineageTask(app.log, container.stepFunctionClient, hubEventBusName, container.eventPublisher), {
			...commonInjectionOptions
		}),


		// Spoke Tasks

		spokeCreateStartTask: asFunction((container: Cradle) => new SpokeCreateStartTask(app.log, container.stepFunctionClient), {
			...commonInjectionOptions
		}),

		connectionTask: asFunction((container: Cradle) => new ConnectionTask(app.log, container.stepFunctionClient), {
			...commonInjectionOptions
		}),

		profileJobTask: asFunction((container: Cradle) => new ProfileJobTask(app.log, container.dataBrewClient, container.ssmClient, JobsBucketName, JobsBucketPrefix), {
			...commonInjectionOptions
		}),

		dataSetTask: asFunction((container: Cradle) => new DataSetTask(app.log, container.stepFunctionClient, container.dataBrewClient), {
			...commonInjectionOptions
		}),

		dataQualityProfileJobTask: asFunction((container: Cradle) => new DataQualityProfileJobTask(app.log, container.stepFunctionClient), {
			...commonInjectionOptions
		}),

		recipeJobTask: asFunction((container: Cradle) => new RecipeJobTask(app.log, container.stepFunctionClient, container.dataBrewClient, JobsBucketName, JobsBucketPrefix), {
			...commonInjectionOptions
		}),
		
		glueCrawlerTask: asFunction((container: Cradle) => new GlueCrawlerTask(app.log, container.glueClient, container.ssmClient, GlueDatabaseName), {
			...commonInjectionOptions
		}),

	});
};

export default fp<FastifyAwilixOptions>(async (app: FastifyInstance): Promise<void> => {
	// first register the DI plugin
	await app.register(fastifyAwilixPlugin, {
		disposeOnClose: true,
		disposeOnResponse: false
	});

	registerBaseAwilix(app.log);

	registerContainer(app);
});

export { registerContainer };