import { buildLightApp } from '../../../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { CreateAssetTask } from '../../../tasks/hub/create/createAssetTask.js'
import type { DataAssetTaskHandler as Handler } from '../../../tasks/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: Handler = async (event, _context, _callback) => {
	app.log.debug(`CreateAssetHandler > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<CreateAssetTask>('createAssetTask');
	const output = await task.process(event);
	app.log.debug(`CreateAssetHandler > handler > exit:`);
	return output;
};
