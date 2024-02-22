export function extractObjectDetailsFromUri (uri: string) {
	const [bucket] = uri.replace('s3://','').split('/');
	const key = uri.replace(`s3://${bucket}/`,'');
	return {Bucket: bucket , Key: key}
}

export function getObjectArnFromUri (uri: string) {
	const objectPath = uri.replace('s3://','');
	return `arn:aws:s3:::${objectPath}`;
}