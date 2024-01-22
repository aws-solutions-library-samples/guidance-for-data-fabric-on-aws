import type { App } from 'aws-cdk-lib';

export function getOrThrow(app: App, name: string): string {
	const attribute = app.node.tryGetContext(name) as string;
	if (attribute === undefined) {
		throw new Error(`'${name}' is required`);
	}
	return attribute;
}
