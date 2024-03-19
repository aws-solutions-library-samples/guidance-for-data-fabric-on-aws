import type { Callback, Context, EventBridgeHandler } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light';
import { CreateResponseEvent, DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT,  DATA_ASSET_SPOKE_EVENT_SOURCE, DATA_ZONE_DATA_SOURCE_RUN_FAILED, DATA_ZONE_DATA_SOURCE_RUN_SUCCEEDED, DATA_ZONE_EVENT_SOURCE } from '@df/events';
import type { EventProcessor } from './events/hub/eventProcessor.js';
import type { DataZoneEventProcessor } from './events/hub/datazone.eventProcessor';


const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const hubEventProcessor = di.resolve<EventProcessor>('hubEventProcessor');
const dataZoneEventProcessor = di.resolve<DataZoneEventProcessor>('dataZoneEventProcessor');


export const handler: EventBridgeHandler<string, EventDetails, void> = async (event, _context: Context, _callback: Callback) => {
	app.log.info(`HubEventBridgeLambda > handler > event: ${JSON.stringify(event)}`);

	// Filter Data brew Job status change events
	if ( (event['detail-type'] as string) === DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT && event['source'] === DATA_ASSET_SPOKE_EVENT_SOURCE ) {
		await hubEventProcessor.processSpokeCompletionEvent(event as unknown as CreateResponseEvent);

	} else if ([DATA_ZONE_DATA_SOURCE_RUN_FAILED, DATA_ZONE_DATA_SOURCE_RUN_SUCCEEDED].includes((event['detail-type'] as string)) && event['source'] === DATA_ZONE_EVENT_SOURCE) {
		await dataZoneEventProcessor.dataSourceRunCompletionEvent(event as unknown as CreateResponseEvent);

	}else {
		app.log.error(`EventBridgeLambda > handler > Unimplemented event: ${JSON.stringify(event)}`);
	}
	app.log.info(`HubEventBridgeLambda > handler >exit`);

};

type EventDetails =  CreateResponseEvent
