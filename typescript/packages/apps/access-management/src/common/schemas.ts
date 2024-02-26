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

/* eslint-disable @rushstack/typedef-var */
import { Type } from '@sinclair/typebox';

/**
 * Common path parameters
 */

/**
 * Common query string parameters
 */

export const countPaginationQS = Type.Optional(Type.Integer({ description: 'Count of results to return.' }));
export const fromIdPaginationQS = Type.Optional(Type.String({ description: 'Id to paginate from (exclusive).' }));
export const fromTokenPaginationQS = Type.Optional(Type.String({ description: 'Token used to paginate from (exclusive).' }));
export const nextTokenPaginationQS = Type.Optional(Type.String({ description: 'Pagination token.' }));
export const count = Type.Optional(
	Type.Integer({
		description: 'No. of results returned when pagination requested.'
	})
);

export const id = Type.String({ description: 'Unique id.' });


/**
 * Common resource parameters
 */
export const paginationToken = Type.String({ description: 'Token used to paginate to the next page of search result.' });

export const nextToken = Type.Optional(
	Type.String({
		description: 'Pagination token',
	})
);

/**
 * Common headers
 */
export const commonHeaders = Type.Object({
	'accept-version': Type.String({ description: 'API version' }),
	accept: Type.String({ description: 'Accepted Content Type' }),
});

/**
 * Common responses
 */
export const notFoundResponse = Type.Object(
	{
		message: Type.String(),
	},
	{ $id: 'notFoundResponse', description: 'Not found.' }
);

export const updatedResponse = Type.Object({}, { $id: 'updatedResponse', description: 'Updated successfully.' });

export const deletedResponse = Type.Object({}, { $id: 'deletedResponse', description: 'Deleted successfully.' });

export const badRequestResponse = Type.Object(
	{
		message: Type.String(),
	},
	{ $id: 'badRequestResponse', description: 'Bad request.' }
);


export const notImplementedResponse = Type.Object(
	{
		message: Type.String(),
	},
	{ $id: 'notImplementedResponse', description: 'Not implemented.' }
);

export const forbiddenResponse = Type.Object(
	{
		message: Type.String(),
	},
	{ $id: 'forbiddenResponse', description: 'Forbidden.' }
);

export const conflictResponse = Type.Object(
	{
		message: Type.String(),
		syntaxErrors: Type.Optional(
			Type.Object({
				charPositionInLine: Type.Integer(),
				line: Type.Integer(),
				msg: Type.String(),
			})
		),
	},
	{ $id: 'conflictResponse', description: 'Conflict.' }
);

export const noBodyResponse = Type.Object({}, { $id: 'noBodyResponse', description: 'Success.' });
