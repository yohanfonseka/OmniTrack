import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** URL-safe random token. */
export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Short URL-safe id, e.g. for invite links. Avoids look-alike characters. */
export function shortCode(length = 8): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

let warnedDevKey = false;
function encryptionKey(): Buffer {
  if (config.tokenEncryptionKey) {
    const key = Buffer.from(config.tokenEncryptionKey, 'base64');
    if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
    return key;
  }
  if (config.isProduction) throw new Error('TOKEN_ENCRYPTION_KEY is required in production.');
  if (!warnedDevKey) {
    console.warn('[crypto] TOKEN_ENCRYPTION_KEY not set; using an insecure development key.');
    warnedDevKey = true;
  }
  return crypto.createHash('sha256').update('creatortrack-dev-only-key').digest();
}

/** AES-256-GCM. Output: iv.tag.ciphertext, each base64url. */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
