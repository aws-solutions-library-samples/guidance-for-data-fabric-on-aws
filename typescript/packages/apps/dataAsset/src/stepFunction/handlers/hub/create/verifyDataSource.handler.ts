import { buildLightApp } from '../../../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { VerifyDataSourceTask } from '../../../tasks/hub/create/verifyDataSourceTask.js'
import type { DataAssetTaskHandler as Handler } from '../../../tasks/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: Handler = async (event, _context, _callback) => {
	app.log.debug(`VerifyDataSourceRunHandler > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<VerifyDataSourceTask>('verifyDataSourceTask');
	const output = await task.process(event);
	app.log.debug(`VerifyDataSourceRunHandler > handler > exit:`);
	return output;
};
