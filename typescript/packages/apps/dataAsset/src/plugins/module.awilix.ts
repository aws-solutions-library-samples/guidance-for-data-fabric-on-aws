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
import { ConnectionTask } from '../stepFunction/tasks/spoke/connectionTask.js';
import { ProfileJobTask } from '../stepFunction/tasks/spoke/profileJobTask.js';
import { DataSetTask } from '../stepFunction/tasks/spoke/dataSetTask.js';
import { RunJobTask } from '../stepFunction/tasks/spoke/runJobTask.js';
import { GlueClient } from '@aws-sdk/client-glue';
import { DataBrewClient } from '@aws-sdk/client-databrew';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StartTask } from '../stepFunction/tasks/hub/create/startTask.js';
import { SpokeResponseTask } from '../stepFunction/tasks/hub/create/spokeResponseTask.js';
import { LineageTask } from '../stepFunction/tasks/hub/create/lineageTask.js';
import { CreateDataSourceTask } from '../stepFunction/tasks/hub/create/createDataSourceTask.js';



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
		eventPublisher: EventPublisher;
		dataAssetRepository: DataAssetRepository;
		dataAssetService: DataAssetService;
		// Hub Tasks
		startTask: StartTask;
		spokeResponseTask: SpokeResponseTask;
		createDataSourceTask: CreateDataSourceTask,
		lineageTask: LineageTask

		//Spoke Tasks
		connectionTask: ConnectionTask;
		profileJobTask: ProfileJobTask;
		dataSetTask: DataSetTask;
		runJobTask: RunJobTask;
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

const registerContainer = (app?: FastifyInstance) => {
	const commonInjectionOptions = {
		lifetime: Lifetime.SINGLETON
	};

	const awsRegion = process.env['AWS_REGION'];
	const hubEventBusName = process.env['HUB_EVENT_BUS_NAME'];
	const spokeEventBusName = process.env['SPOKE_EVENT_BUS_NAME'];
	const hubCreateStateMachineArn = process.env['HUB_CREATE_STATE_MACHINE_ARN'];
	// const spokeCreateStateMachineArn = process.env['SPOKE_CREATE_STATE_MACHINE_ARN'];
	const JobsBucketName = process.env['JOBS_BUCKET_NAME'];
	const JobsBucketPrefix = process.env['JOBS_BUCKET_PREFIX'];
	const TableName = process.env['TABLE_NAME'];

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

		dynamoDbUtils: asFunction((container: Cradle) => new DynamoDbUtils(app.log, container.dynamoDBDocumentClient), {
			...commonInjectionOptions,
		}),

		eventPublisher: asFunction((container: Cradle) => new EventPublisher(app.log, container.eventBridgeClient, hubEventBusName, DATA_ASSET_HUB_EVENT_SOURCE), {
			...commonInjectionOptions
		}),

		// Event PRocessors
		jobEventProcessor: asFunction(
			(container) =>
				new JobEventProcessor(
					app.log,
					container.dataAssetService,
					container.dataBrewClient,
					spokeEventBusName,
					container.eventPublisher,
					container.s3Client,
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
		startTask: asFunction((container: Cradle) => new StartTask(app.log, hubEventBusName, container.eventPublisher), {
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

		connectionTask: asFunction((container: Cradle) => new ConnectionTask(app.log, container.stepFunctionClient), {
			...commonInjectionOptions
		}),

		profileJobTask: asFunction((container: Cradle) => new ProfileJobTask(app.log,container.dataBrewClient, JobsBucketName, JobsBucketPrefix), {
			...commonInjectionOptions
		}),

		dataSetTask: asFunction((container: Cradle) => new DataSetTask(app.log, container.stepFunctionClient, container.dataBrewClient), {
			...commonInjectionOptions
		}),

		runJobTask: asFunction((container: Cradle) => new RunJobTask(app.log, container.stepFunctionClient), {
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