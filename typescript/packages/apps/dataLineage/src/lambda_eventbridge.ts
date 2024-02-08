import type { EventBridgeHandler, Context, Callback } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light';
import { DATA_LINEAGE_DIRECT_INGESTION_REQUEST_EVENT, LineageIngestionEventDetail } from '@sdf/events';
import type { DirectLineageEventProcessor } from './events/directLineage.eventProcessor.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const eventProcessor = di.resolve<DirectLineageEventProcessor>('directLineageEventProcessor');


export const handler: EventBridgeHandler<string, EventDetails, void> = async (event, _context: Context, _callback: Callback) => {
	app.log.info(`EventBridgeLambda > handler > event: ${JSON.stringify(event)}`);

	// filter event for direct ingestion into Marquez
	if (event['detail-type'] === DATA_LINEAGE_DIRECT_INGESTION_REQUEST_EVENT) {
		const detail = event.detail as LineageIngestionEventDetail;
		await eventProcessor.processDirectLineageIngestionEvent(detail);
		
		// any other events are not handled
	} else {
		app.log.error('EventBridgeLambda > handler > Unimplemented event: ${JSON.Stringify(event)}');
	}

};

type EventDetails = LineageIngestionEventDetail


