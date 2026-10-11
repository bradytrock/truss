export type StoredObjectBody = {
  transformToByteArray: () => Promise<Uint8Array>;
};

export type StoredObject = {
  key: string;
  body: StoredObjectBody | null;
  contentType: string;
  contentLength?: number;
  cacheControl?: string;
};

export function isMissingStorageError(error: unknown) {
  const record = error && typeof error === "object" ? (error as { statusCode?: number; code?: string }) : null;
  if (record?.statusCode === 404) return true;
  const code = record?.code || "";
  if (/BlobNotFound|ContainerNotFound|NoSuchKey|NotFound|NoSuchBucket/i.test(code)) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /NoSuchKey|NotFound|404|Key not found|NoSuchBucket|BlobNotFound|ContainerNotFound/i.test(message);
}

export async function readableToBytes(stream: AsyncIterable<Uint8Array | Buffer | string>) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
    else chunks.push(Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}
