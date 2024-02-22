import FastifySwagger, { FastifySwaggerOptions } from '@fastify/swagger';
import fp from 'fastify-plugin';
import { writeFile } from 'fs';

export default fp<FastifySwaggerOptions>(async (app) => {
	await app.register(FastifySwagger, {
		openapi: {
			info: {
				title: 'DF: Asset Management',
				description:
					'\nHas accountability for:\n- managing Assets in data zone\n\t- creating data brew jobs for profiling and data conversion \n\t- running data bre job for profiling and data quality\n',
				version: '0.0.1',
			},
			servers: [
				{
					url: 'http://localhost',
				},
			],
			tags: [
				{
					name: 'Asset Management',
					description: 'Asset Management',
				},
			],
			components: {
				securitySchemes: {
					platformUserPool: {
						type: 'apiKey',
						name: 'Authorization',
						in: 'header',
					},
				},
			},
			security: [],
		}
	});

	if (process.env['NODE_ENV'] === 'local') {
		const specFile = './docs/swagger.json';

		app.ready(() => {
			const apiSpec = JSON.stringify(app.swagger(), null, 2);

			writeFile(specFile, apiSpec, (err) => {
				if (err) {
					return app.log.error(`failed to save api spec to ${specFile} - err:${err}`);
				}
				app.log.debug(`saved api spec to ${specFile}`);
			});
		});
	}
});
