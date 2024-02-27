/*
 *  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import type { EventBridgeHandler, Context, Callback } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light';
import type { DataZoneEventProcessor } from './events/datazone.processor.js';
import type { DataZoneSubscriptionEventDetail } from './events/models.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const dataZoneEventProcessor = di.resolve<DataZoneEventProcessor>('dataZoneEventProcessor');

export const handler: EventBridgeHandler<string, DataZoneSubscriptionEventDetail, void> = async (event, _context: Context, _callback: Callback) => {
	app.log.info(`EventBridgeLambda > handler > event: ${JSON.stringify(event)}`);

	if (event.source === 'aws.datazone' && event['detail-type'] === 'Subscription Created') {
		await dataZoneEventProcessor.processSubscriptionCreatedEvent(event.detail);
	} else {
		app.log.error(`EventBridgeLambda > handler > Unimplemented event: ${JSON.stringify(event)}`);
	}
};
