import { commonHeaders, forbiddenResponse, id, noBodyResponse, notFoundResponse, apiVersion100, FastifyTypebox } from '@df/resource-api-base';
import { Type } from '@sinclair/typebox';

export default function deleteDataAssetsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'DELETE',
		url: '/dataassets/:id',
		schema: {
			description: `Delete data asset`,
			tags: ['Data Asset'],
			operationId: 'delete',
			headers: commonHeaders,
			params: Type.Object({
				id,
			}),
			response: {
				204: noBodyResponse,
				404: notFoundResponse,
				403: forbiddenResponse,
			}
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('dataAssetService');
			await svc.delete(request.params.id);
			await reply.status(204).send();
		},
	});

	done();
}
