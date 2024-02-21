import { Type } from '@sinclair/typebox';
import { badRequestResponse, commonHeaders, forbiddenResponse, id, apiVersion100, FastifyTypebox, notFoundResponse } from '@sdf/resource-api-base';
import { dataAssetResource, editDataAssetResource } from '../schemas.js';


export default function updateDataAssetsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PATCH',
		url: '/dataassets/:id',

		schema: {
			description: `Updates an existing data asset`,
			tags: ['Data Asset'],
			operationId: 'update',
			headers: commonHeaders,
			params: Type.Object({
				id,
			}),
			body: {
				...Type.Ref(editDataAssetResource),

			},
			response: {
				200: {
					description: 'Success.',
					...dataAssetResource
				},
				400: badRequestResponse,
				403: forbiddenResponse,
				404: notFoundResponse,
			}
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('dataAssetService');
			const updatedDataAsset = await svc.update(request.params.id, request.body);
			await reply.status(200).send(updatedDataAsset); // nosemgrep
		},
	});

	done();
}
