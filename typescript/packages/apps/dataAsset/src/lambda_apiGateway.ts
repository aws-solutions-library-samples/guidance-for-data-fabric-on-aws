import awsLambdaFastify, { PromiseHandler } from '@fastify/aws-lambda';
import { buildApp } from './app.js';
import type { FastifyInstance } from 'fastify';

const server: FastifyInstance = await buildApp();

export const handler: PromiseHandler = awsLambdaFastify(server, {
	decorateRequest: false,
	serializeLambdaArguments: true,
});

await server.ready();
