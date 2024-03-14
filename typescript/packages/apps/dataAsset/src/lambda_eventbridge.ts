import type { Callback, Context, EventBridgeHandler } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light';
import { CrawlerStateChangeEvent, DATA_BREW_JOB_STATE_CHANGE, DATA_QUALITY_EVALUATION_RESULTS_AVAILABLE, DataQualityResultsAvailableEvent, GLUE_CRAWLER_STATE_CHANGE, JobStateChangeEvent } from '@df/events';
import type { JobEventProcessor } from './events/job.eventProcessor.js';
import type { GlueCrawlerEventProcessor } from './events/glueCrawler.eventProcessor';
import type { DataQualityProfileEventProcessor } from "./events/dataQualityProfile.eventProcessor";

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const jobEventProcessor = di.resolve<JobEventProcessor>('jobEventProcessor');
const glueCrawlerEventProcessor = di.resolve<GlueCrawlerEventProcessor>('glueCrawlerEventProcessor');
const dataQualityEventProcessor = di.resolve<DataQualityProfileEventProcessor>('dataQualityProfileEventProcessor');


export const handler: EventBridgeHandler<string, EventDetails, void> = async (event, _context: Context, _callback: Callback) => {
	app.log.info(`EventBridgeLambda > handler > event: ${JSON.stringify(event)}`);

	// Filter Data brew Job status change events
	if ( (event['detail-type'] as string) === DATA_BREW_JOB_STATE_CHANGE && event['source'] === 'aws.databrew' ) {
		await jobEventProcessor.processJobCompletionEvent(event as unknown as JobStateChangeEvent);

	// Filter Glue crawler events
	} else if ( (event['detail-type'] as string) === GLUE_CRAWLER_STATE_CHANGE && event['source'] === 'aws.glue' && ['Succeeded','Failed'].includes(event['detail']['state']) ) {

		await glueCrawlerEventProcessor.completionEvent(event as unknown as CrawlerStateChangeEvent);

	// Filter Glue Data quality events
	} else if ((event['detail-type'] as string) === DATA_QUALITY_EVALUATION_RESULTS_AVAILABLE && event['source'] === 'aws.glue-dataquality' && ['SUCCEEDED', 'FAILED'].includes(event['detail']['state'])) {
        await dataQualityEventProcessor.dataQualityProfileCompletionEvent(event as unknown as DataQualityResultsAvailableEvent);
        // any other events are not handled
    } else {
		app.log.error(`EventBridgeLambda > handler > Unimplemented event: ${JSON.stringify(event)}`);
	}
	app.log.info(`EventBridgeLambda > handler >exit`);

};

type EventDetails = JobStateChangeEvent  | CrawlerStateChangeEvent
