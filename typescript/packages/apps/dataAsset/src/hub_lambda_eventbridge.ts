import type { Callback, Context, EventBridgeHandler } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light';
import { CreateResponseEvent, DATA_ASSET_SPOKE_CREATE_REQUEST_EVENT, DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT, DATA_ASSET_SPOKE_EVENT_SOURCE, DATA_ZONE_DATA_SOURCE_RUN_FAILED, DATA_ZONE_DATA_SOURCE_RUN_SUCCEEDED, DATA_ZONE_EVENT_SOURCE, DataSourceRunStateChangeEvent, SpokeCreateRequestEvent, createRequestEventDetails } from '@df/events';
import type { EventProcessor } from './events/hub/eventProcessor.js';
import type { DataZoneEventProcessor } from './events/hub/datazone.eventProcessor';
import type { DataAssetTasksService } from './api/dataAssetTask/service';
import type { NewDataAssetTaskResource } from './api/dataAssetTask/schemas';


const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const hubEventProcessor = di.resolve<EventProcessor>('hubEventProcessor');
const dataZoneEventProcessor = di.resolve<DataZoneEventProcessor>('dataZoneEventProcessor');
const dataAssetTaskService = di.resolve<DataAssetTasksService>('dataAssetTaskService');


export const handler: EventBridgeHandler<string, EventDetails, void> = async (event, _context: Context, _callback: Callback) => {
	app.log.info(`HubEventBridgeLambda > handler > event: ${JSON.stringify(event)}`);

	// Filter Data brew Job status change events
	if ((event['detail-type'] as string) === DATA_ASSET_SPOKE_CREATE_RESPONSE_EVENT && event['source'] === DATA_ASSET_SPOKE_EVENT_SOURCE) {
		await hubEventProcessor.processSpokeCompletionEvent(event as unknown as CreateResponseEvent);
	} 
	/**
	 * This handles the DataZone create data source success and failure event.
	 */
	else if ([DATA_ZONE_DATA_SOURCE_RUN_FAILED, DATA_ZONE_DATA_SOURCE_RUN_SUCCEEDED].includes((event['detail-type'] as string)) && event['source'] === DATA_ZONE_EVENT_SOURCE) {
		await dataZoneEventProcessor.dataSourceRunCompletionEvent(event as unknown as DataSourceRunStateChangeEvent);
	}
	/**
	 * This create data source request event comes from spoke account
	 */
	else if ([DATA_ASSET_SPOKE_CREATE_REQUEST_EVENT].includes((event['detail-type'] as string)) && event['source'] === DATA_ASSET_SPOKE_EVENT_SOURCE) {
		const details = event.detail as unknown as createRequestEventDetails;
		app.log.info(`HubEventBridgeLambda > handler > details: ${JSON.stringify(details)}`);
		const dataAsset:NewDataAssetTaskResource = {
			catalog: details.catalog,
			workflow: details.workflow
		}
		app.log.info(`HubEventBridgeLambda > handler > dataAsset: ${JSON.stringify(dataAsset)}`);
		await dataAssetTaskService.create({ userId: details.idcUserId, email: details.idcEmail }, dataAsset)
	}
	else {
		app.log.error(`EventBridgeLambda > handler > Unimplemented event: ${JSON.stringify(event)}`);
	}
	app.log.info(`HubEventBridgeLambda > handler >exit`);

};

type EventDetails = CreateResponseEvent | DataSourceRunStateChangeEvent | SpokeCreateRequestEvent
