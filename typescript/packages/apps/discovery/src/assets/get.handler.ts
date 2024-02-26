/*
 *  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { Type } from '@sinclair/typebox';
import { apiVersion100, FastifyTypebox } from '../common/types.js';
import { commonHeaders, id, notFoundResponse } from "../common/schemas.js";
import { assetResource, domainId } from "./schemas.js";
import { assetExample } from "./example.js";

export default function getAssetsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
    fastify.route({
        method: 'GET',
        url: '/domains/:domainId/assets/:assetListingId',
        schema: {
            summary: 'Retrieve a asset metadata from AWS DataZone domain.',
            description: `Retrieve the asset metadata from AWS DataZone domain.`,
            tags: ['Assets', 'Data Assets'],
            operationId: 'get',
            headers: commonHeaders,
            params: Type.Object({
                domainId: domainId,
                assetListingId: id,
            }),
            response: {
                200: {
                    description: 'Success.',
                    ...assetResource,
                    'x-examples': {
                        'S3 Asset Type': {
                            summary: 'Asset retrieved successfully from DataZone catalog.',
                            value: assetExample,
                        },
                    },
                },
                404: notFoundResponse,
            }
        },
        constraints: {
            version: apiVersion100,
        },

        handler: async (request, reply) => {
            // DI
            const svc = fastify.diContainer.resolve('assetsService');
            const {domainId, assetListingId} = request.params;
            const { userId } = request.authz;
            const asset = await svc.get(userId, domainId, assetListingId)
            return reply.status(200).send(asset); // nosemgrep1
        },
    });

    done();
}
