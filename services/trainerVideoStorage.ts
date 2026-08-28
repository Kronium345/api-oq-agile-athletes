import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import jwt from 'jsonwebtoken';
import path from 'path';
import type { Readable } from 'stream';

export type TrainerVideoStorageProvider = 'local' | 'r2';

export const TRAINER_VIDEO_MAX_BYTES = Number(process.env.TRAINER_VIDEO_MAX_BYTES) || 100 * 1024 * 1024;

const SIGNED_URL_TTL_SEC =
  Number(process.env.TRAINER_VIDEO_SIGNED_URL_TTL_SEC) || 60 * 60;

const LOCAL_ROOT = 'uploads';

function resolveStorageProvider(): TrainerVideoStorageProvider {
  const raw = process.env.TRAINER_VIDEO_STORAGE?.trim().toLowerCase();
  if (raw === 'r2') return 'r2';
  if (raw === 'local') return 'local';
  return isR2Configured() ? 'r2' : 'local';
}

function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET?.trim()
  );
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET is required for trainer video play tokens');
  }
  return secret;
}

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID!.trim();
  const endpoint =
    process.env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`;

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    },
  });
}

export function buildTrainerVideoStorageKey(trainerId: string, videoId: string, ext = '.mp4'): string {
  return `trainer-videos/${trainerId}/${videoId}${ext}`;
}

export function getTrainerVideoStorageProvider(): TrainerVideoStorageProvider {
  return resolveStorageProvider();
}

export function getPublicApiBaseUrl(fallbackHost?: string): string {
  const configured =
    process.env.TRAINER_VIDEO_API_BASE_URL?.trim() ||
    process.env.WORKFLOW_CALLBACK_URL?.trim() ||
    process.env.API_PUBLIC_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, '');
  }

  if (fallbackHost) {
    return fallbackHost.replace(/\/$/, '');
  }

  const port = process.env.PORT || '4000';
  return `http://localhost:${port}`;
}

export function signTrainerVideoPlayToken(videoId: string, userId: string): string {
  return jwt.sign(
    { videoId, userId, purpose: 'trainer-video-play' },
    getJwtSecret(),
    { expiresIn: SIGNED_URL_TTL_SEC }
  );
}

export function verifyTrainerVideoPlayToken(
  token: string
): { videoId: string; userId: string } | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    if (
      payload.purpose !== 'trainer-video-play' ||
      typeof payload.videoId !== 'string' ||
      typeof payload.userId !== 'string'
    ) {
      return null;
    }
    return { videoId: payload.videoId, userId: payload.userId };
  } catch {
    return null;
  }
}

export async function uploadTrainerVideoObject(
  storageKey: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const provider = resolveStorageProvider();

  if (provider === 'r2') {
    const client = getR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!.trim(),
        Key: storageKey,
        Body: body,
        ContentType: contentType,
      })
    );
    return;
  }

  const filePath = path.join(LOCAL_ROOT, storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
}

export async function deleteTrainerVideoObject(storageKey: string, thumbnailKey?: string | null): Promise<void> {
  const provider = resolveStorageProvider();

  if (provider === 'r2') {
    const client = getR2Client();
    const bucket = process.env.R2_BUCKET!.trim();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
    if (thumbnailKey) {
      await client
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbnailKey }))
        .catch(() => undefined);
    }
    return;
  }

  const filePath = path.join(LOCAL_ROOT, storageKey);
  await fs.unlink(filePath).catch(() => undefined);
  if (thumbnailKey) {
    await fs.unlink(path.join(LOCAL_ROOT, thumbnailKey)).catch(() => undefined);
  }
}

export async function getTrainerVideoPlayUrl(
  storageKey: string,
  videoId: string,
  userId: string,
  apiBaseUrl: string
): Promise<string> {
  const provider = resolveStorageProvider();

  if (provider === 'r2') {
    const client = getR2Client();
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET!.trim(),
        Key: storageKey,
      }),
      { expiresIn: SIGNED_URL_TTL_SEC }
    );
  }

  const token = signTrainerVideoPlayToken(videoId, userId);
  return `${apiBaseUrl}/trainers/content/play/${videoId}?token=${encodeURIComponent(token)}`;
}

export async function getTrainerVideoThumbnailUrl(
  thumbnailKey: string | null | undefined,
  videoId: string,
  userId: string,
  apiBaseUrl: string
): Promise<string | null> {
  if (!thumbnailKey) return null;

  const provider = resolveStorageProvider();

  if (provider === 'r2') {
    const client = getR2Client();
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET!.trim(),
        Key: thumbnailKey,
      }),
      { expiresIn: SIGNED_URL_TTL_SEC }
    );
  }

  const token = signTrainerVideoPlayToken(`${videoId}:thumb`, userId);
  return `${apiBaseUrl}/trainers/content/play/${videoId}/thumbnail?token=${encodeURIComponent(token)}`;
}

export async function openLocalTrainerVideoStream(
  storageKey: string
): Promise<{ stream: Readable; contentType: string; contentLength?: number }> {
  const filePath = path.join(LOCAL_ROOT, storageKey);
  const stat = await fs.stat(filePath);
  const { createReadStream } = await import('fs');
  const ext = path.extname(storageKey).toLowerCase();
  const contentType =
    ext === '.mov' ? 'video/quicktime' : ext === '.webm' ? 'video/webm' : 'video/mp4';

  return {
    stream: createReadStream(filePath),
    contentType,
    contentLength: stat.size,
  };
}

export function isTrainerVideoStorageReady(): boolean {
  const provider = resolveStorageProvider();
  if (provider === 'local') return true;
  return isR2Configured();
}
