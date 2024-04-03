import { buildLightApp } from '../../../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { StartTask } from '../../../tasks/spoke/create/startTask.js';
import type { DataAssetEventHandler as Handler } from '../../../tasks/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: Handler = async (event, _context, _callback) => {
	app.log.debug(`StartHandler > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<StartTask>('spokeCreateStartTask');
	const output = await task.process(event);
	app.log.debug(`StartHandler > handler > exit:`);
	return output;
};
