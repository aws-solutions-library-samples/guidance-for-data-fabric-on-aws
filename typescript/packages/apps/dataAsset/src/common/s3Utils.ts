import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { DataAssetTask, TaskType } from "../stepFunction/tasks/models.js";
import type { BaseLogger } from "pino";
import type { GetSignedUrl } from "../plugins/module.awilix.js";


export class S3Utils {

    constructor(
        private readonly log: BaseLogger, 
        private readonly s3Client: S3Client, 
        private readonly bucketName: string, 
        private readonly bucketPrefix: string,
        private readonly getSignedUrl:GetSignedUrl
        ) {
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
        this.log.trace(`S3Utils > getTaskData > taskData: ${JSON.stringify(taskData)}`)
        return taskData;
    }

    public async getTaskDataSignedUrl(taskName: string, id: string, expiresIn: number): Promise<string> {
        this.log.trace(`S3Utils > getTaskDataSignedUrl > taskName: ${taskName}, id: ${id}`)
        const params: GetObjectCommand = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: `${this.bucketPrefix}/${id}/${taskName}.json`
        });
        const url = await this.getSignedUrl(this.s3Client, params, { expiresIn: expiresIn });
        return url;
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

    public getRecipeJobOutputLocationPath(id: string, domainId: string, projectId: string): string {
        const outputLocation = this.getRecipeJobOutputLocation(id, domainId, projectId);
        return `s3://${outputLocation.Bucket}/${outputLocation.Key}`;
    }

    public getRecipeDataSetTempLocation(id: string, domainId: string, projectId: string): { Bucket: string, Key: string } {
        return {
            Bucket: this.bucketName,
            Key: `${this.bucketPrefix}/${domainId}/${projectId}/${id}/recipeDataSetTemp`
        }
    }

    public getProfileDataSetTempLocation(id: string, domainId: string, projectId: string): { Bucket: string, Key: string } {
        return {
            Bucket: this.bucketName,
            Key: `${this.bucketPrefix}/${domainId}/${projectId}/${id}/profileDataSetTemp`
        }
    }
}



