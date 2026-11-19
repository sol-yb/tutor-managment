import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

let client: S3Client | null = null;

function getClient() {
  if (!env.STORAGE_ENDPOINT || !env.STORAGE_ACCESS_KEY || !env.STORAGE_SECRET_KEY) return null;
  client ??= new S3Client({
    endpoint: env.STORAGE_ENDPOINT,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY },
  });
  return client;
}

export async function putPrivateObject(key: string, body: Buffer, contentType: string) {
  const s3 = getClient();
  if (!s3 || !env.STORAGE_BUCKET) return false;
  await s3.send(new PutObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key, Body: body, ContentType: contentType }));
  return true;
}

export async function getPrivateObject(key: string) {
  const s3 = getClient();
  if (!s3 || !env.STORAGE_BUCKET) return null;
  const result = await s3.send(new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
  if (!result.Body) return null;
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function deletePrivateObject(key: string) {
  const s3 = getClient();
  if (!s3 || !env.STORAGE_BUCKET) return false;
  await s3.send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
  return true;
}
