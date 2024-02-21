import { buildLightApp } from '../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { DataSetTask } from '../tasks/dataSetTask.js';
import type { DataSetTaskHandler as Handler } from '../tasks/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: Handler = async (event, _context, _callback) => {
	app.log.debug(`DataSetHandler > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<DataSetTask>('dataSetTask');
	const output = await task.process(event);
	app.log.debug(`DataSetHandler > handler > exit:`);
	return output;
};
