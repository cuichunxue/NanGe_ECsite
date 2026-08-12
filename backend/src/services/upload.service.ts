import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';

/**
 * 商品画像の受け取りと保存。
 *
 * 受け取ったファイルは拡張子や申告された種別を信用せず、先頭のバイト列で
 * 実際の形式を判定する。SVGは中にスクリプトを書けてしまうため受け付けない。
 */

interface ImageKind {
  ext: string;
  mime: string;
}

/** 先頭バイト列から画像形式を判定する。判定できないものは受け付けない。 */
function detectImage(buf: Buffer): ImageKind | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', mime: 'image/png' };
  }
  // GIF: "GIF87a" / "GIF89a"
  if (buf.subarray(0, 6).toString('latin1') === 'GIF87a' || buf.subarray(0, 6).toString('latin1') === 'GIF89a') {
    return { ext: 'gif', mime: 'image/gif' };
  }
  // WebP: "RIFF" .... "WEBP"
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

/**
 * JPEGからEXIF等のメタデータ（APPnセグメント）を取り除く。
 *
 * スマートフォンで撮った写真には撮影場所の位置情報が埋め込まれていることがあり、
 * そのまま公開すると自宅の座標を配ってしまう。個人が自宅で撮影して出品する
 * 使い方を前提にしているため、既定で落とす。
 * 画素データ（SOS以降）には触れないので、画質は変わらない。
 */
function stripJpegMetadata(buf: Buffer): Buffer {
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) return buf;
  const out: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break; // マーカー列が壊れている場合は以降をそのまま残す
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xda) {
      // SOS以降は画素データなので、そのまま末尾まで通す
      out.push(buf.subarray(i));
      i = buf.length;
      break;
    }
    const length = buf.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > buf.length) break;
    const isAppSegment = marker >= 0xe0 && marker <= 0xef; // APP0〜APP15（EXIF/GPS/XMP等）
    const isComment = marker === 0xfe;
    if (!isAppSegment && !isComment) {
      out.push(buf.subarray(i, i + 2 + length));
    }
    i += 2 + length;
  }
  if (i < buf.length) out.push(buf.subarray(i));
  return Buffer.concat(out);
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface StoredImage {
  url: string;
  bytes: number;
}

export async function storeProductImage(file: { buffer: Buffer; size: number }): Promise<StoredImage> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw ApiError.badRequest(`画像は${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MBまでです`, 'IMAGE_TOO_LARGE');
  }
  const kind = detectImage(file.buffer);
  if (!kind) {
    throw ApiError.badRequest('画像ファイル（JPEG / PNG / GIF / WebP）を選んでください', 'UNSUPPORTED_IMAGE');
  }

  const data = kind.ext === 'jpg' ? stripJpegMetadata(file.buffer) : file.buffer;

  // 元のファイル名は使わない。名前に含まれる「../」などでの保存先の細工を防ぎ、
  // 既存ファイルの上書きも起きないようにする。
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${kind.ext}`;
  await fs.mkdir(env.uploadDir, { recursive: true });
  await fs.writeFile(path.join(env.uploadDir, name), data);

  return { url: `${env.publicApiUrl}/uploads/${name}`, bytes: data.length };
}
