import { buildLightApp } from '../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { ConnectionTask } from '../tasks/connectionTask.js';
import type { ConnectionTaskHandler as ConnectionHandler } from '../tasks/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: ConnectionHandler = async (event, _context, _callback) => {
	app.log.debug(`ConnectionHandler > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<ConnectionTask>('connectionTask');
	const output = await task.process(event);
	app.log.debug(`ConnectionHandler > handler > exit:`);
	return output;
};
