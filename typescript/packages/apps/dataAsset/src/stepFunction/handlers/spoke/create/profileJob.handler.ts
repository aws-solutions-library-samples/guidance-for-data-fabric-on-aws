import { buildLightApp } from '../../../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { ProfileJobTask } from '../../../tasks/spoke/create/profileJobTask.js';
import type { DataAssetTaskHandler as Handler } from '../../../tasks/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: Handler = async (event, _context, _callback) => {
	app.log.debug(`JobHandler > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<ProfileJobTask>('profileJobTask');
	const output = await task.process(event);
	app.log.debug(`JobHandler > handler > exit:`);
	return output;
};
