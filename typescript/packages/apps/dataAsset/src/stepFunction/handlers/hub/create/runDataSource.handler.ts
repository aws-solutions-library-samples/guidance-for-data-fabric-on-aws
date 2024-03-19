import { buildLightApp } from '../../../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { RunDataSourceTask } from '../../../tasks/hub/create/runDataSourceTask.js'
import type { DataAssetTaskHandler as Handler } from '../../../tasks/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: Handler = async (event, _context, _callback) => {
	app.log.debug(`RunDataSourceRunHandler > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<RunDataSourceTask>('runDataSource');
	const output = await task.process(event);
	app.log.debug(`RunDataSourceRunHandler > handler > exit:`);
	return output;
};
