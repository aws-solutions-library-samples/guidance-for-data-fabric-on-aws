import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { DataAssetTask, TaskType } from "../stepFunction/tasks/models.js";
import type { BaseLogger } from "pino";


export class S3Utils {

    constructor(private readonly log: BaseLogger, private readonly s3Client: S3Client, private readonly bucketName: string, private readonly bucketPrefix: string) {
    }

    public static getObjectArnFromUri(uri: string): string {
        const objectPath = uri.replace('s3://', '');
        return `arn:aws:s3:::${objectPath}`;
    }

    public static extractObjectDetailsFromUri(uri: string): { Bucket: string, Key: string } {
        const [bucket] = uri.replace('s3://', '').split('/');
        const key = uri.replace(`s3://${bucket}/`, '');
        return {Bucket: bucket, Key: key}
    }

    public async putTaskData(taskName: TaskType, id: string, content: DataAssetTask): Promise<void> {
        this.log.trace(`S3Utils > putTaskData > taskName: ${taskName}, id: ${id}, content: ${content}`)
        await this.s3Client.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: `${this.bucketPrefix}/${id}/${taskName}.json`,
            Body: JSON.stringify(content)
        }))
        this.log.trace(`S3Utils > putTaskData > exit:`)
    }

    public async getTaskData(taskName: string, id: string): Promise<DataAssetTask> {
        this.log.trace(`S3Utils > getTaskData > taskName: ${taskName}, id: ${id}`)
        const res = await this.s3Client.send(new GetObjectCommand({
            Bucket: this.bucketName,
            Key: `${this.bucketPrefix}/${id}/${taskName}.json`
        }));
        const taskData = JSON.parse(await res.Body.transformToString())
        this.log.trace(`S3Utils > getTaskData > taskData: ${taskData}`)
        return taskData;
    }

    public getProfilingJobOutputLocation(id: string, domainId: string, projectId: string): { Bucket: string, Key: string } {
        return {
            Bucket: this.bucketName,
            Key: `${this.bucketPrefix}/${domainId}/${projectId}/${id}/profilingJobOutput`
        }
    }

    public getRecipeJobOutputLocation(id: string, domainId: string, projectId: string): { Bucket: string, Key: string } {
        return {
            Bucket: this.bucketName,
            Key: `${this.bucketPrefix}/${domainId}/${projectId}/${id}/recipeJobOutput`
        }
    }
}


