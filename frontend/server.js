// 依存パッケージ不要の簡易静的ファイルサーバー（開発・プレビュー用）
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT ?? 5173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// リクエストパスをROOT配下のファイルパスへ解決する。
// 不正なエンコーディング・ROOT外へ出るパス・nullバイトはnullを返す。
function resolveRequestPath(rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;

  let filePath = resolve(join(ROOT, pathname));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) return null;

  try {
    if (statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
  } catch {
    // 存在しないパスは404側で処理する
  }
  return filePath;
}

function statOrNull(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.end('Method Not Allowed');
      return;
    }

    let filePath = resolveRequestPath(req.url ?? '/');
    if (filePath === null) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    if (!statOrNull(filePath)?.isFile()) {
      filePath = join(ROOT, '404.html');
      res.statusCode = 404;
      if (!statOrNull(filePath)?.isFile()) {
        res.end('Not Found');
        return;
      }
    }

    res.setHeader('Content-Type', MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(filePath)
      .on('error', () => {
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      })
      .pipe(res);
  } catch {
    if (!res.headersSent) res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`Solo Shop frontend: http://localhost:${PORT}`);
});
