import { Type } from '@sinclair/typebox';
import { dataAssetResource, newDataAssetResource } from '../schemas.js';
import { apiVersion100, badRequestResponse, commonHeaders, FastifyTypebox, serviceUnavailableResponse } from '@df/resource-api-base';

export default function createDataAssetsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/dataassets',
		schema: {
			description: `Creates a new data asset`,
			tags: ['Data Asset'],
			headers: commonHeaders,
			body: {
				...Type.Ref(newDataAssetResource),
			},
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(dataAssetResource),
				},
				400: badRequestResponse,
				503: serviceUnavailableResponse
			},
		},
		constraints: {
			version: apiVersion100
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('dataAssetService');

			const asset = await svc.create(request.body);

			await reply.status(201).send(asset); // nosemgrep
		}
	});

	done();
}
