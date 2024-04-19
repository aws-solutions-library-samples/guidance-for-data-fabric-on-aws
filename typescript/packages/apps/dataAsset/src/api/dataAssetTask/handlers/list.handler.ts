import { apiVersion100, commonHeaders, FastifyTypebox, fromTokenPaginationQS } from '@df/resource-api-base';
import { Type } from '@sinclair/typebox';
import { countPaginationParam, dataAssetTaskResourceList, DataAssetTaskResourceList } from '../schemas.js';

export default function listDataAssetTasksRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
    fastify.route({
        method: 'GET',
        url: '/dataAssetTasks',
        schema: {
            description: `Lists of data asset tasks.`,
            tags: ['Data Asset Tasks'],
            headers: commonHeaders,
            querystring: Type.Object({
                count: countPaginationParam,
                fromToken: fromTokenPaginationQS,
            }),
            response: {
                200: {
                    description: 'Success.',
                    ...dataAssetTaskResourceList,
                },
            },
        },
        constraints: {
            version: apiVersion100,
        },

        handler: async (request, reply) => {
            const svc = fastify.diContainer.resolve('dataAssetTaskService');
            const {count, fromToken} = request.query;

            const [dataAssetTasks, lastEvaluatedToken] = await svc.list(request.authz, {count, lastEvaluatedToken: fromToken});

            const response: DataAssetTaskResourceList = {dataAssetTasks};

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
