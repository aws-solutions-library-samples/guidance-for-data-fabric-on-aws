import type { EventBridgeHandler, Context, Callback } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light';
import  { DATA_ASSET_SPOKE_JOB_START_EVENT, DataAssetJobStartEvent, DATA_BREW_JOB_STATE_CHANGE, JobStateChangeEvent, DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT, DataAssetSpokeJobCompletionEvent } from '@df/events';
import type { JobEventProcessor } from './events/job.eventProcessor.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const eventProcessor = di.resolve<JobEventProcessor>('jobEventProcessor');


export const handler: EventBridgeHandler<string, EventDetails, void> = async (event, _context: Context, _callback: Callback) => {
	app.log.info(`EventBridgeLambda > handler > event: ${JSON.stringify(event)}`);

	const eventDetail = event.detail as EventDetails;
	// Filter job start event 
	if ((event['detail-type'] as string).startsWith(DATA_ASSET_SPOKE_JOB_START_EVENT)) {
		
		const detail = eventDetail as DataAssetJobStartEvent;
		await eventProcessor.jobStartEvent(detail);
		
	} else if ((event['detail-type'] as string).startsWith(DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT)) {
		
		await eventProcessor.jobCompletionEvent(event as DataAssetSpokeJobCompletionEvent);
			
		
	// Filter Job status change events 
	} else if ( (event['detail-type'] as string) === DATA_BREW_JOB_STATE_CHANGE && event['source'] === 'aws.databrew' ) {
		
		await eventProcessor.jobEnrichmentEvent(event as unknown as JobStateChangeEvent);

	// any other events are not handled
	} else {
		app.log.error('EventBridgeLambda > handler > Unimplemented event: ${JSON.Stringify(event)}');
	}
	app.log.info(`EventBridgeLambda > handler >exit`);

};

type EventDetails = DataAssetJobStartEvent| JobStateChangeEvent | DataAssetSpokeJobCompletionEvent