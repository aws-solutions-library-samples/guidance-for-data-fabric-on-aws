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

import { asFunction, Lifetime } from 'awilix';
import fp from 'fastify-plugin';

import { Cradle, diContainer, FastifyAwilixOptions, fastifyAwilixPlugin } from '@fastify/awilix';
import pkg from 'aws-xray-sdk';
import { IdentitystoreClient } from '@aws-sdk/client-identitystore';
import { STSClient } from '@aws-sdk/client-sts';
import { CredentialsService } from "../credentials/service.js";
import { IAMClient } from '@aws-sdk/client-iam';
import { DfEventProcessor } from '../events/df.processor.js';
import { DataZoneEventProcessor } from '../events/datazone.processor.js';
import { DataZoneClient } from '@aws-sdk/client-datazone';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { CredentialsRepository } from '../credentials/repository.js';

const {captureAWSv3Client} = pkg;

declare module '@fastify/awilix' {
	interface Cradle {
		identityStoreClient: IdentitystoreClient;
		stsClient: STSClient;
		iamClient: IAMClient;
		dataZoneClient: DataZoneClient;
		eventBridgeClient: EventBridgeClient;
		credentialsService: CredentialsService;
		dfEventProcessor: DfEventProcessor;
		dataZoneEventProcessor: DataZoneEventProcessor;
		credentialsRepository: CredentialsRepository;
	}
}

class DataZoneClientFactory {
	public static create(region: string): DataZoneClient {
		const dz = captureAWSv3Client(new DataZoneClient({
			region
		}));
		return dz;
	}
}

class IAMClientFactory {
	public static create(region: string): IAMClient {
		const iam = captureAWSv3Client(new IAMClient({
			region
		}));
		return iam;
	}
}

class EventBridgeClientFactory {
	public static create(region: string): EventBridgeClient {
		const eventBridge = captureAWSv3Client(new EventBridgeClient({
			region
		}));
		return eventBridge;
	}
}

class IdentityStoreClientFactory {
	public static create(region: string): IdentitystoreClient {
		const idc = captureAWSv3Client(new IdentitystoreClient({
			region
		}));
		return idc;
	}
}

class StsClientFactory {
	public static create(region: string): STSClient {
		const sts = captureAWSv3Client(new STSClient({
			region
		}));
		return sts;
	}
}

export default fp<FastifyAwilixOptions>(async (app): Promise<void> => {
	// first register the DI plugin
	await app.register(fastifyAwilixPlugin, {
		disposeOnClose: true,
		disposeOnResponse: false
	});

	const commonInjectionOptions = {
		lifetime: Lifetime.SINGLETON
	};

	const awsRegion = process.env['AWS_REGION'];
	// then we can register our classes with the DI container
	diContainer.register({
		dataZoneClient: asFunction(() => DataZoneClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),

		identityStoreClient: asFunction(() => IdentityStoreClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),
		iamClient: asFunction(() => IAMClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),
		eventBridgeClient: asFunction(() => EventBridgeClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),

		stsClient: asFunction(() => StsClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),

		credentialsRepository: asFunction((container: Cradle) => new CredentialsRepository(app.log, container.dataZoneClient, container.identityStoreClient, container.stsClient, app.config.IDENTITY_STORE_ID), {
			...commonInjectionOptions
		}),

		credentialsService: asFunction((container: Cradle) => new CredentialsService(app.log, container.credentialsRepository), {
			...commonInjectionOptions
		}),
		dfEventProcessor: asFunction((container: Cradle) => new DfEventProcessor(app.log, container.iamClient),{
			...commonInjectionOptions
		}),
		dataZoneEventProcessor: asFunction((container: Cradle) => new DataZoneEventProcessor(app.log, container.dataZoneClient, container.eventBridgeClient), {
			...commonInjectionOptions
		}),
	});
});
