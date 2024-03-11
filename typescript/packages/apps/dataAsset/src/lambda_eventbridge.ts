import type { EventBridgeHandler, Context, Callback } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light';
import  {DataAssetJobStartEvent, DATA_BREW_JOB_STATE_CHANGE, JobStateChangeEvent, DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT, DataAssetSpokeJobCompletionEvent, GLUE_CRAWLER_STATE_CHANGE, CrawlerStateChangeEvent } from '@df/events';
import type { JobEventProcessor } from './events/job.eventProcessor.js';
import type { GlueCrawlerEventProcessor } from './events/glueCrawler.eventProcessor';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const jobEventProcessor = di.resolve<JobEventProcessor>('jobEventProcessor');
const glueCrawlerEventProcessor = di.resolve<GlueCrawlerEventProcessor>('glueCrawlerEventProcessor');


export const handler: EventBridgeHandler<string, EventDetails, void> = async (event, _context: Context, _callback: Callback) => {
	app.log.info(`EventBridgeLambda > handler > event: ${JSON.stringify(event)}`);

	// TODO Remove Job Start Events we no longer have start events
	// Filter job start event 
	// if ((event['detail-type'] as string).startsWith(DATA_ASSET_SPOKE_JOB_START_EVENT)) {
		
	// 	const detail = eventDetail as DataAssetJobStartEvent;
	// 	await jobEventProcessor.jobStartEvent(detail);
		
	// } else
	 if ((event['detail-type'] as string).startsWith(DATA_ASSET_SPOKE_JOB_COMPLETE_EVENT)) {
		
		await jobEventProcessor.jobCompletionEvent(event as DataAssetSpokeJobCompletionEvent);
				
	// Filter Data brew Job status change events 
	} else if ( (event['detail-type'] as string) === DATA_BREW_JOB_STATE_CHANGE && event['source'] === 'aws.databrew' ) {
		
		await jobEventProcessor.profileJobCompletionEvent(event as unknown as JobStateChangeEvent);

	// Filter Glue crawler events
	} else if ( (event['detail-type'] as string) === GLUE_CRAWLER_STATE_CHANGE && event['source'] === 'aws.glue' && ['Succeeded','Failed'].includes(event['detail']['state']) ) {
		
		await glueCrawlerEventProcessor.completionEvent(event as unknown as CrawlerStateChangeEvent);

	// any other events are not handled
	} else {
		app.log.error('EventBridgeLambda > handler > Unimplemented event: ${JSON.Stringify(event)}');
	}
	app.log.info(`EventBridgeLambda > handler >exit`);

};

type EventDetails = DataAssetJobStartEvent| JobStateChangeEvent | DataAssetSpokeJobCompletionEvent | CrawlerStateChangeEvent