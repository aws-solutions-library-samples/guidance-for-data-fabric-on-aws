export class TransformerDefinitionError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'TransformerDefinitionError';
	}
}

export class CalculationDefinitionError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'CalculationDefinitionError';
	}
}

export class InvalidParameterError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'InvalidParameterError';
	}
}
