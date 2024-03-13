import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { DataAssetTask } from "../stepFunction/tasks/models";

export function extractObjectDetailsFromUri (uri: string) {
	const [bucket] = uri.replace('s3://','').split('/');
	const key = uri.replace(`s3://${bucket}/`,'');
	return {Bucket: bucket , Key: key}
}

export function getObjectArnFromUri (uri: string) {
	const objectPath = uri.replace('s3://','');
	return `arn:aws:s3:::${objectPath}`;
}


export async function putTaskData(s3Client:S3Client,bucketName:string, bucketPrefix:string, taskName:string, id:string, content:string ): Promise<void> {
	await s3Client.send(new PutObjectCommand({
		Bucket: bucketName,
		Key: `${bucketPrefix}/${id}/${taskName}.json`,
		Body: content
	}))
}

export async function getTaskData(s3Client:S3Client,bucketName:string, bucketPrefix:string, taskName:string, id:string ): Promise<DataAssetTask> {
	
	const res = await s3Client.send(new GetObjectCommand({
		Bucket: bucketName,
		Key: `${bucketPrefix}/${id}/${taskName}.json`
	}));
	const dataAsset :DataAssetTask = JSON.parse(await res.Body.transformToString());

	return dataAsset;
	
}