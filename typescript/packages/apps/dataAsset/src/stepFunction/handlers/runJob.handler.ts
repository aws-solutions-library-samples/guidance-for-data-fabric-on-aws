import { buildLightApp } from '../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { RunJobTask } from '../tasks/runJobTask.js';
import type { RunJobTaskHandler as Handler } from '../tasks/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: Handler = async (event, _context, _callback) => {
	app.log.debug(`RunJobHandler > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<RunJobTask>('runJobTask');
	const output = await task.process(event);
	app.log.debug(`RunJobHandler > handler > exit:`);
	return output;
};
