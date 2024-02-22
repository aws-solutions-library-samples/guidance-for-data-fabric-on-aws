import { buildLightApp } from '../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { JobTask } from '../tasks/jobTask.js';
import type { DataBrewTaskHandler as Handler } from '../tasks/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: Handler = async (event, _context, _callback) => {
	app.log.debug(`JobHandler > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<JobTask>('jobTask');
	const output = await task.process(event);
	app.log.debug(`JobHandler > handler > exit:`);
	return output;
};
