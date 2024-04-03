import { buildLightApp } from '../../../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { DataSetTask } from '../../../tasks/spoke/create/dataSetTask.js';
import type { DataAssetEventHandler, DataAssetTaskHandler } from '../../../tasks/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: Handler = async (event, _context, _callback) => {
	app.log.debug(`DataSetHandler > handler > event: ${JSON.stringify(event)}`);

	const task = di.resolve<DataSetTask>('dataSetTask');
	const output = await task.process((event?.detail) ? event.detail :  event);
	app.log.debug(`DataSetHandler > handler > exit:`);
	return output;
};

export type Handler =  DataAssetEventHandler | DataAssetTaskHandler;
