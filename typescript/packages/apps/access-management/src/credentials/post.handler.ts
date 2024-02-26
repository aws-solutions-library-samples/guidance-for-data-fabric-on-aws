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
import { apiVersion100, FastifyTypebox } from "../common/types.js";
import { commonHeaders, forbiddenResponse, notFoundResponse } from "../common/schemas.js";
import { assetListingId, projectId, credentialsResource, domainId } from './schemas.js';
import { exampleCredentials1 } from './examples.js';

export default function postCredentialsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/domains/:domainId/projects/:projectId/assets/:assetListingId/credentials',

		schema: {
			description: `Generate credentials`,
			tags: ['Access Management'],
			operationId: 'generateCredentials',
			headers: commonHeaders,
			params: Type.Object({
				domainId: domainId,
				projectId: projectId,
				assetListingId: assetListingId,
			}),
			response: {
				201: {
					description: 'Success.',
					id: '1234',
					...credentialsResource,
					'x-examples': {
						'New credentials': {
							summary: 'New credentials',
							value: exampleCredentials1,
						},
					},
				},
				403: forbiddenResponse,
				404: notFoundResponse,
			},
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('credentialsService');

			const { domainId, projectId, assetListingId } = request.params;
			const { userId } = request.authz;
			const credentials = await svc.createTemporaryCredentialsForAsset(userId, domainId, projectId, assetListingId);
			
			return reply.status(200).send(credentials);
		}
	});

	done();
}
