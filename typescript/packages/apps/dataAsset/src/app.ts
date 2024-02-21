import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';
import { fastify } from 'fastify';
import fastifySensible from '@fastify/sensible';
import cors from '@fastify/cors';

import { errorHandler } from './common/errors.js';
import awilix from './plugins/module.awilix.js';
import config from './plugins/config.js';
import swagger from './plugins/swagger.js';

import { dataAssetResource, newDataAssetResource, editDataAssetResource, listDataAssetResource } from './api/dataAsset/schemas.js';
import createDataAssetsRoute from './api/dataAsset/handlers/create.handler.js';
import listDataAssetsRoute from './api/dataAsset/handlers/list.handler.js';
import getDataAssetsRoute from './api/dataAsset/handlers/get.handler.js';
import updateDataAssetsRoute from './api/dataAsset/handlers/update.handler.js';
import deleteDataAssetsRoute from './api/dataAsset/handlers/delete.handler.js';

export const buildApp = async (): Promise<FastifyInstance> => {
	const environment = process.env['NODE_ENV'] as string;
	const logLevel = process.env['LOG_LEVEL'] as string;
	const envToLogger = {
		local: {
			level: logLevel ?? 'info',
			transport: {
				target: 'pino-pretty',
				options: {
					translateTime: 'HH:MM:ss Z',
					ignore: 'pid,hostname',
				},
			},
		},
		prod: {
			level: logLevel ?? 'warn',
		},
	};

	const app = fastify({
		logger: envToLogger[environment] ?? {
			level: logLevel ?? 'debug',
		},
		ajv: {
			customOptions: {
				strict: 'log',
				keywords: ['kind', 'modifier'],
				removeAdditional: 'all',
			},
			plugins: [
				// eslint-disable-next-line @typescript-eslint/typedef
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				function(ajv: any) {
					ajv.addKeyword({ keyword: 'x-examples' });
				},
			],
		},
	}).withTypeProvider<TypeBoxTypeProvider>();

	app.setErrorHandler(errorHandler);

	// register all plugins
	await app.register(config);
	await app.register(swagger);
	await app.register(awilix);
	await app.register(cors, {});
	await app.register(fastifySensible);

	// register all schemas
	app.addSchema(dataAssetResource);
    app.addSchema(newDataAssetResource);
    app.addSchema(editDataAssetResource);
    app.addSchema(listDataAssetResource);


	// register all routes
	await app.register(createDataAssetsRoute);
    await app.register(updateDataAssetsRoute);
    await app.register(getDataAssetsRoute);
    await app.register(listDataAssetsRoute);
    await app.register(deleteDataAssetsRoute);
	
	return app as unknown as FastifyInstance;
};

