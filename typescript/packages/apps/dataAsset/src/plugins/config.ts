import fp from 'fastify-plugin';
import fastifyEnv, { FastifyEnvOptions } from '@fastify/env';
import { Static, Type } from '@sinclair/typebox';
import { baseConfigSchema, convertFromTypeBoxIntersectToJSONSchema } from '@df/resource-api-base';

// eslint-disable-next-line @rushstack/typedef-var
export const moduleConfigSchema = Type.Object({
	ASSET_MANAGEMENT_HUB_STATE_MACHINE_ARN: Type.String(),
	EVENT_BUS_NAME: Type.String(),
	PORT: Type.Number({ default: 30004 }),
	TABLE_NAME: Type.String(),
	DOMAIN_ID: Type.String()

});
export const configSchema = Type.Intersect([moduleConfigSchema, baseConfigSchema]);

export type ConfigSchemaType = Static<typeof configSchema>;

export default fp<FastifyEnvOptions>(async (app): Promise<void> => {
	await app.register(fastifyEnv, {
		confKey: 'config',
		schema: convertFromTypeBoxIntersectToJSONSchema(configSchema),
		dotenv: true,
	});
	app.log.info(`config: ${JSON.stringify(app.config)}`);
});

declare module 'fastify' {
	interface FastifyInstance {
		config: ConfigSchemaType;
	}
}
