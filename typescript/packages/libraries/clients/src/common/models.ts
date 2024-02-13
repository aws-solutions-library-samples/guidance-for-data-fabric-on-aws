export interface LambdaRequestContext {
	authorizer: {
		claims: {
			email: string;
			'cognito:groups': string;
			groupContextId: string;
		};
	};
}
