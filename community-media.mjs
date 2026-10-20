import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { fail } from './http-api.mjs';
export const PHOTO_LIMIT = 5 * 1024 * 1024;
export async function sanitizePhoto(input) {
  if (!Buffer.isBuffer(input) || !input.length || input.length > PHOTO_LIMIT) throw fail(413, 'Välj en bild på högst 5 MB');
  try {
    const image = sharp(input, { limitInputPixels: 24_000_000, animated: false, failOn: 'warning' });
    const meta = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages || 1) !== 1) throw fail(415, 'Välj en stillbild i JPEG-, PNG- eller WebP-format');
    // Sharp discards all EXIF/IPTC/XMP metadata unless explicitly asked to preserve it.
    return await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  } catch (error) { if (error.status) throw error; throw fail(415, 'Bilden kunde inte läsas'); }
}
export function createMediaStorage({ bucket = process.env.COMMUNITY_S3_BUCKET, client = new S3Client({ region: process.env.AWS_REGION || 'eu-north-1' }) } = {}) {
  return {
    configured: Boolean(bucket),
    async put(key, bytes) { if (!bucket) throw fail(503, 'Bilduppladdning är inte ansluten'); await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: 'image/jpeg', ServerSideEncryption: 'AES256' })); },
    async get(key) { const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key })); return Buffer.from(await result.Body.transformToByteArray()); },
    async remove(key) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
  };
}
