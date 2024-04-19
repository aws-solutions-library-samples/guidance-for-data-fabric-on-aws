import { Type } from '@sinclair/typebox';
import { dataAssetTaskResource, newDataAssetTaskResource } from '../schemas.js';
import { apiVersion100, badRequestResponse, commonHeaders, FastifyTypebox, serviceUnavailableResponse } from '@df/resource-api-base';

export default function createDataAssetTasksRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
    fastify.route({
        method: 'POST',
        url: '/dataAssetTasks',
        schema: {
            description: `Creates a new task to create data asset in DF(Data Foundation)`,
            tags: ['Data Asset Task'],
            headers: commonHeaders,
            body: {
                ...Type.Ref(newDataAssetTaskResource),
            },
            response: {
                201: {
                    description: 'Success.',
                    ...Type.Ref(dataAssetTaskResource),
                },
                400: badRequestResponse,
                503: serviceUnavailableResponse
            },
        },
        constraints: {
            version: apiVersion100
        },

        handler: async (request, reply) => {
            const svc = fastify.diContainer.resolve('dataAssetTaskService');
            const asset = await svc.create(request.authz, request.body);
            await reply.status(201).send(asset); // nosemgrep
        }
    });

    done();
}
