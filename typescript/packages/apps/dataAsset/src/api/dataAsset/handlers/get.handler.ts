import { apiVersion100, commonHeaders, FastifyTypebox, notFoundResponse } from '@sdf/resource-api-base';
import { Type } from '@sinclair/typebox';

import { id, dataAssetResource } from '../schemas.js';

export default function getDataAssetsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/dataassets/:assetId',

		schema: {
			description: `Retrieve details of a specific data asset.`,
			tags: ['Data Assets'],
			headers: commonHeaders,
			params: Type.Object({
				assetId: id
			}),
			response: {
				200: {
					description: 'Success.',
					...dataAssetResource
				},
				404: notFoundResponse,
			}
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('dataAssetService');
			const dataAsset = await svc.get(request.params.assetId);
			await reply.status(200).send(dataAsset); // nosemgrep
		},
	});

	done();
}
