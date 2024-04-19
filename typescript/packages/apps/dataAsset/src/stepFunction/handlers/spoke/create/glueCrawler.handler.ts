import { buildLightApp } from '../../../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { GlueCrawlerTask } from '../../../tasks/spoke/create/glueCrawlerTask.js';
import type { DataAssetTaskHandler as Handler } from '../../../tasks/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: Handler = async (event, _context, _callback) => {
	app.log.debug(`glueHandler > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<GlueCrawlerTask>('glueCrawlerTask');
	app.log.debug(`glueHandler > handler > before function invocation`);
	const output = await task.process(event);
	app.log.debug(`glueHandler > handler > exit:`);
	return output;
};
