import { apiVersion100, commonHeaders, FastifyTypebox, fromTokenPaginationQS, id } from '@df/resource-api-base';
import { Type } from '@sinclair/typebox';
import { countPaginationParam, DataAssetResourceList, dataAssetResourceList } from '../schemas.js';

export default function listDataAssetsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
    fastify.route({
        method: 'GET',
        url: '/domains/:domainId/projects/:projectId/dataAssets',
        schema: {
            description: `Lists of data assets.`,
            tags: ['Data Assets'],
            headers: commonHeaders,
            params: Type.Object({
                domainId: id,
                projectId: id,
            }),
            querystring: Type.Object({
                count: countPaginationParam,
                fromToken: fromTokenPaginationQS,
            }),
            response: {
                200: {
                    description: 'Success.',
                    ...dataAssetResourceList,
                },
            },
        },
        constraints: {
            version: apiVersion100,
        },

        handler: async (request, reply) => {
            const svc = fastify.diContainer.resolve('dataAssetService');
            const {count, fromToken} = request.query;

            const [dataAssets, lastEvaluatedToken] = await svc.list(request.params.domainId, request.params.projectId, {count, lastEvaluatedToken: fromToken});

            const response: DataAssetResourceList = {dataAssets};

            if (count || lastEvaluatedToken) {
                response.pagination = {};
                if (lastEvaluatedToken) {
                    response.pagination.lastEvaluatedToken = lastEvaluatedToken;
                }
            }
            await reply.status(200).send(response); // nosemgrep
        },
    });

    done();
}
