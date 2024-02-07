

import { Cradle, diContainer, FastifyAwilixOptions, fastifyAwilixPlugin } from '@fastify/awilix';
import { asFunction, asValue, Lifetime } from 'awilix';
import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import fp from 'fastify-plugin';
import { MarquezClient } from '@sdf/clients';


import { DirectLineageEventProcessor } from '../src/events/directLineage.eventProcessor.js';


declare module '@fastify/awilix' {
	interface Cradle {
		marquezClient: MarquezClient;
		directLineageEventProcessor: DirectLineageEventProcessor;
	}
}

declare function registerBaseAwilix(logger: FastifyBaseLogger): void;

const registerContainer = (app?: FastifyInstance) => {
	const commonInjectionOptions = {
		lifetime: Lifetime.SINGLETON
	};

	const marquezUrl = process.env['MARQUEZ_URL'] as string;
	const eventBusName = process.env['EVENT_BUS_NAME'];



	diContainer.register({
		
		marquezClient: asFunction(() => new MarquezClient(app.log, marquezUrl), {
			...commonInjectionOptions
		}),
		
		directLineageEventProcessor: asFunction(
			(container: Cradle) =>
				new DirectLineageEventProcessor(
					app.log,
					container.marquezClient
				),
			{
				...commonInjectionOptions
			}
		),
		
	});
};

export default fp<FastifyAwilixOptions>(async (app: FastifyInstance): Promise<void> => {
	// first register the DI plugin
	await app.register(fastifyAwilixPlugin, {
		disposeOnClose: true,
		disposeOnResponse: false
	});

	registerBaseAwilix(app.log);

	registerContainer(app);
});

export { registerContainer };
