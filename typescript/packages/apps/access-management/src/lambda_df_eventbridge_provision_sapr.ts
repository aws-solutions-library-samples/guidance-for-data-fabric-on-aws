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
import type { DfEventProcessor } from './events/df.processor.js';
import type { DfEventDetail } from './events/models.js';
import { DFEventDetailType, DFEventSource } from '@df/cdk-common';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const dfEventProcessor = di.resolve<DfEventProcessor>('dfEventProcessor');

export const handler: EventBridgeHandler<string, DfEventDetail, void> = async (event, _context: Context, _callback: Callback) => {
	app.log.info(`EventBridgeLambda > handler > event: ${JSON.stringify(event)}`);

	if (event.source === DFEventSource.SUBSCRIPTION_ENRICHMENT && event['detail-type'] === DFEventDetailType.ENRICHED_SUBSCRIPTION_CREATED) {
		await dfEventProcessor.processDfSaprEvent(event.detail);
	} else {
		app.log.error(`EventBridgeLambda > handler > Unimplemented event: ${JSON.stringify(event)}`);
	}
};
