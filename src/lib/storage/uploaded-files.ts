import { serverFileStorage } from './file-storage';
import { resolveStoragePrefix } from './file-storage/storage-utils';

const withPrefix = (key: string) => {
  const prefix = resolveStoragePrefix();
  const sanitizedKey = key.replace(/^\/+/, '');
  return prefix ? `${prefix}/${sanitizedKey}` : sanitizedKey;
};

export const buildOriginalKey = (fileId: string, extension: string) =>
  withPrefix(`${fileId}.${extension}`);

export const buildExtractedKey = (fileId: string) =>
  withPrefix(`${fileId}-extracted.json`);

export const buildEmbeddingsKey = (fileId: string) =>
  withPrefix(`${fileId}-embeddings.json`);

export const buildPagesKey = (fileId: string) =>
  withPrefix(`${fileId}-pages.json`);

export const readJsonFromStorage = async <T>(key: string): Promise<T> => {
  const buffer = await serverFileStorage.download(key);
  return JSON.parse(buffer.toString('utf8')) as T;
};

export const writeJsonToStorage = async (
  key: string,
  payload: unknown,
): Promise<void> => {
  const json = JSON.stringify(payload);
  await serverFileStorage.upload(Buffer.from(json, 'utf8'), {
    key,
    filename: key.split('/').pop() ?? key,
    contentType: 'application/json',
  });
};
