import type { EventBridgeHandler, Context, Callback } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light';
import  { DATA_ASSET_SPOKE_EVENT_SOURCE, RunEvent } from '@sdf/events';
import type { DataAssetEventProcessor } from './events/dataAsset.eventProcessor.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const eventProcessor = di.resolve<DataAssetEventProcessor>('dataAssetEventProcessor');


export const handler: EventBridgeHandler<string, EventDetails, void> = async (event, _context: Context, _callback: Callback) => {
	app.log.info(`EventBridgeLambda > handler > event: ${JSON.stringify(event)}`);

	// filter event for direct ingestion into Marquez
	if ((event['detail-type'] as string).startsWith(DATA_ASSET_SPOKE_EVENT_SOURCE)) {
		const detail = event.detail as RunEvent;
		await eventProcessor.processDataAssetSpokeCreateResponseEvent(detail);
		
		// any other events are not handled
	} else {
		app.log.error('EventBridgeLambda > handler > Unimplemented event: ${JSON.Stringify(event)}');
	}

};

type EventDetails = RunEvent