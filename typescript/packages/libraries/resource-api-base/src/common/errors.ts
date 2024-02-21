export class AlternateIdInUseError extends Error {
	public constructor(name: string) {
		super(`Name '${name}' already in use.`);
		this.name = 'AlternateIdInUseError';
	}
}

export class UnauthorizedError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'UnauthorizedError';
	}
}

export class ForbiddenError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'ForbiddenError';
	}
}

export class QueryParameterError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'QueryParameterError';
	}
}

export class NotFoundError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'NotFoundError';
	}
}

export class ResourceInUseError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'ResourceInUseError';
	}
}

export class NotImplementedError extends Error {
	public constructor(message?: string) {
		super(message);
		this.name = 'NotImplementedError';
	}
}

export class ServiceUnavailableError extends Error {
	public constructor(message?: string) {
		super(message);
		this.name = 'ServiceUnavailableError';
	}
}

export class InvalidNameError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'InvalidNameError';
	}
}

export class ConflictError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'ConflictError';
	}
}

export class InvalidStateError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'InvalidStateError';
	}
}

export class InvalidRequestError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'InvalidRequest';
	}
}

export class DatabaseTransactionError extends Error {
	public readonly reasons: TransactionCancellationReason[];

	public constructor(reasons: TransactionCancellationReason[]) {
		super('Transaction failed.');
		this.name = 'DatabaseTransactionError';
		this.reasons = reasons;
	}
}

export interface TransactionCancellationReason {
	item: unknown;
	code: string;
	message: string;
}
