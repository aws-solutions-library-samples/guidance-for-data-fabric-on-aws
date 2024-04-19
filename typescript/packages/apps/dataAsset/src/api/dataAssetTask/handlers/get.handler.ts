import { apiVersion100, commonHeaders, FastifyTypebox, id } from '@df/resource-api-base';
import { Type } from '@sinclair/typebox';
import { dataAssetTaskResource, } from '../schemas.js';

export default function getDataAssetTaskRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
    fastify.route({
        method: 'GET',
        url: '/dataAssetTasks/:taskId',
        schema: {
            description: `Get data asset task.`,
            tags: ['Data Asset Task'],
            headers: commonHeaders,
            params: Type.Object({
                taskId: id
            }),
            response: {
                200: {
                    description: 'Success.',
                    ...dataAssetTaskResource,
                },
            },
        },
        constraints: {
            version: apiVersion100,
        },

        handler: async (request, reply) => {
            const svc = fastify.diContainer.resolve('dataAssetTaskService');
            const dataAssetTask = await svc.get(request.authz, request.params.taskId);
            await reply.status(200).send(dataAssetTask); // nosemgrep
        },
    });

    done();
}
