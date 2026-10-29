import { env } from '@tiwa/config';
import { S3Storage, type Storage } from '@tiwa/storage';

// Private bucket for documents and originals (R2 in production, S3 mock locally).
const globalStorage = globalThis as unknown as { __tiwaStorage?: Storage };

export function privateStorage(): Storage {
  globalStorage.__tiwaStorage ??= new S3Storage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET_PRIVATE,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  });
  return globalStorage.__tiwaStorage;
}
