import { buildLightApp } from '../../../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { CreateDataSourceTask } from '../../../tasks/hub/create/createDataSourceTask.js'
import type { DataAssetTaskHandler as Handler } from '../../../tasks/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: Handler = async (event, _context, _callback) => {
	app.log.debug(`CreateDataSourceHandler > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<CreateDataSourceTask>('createDataSourceTask');
	const output = await task.process(event);
	app.log.debug(`CreateDataSourceHandler > handler > exit:`);
	return output;
};
