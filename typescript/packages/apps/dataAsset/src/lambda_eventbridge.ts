import type { EventBridgeHandler, Context, Callback } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light';
import  { DATA_ASSET_SPOKE_JOB_RESPONSE_EVENT, DataAssetJobEvent } from '@df/events';
import type { JobEventProcessor } from './events/job.eventProcessor.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const eventProcessor = di.resolve<JobEventProcessor>('jobEventProcessor');


export const handler: EventBridgeHandler<string, EventDetails, void> = async (event, _context: Context, _callback: Callback) => {
	app.log.info(`EventBridgeLambda > handler > event: ${JSON.stringify(event)}`);

	const eventDetail = event.detail as DataAssetJobEvent;
	// filter job start event 
	if ((event['detail-type'] as string).startsWith(DATA_ASSET_SPOKE_JOB_RESPONSE_EVENT)) {
		const detail = eventDetail;

		if ( detail.job.jobRunStatus === 'Started' ) {
			await eventProcessor.jobStartEvent(detail);
		}
		
	// any other events are not handled
	} else {
		app.log.error('EventBridgeLambda > handler > Unimplemented event: ${JSON.Stringify(event)}');
	}
	app.log.info(`EventBridgeLambda > handler >exit`);

};

type EventDetails = DataAssetJobEvent