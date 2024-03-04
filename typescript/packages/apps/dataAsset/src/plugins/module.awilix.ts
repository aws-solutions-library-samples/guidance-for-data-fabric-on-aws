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
import { ConnectionTask } from '../stepFunction/tasks/connectionTask.js';
import { JobTask } from '../stepFunction/tasks/jobTask.js';
import { DataSetTask } from '../stepFunction/tasks/dataSetTask.js';
import { RunJobTask } from '../stepFunction/tasks/runJobTask.js';
import { GlueClient } from '@aws-sdk/client-glue';
import { DataBrewClient } from '@aws-sdk/client-databrew';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';



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
		connectionTask: ConnectionTask;
		jobTask: JobTask;
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
	const eventBusName = process.env['EVENT_BUS_NAME'];
	// const hubStateMachineArn = process.env['ASSET_MANAGEMENT_HUB_STATE_MACHINE_ARN'];
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

		eventPublisher: asFunction((container: Cradle) => new EventPublisher(app.log, container.eventBridgeClient, eventBusName, DATA_ASSET_HUB_EVENT_SOURCE), {
			...commonInjectionOptions
		}),

		// Event PRocessors
		jobEventProcessor: asFunction(
			(container) =>
				new JobEventProcessor(
					app.log,
					container.dataAssetService,
					container.dataBrewClient,
					eventBusName,
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
					container.eventPublisher,
					eventBusName
				),
			{
				...commonInjectionOptions,
			}
		),

		// Tasks

		connectionTask: asFunction((container: Cradle) => new ConnectionTask(app.log, container.stepFunctionClient), {
			...commonInjectionOptions
		}),

		jobTask: asFunction((container: Cradle) => new JobTask(app.log, container.stepFunctionClient, container.dataBrewClient, eventBusName, container.eventPublisher, JobsBucketName, JobsBucketPrefix), {
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