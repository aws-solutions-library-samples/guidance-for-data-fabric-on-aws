
import { apiVersion100, commonHeaders, fromTokenPaginationQS, FastifyTypebox } from '@sdf/resource-api-base';
import { Type } from '@sinclair/typebox';
import { countPaginationParam, listDataAssetResource } from '../schemas.js';

export default function listDataAssetsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/dataassets',
		schema: {
			description: `Lists of data assets.`,
			tags: ['Data Assets'],
			headers: commonHeaders,
			querystring: Type.Object({
				count: countPaginationParam,
				fromToken: fromTokenPaginationQS,
			}),
			response: {
				200: {
					description: 'Success.',
					...listDataAssetResource,
				},
			},
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('dataAssetService');
			const { count, fromToken } = request.query;

			await svc.list({ count, lastEvaluatedToken: fromToken });

			// const [dataAssets, lastEvaluatedToken] = await svc.list({ count, lastEvaluatedToken: fromToken });
			// const response: ListDataAsset = { dataAssets };

			// if (count || lastEvaluatedToken) {
			// 	response.pagination = {};
			// 	if (lastEvaluatedToken) {
			// 		response.pagination.lastEvaluatedToken = lastEvaluatedToken.paginationToken;
			// 	}
			// }
			// await reply.status(200).send(response); // nosemgrep
			await reply.status(200).send();
		},
	});

	done();
}
