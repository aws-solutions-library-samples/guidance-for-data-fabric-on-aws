export class AssetDefinitionError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'AssetDefinitionError';
	}
}

export class CatalogDefinitionError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'CatalogDefinitionError';
	}
}

export class ConnectionDefinitionError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'ConnectionDefinitionError';
	}
}

export class InvalidParameterError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'InvalidParameterError';
	}
}

export async function errorHandler(error, _request, reply) {
	// Log error
	this.log.error(`***** error: ${JSON.stringify(error)}`);
	this.log.error(`***** error.code: ${error.code}`);
	this.log.error(`***** error.name: ${error.name}`);
	this.log.error(`***** error.message: ${error.message}`);

	if (error.statusCode === 400 && Array.isArray(error.validation)) {
		return error;
	} else if (error.validation) {
		return reply.badRequest(error.message);
	} else {
		switch (error.name) {
			case 'AlternateIdInUseError':
				return reply.conflict(error.message);
			case 'ResourceInUseError':
			case 'QueryParameterError':
			case 'InvalidRequestError':
			case 'AssetDefinitionError': {
				return reply.badRequest(error.message);
			}
			case 'CatalogDefinitionError': {
				return reply.badRequest(error.message);
			}
			case 'ConnectionDefinitionError': {
				return reply.badRequest(error.message);
			}
			case 'InvalidParameterError': {
				return reply.badRequest(error.message);
			}
			case 'NotImplementedError': {
				return reply.notImplemented(error.message);
			}
			case 'UnauthorizedError': {
				return reply.forbidden(error.message);
			}
			case 'NotFoundError': {
				return reply.notFound(error.message);
			}
			// eslint-disable-next-line dot-notation
			default:
				return reply.imateapot('Unhandled error which needs wiring up in the error handler!');
		}
	}
}
