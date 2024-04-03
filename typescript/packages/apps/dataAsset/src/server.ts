import url from 'url';
import { buildApp } from './app.js';

const startServer = async (): Promise<void> => {
	const app = await buildApp();
	try {
		await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
	} catch (err) {
		app.log.error(err);
		process.exit(1);
	}
};

// if called directly, e.g. local dev, start the fastify server
const path: string = process.argv[1] as string;
const href: string = url.pathToFileURL(path).href;
if (import.meta.url === href) {
	await startServer();
}
