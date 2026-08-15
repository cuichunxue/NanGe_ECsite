import { describe, expect, it, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });
});

describe('404 handler', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const app = createApp();
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('errorHandler の分類', () => {
  it('外部キー違反(P2003)を404として返す（500の内部エラーにしない）', async () => {
    const { errorHandler } = await import('./middleware/errorHandler');
    const { Prisma } = await import('@prisma/client');
    const err = new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated', {
      code: 'P2003',
      clientVersion: '5.22.0',
      meta: { field_name: 'Product_categoryId_fkey (index)' },
    });
    const json = { status: 0, body: null as unknown };
    const res = {
      status(code: number) {
        json.status = code;
        return this;
      },
      json(body: unknown) {
        json.body = body;
        return this;
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorHandler(err, {} as any, res as any, (() => {}) as any);
    expect(json.status).toBe(404);
    expect((json.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });
});

describe('壊れたJSONボディ', () => {
  it('クライアントの入力不備として400を返す（500の内部エラーにしない）', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":"a@b.com",}');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('CORS', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('開発時は、Codespaces/Gitpod等の転送URLのように事前に分からない送信元も許可する', async () => {
    process.env.NODE_ENV = 'development';
    vi.resetModules();
    const { createApp: createDevApp } = await import('./app');
    const app = createDevApp();

    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://foo-5173.app.github.dev')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBe('https://foo-5173.app.github.dev');
  });

  it('本番は CORS_ORIGIN の許可リストに無い送信元を拒む', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://shop.example.com';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);
    vi.resetModules();
    const { createApp: createProdApp } = await import('./app');
    const app = createProdApp();

    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('本番でも CORS_ORIGIN に含まれる送信元は許可する', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://shop.example.com';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);
    vi.resetModules();
    const { createApp: createProdApp } = await import('./app');
    const app = createProdApp();

    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://shop.example.com')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBe('https://shop.example.com');
  });
});
