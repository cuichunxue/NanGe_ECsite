import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** env はモジュール読み込み時に組み立てられるため、環境変数を差し替えてから読み直す */
async function collectWith(overrides: Record<string, string>) {
  vi.resetModules();
  const saved = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    PUBLIC_API_URL: 'https://shop.example.com',
    SITE_URL: 'https://shop.example.com',
    CORS_ORIGIN: 'https://shop.example.com',
    SMTP_HOST: 'smtp.example.com',
    MAIL_FROM: 'Shop <shop@example.com>',
    KOMOJU_SECRET_KEY: 'sk_test',
    KOMOJU_WEBHOOK_SECRET: 'whsec',
    ...overrides,
  });
  const { collectStartupIssues } = await import('./startupCheck');
  const issues = collectStartupIssues();
  process.env = saved;
  return issues;
}

describe('起動時の設定確認', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it('本番の設定が揃っていれば何も言わない', async () => {
    expect(await collectWith({})).toEqual([]);
  });

  it('開発中は何も確認しない（設定が揃っていなくて当然のため）', async () => {
    const issues = await collectWith({ NODE_ENV: 'development', SMTP_HOST: '', KOMOJU_SECRET_KEY: '' });
    expect(issues).toEqual([]);
  });

  it('秘密鍵が設定例のままなら起動を止める', async () => {
    const issues = await collectWith({ JWT_ACCESS_SECRET: 'change-me-access-secret-min-32-chars-long' });
    expect(issues.some((i) => i.level === 'error' && i.message.includes('JWT_ACCESS_SECRET'))).toBe(true);
  });

  it('秘密鍵が短すぎても起動を止める', async () => {
    const issues = await collectWith({ JWT_REFRESH_SECRET: 'short' });
    expect(issues.some((i) => i.level === 'error')).toBe(true);
  });

  it('商品写真のURLが開発用のままなら知らせる（後から直せないため）', async () => {
    const issues = await collectWith({ PUBLIC_API_URL: 'http://localhost:4000' });
    expect(issues.some((i) => i.level === 'warn' && i.message.includes('PUBLIC_API_URL'))).toBe(true);
  });

  it('メールとKOMOJUの未設定は、止めずに知らせる', async () => {
    const issues = await collectWith({ SMTP_HOST: '', KOMOJU_SECRET_KEY: '' });
    expect(issues.every((i) => i.level === 'warn')).toBe(true);
    expect(issues).toHaveLength(2);
  });

  it('KOMOJUの鍵はあるのに通知用の署名鍵が無い場合を見つける', async () => {
    const issues = await collectWith({ KOMOJU_WEBHOOK_SECRET: '' });
    expect(issues.some((i) => i.message.includes('KOMOJU_WEBHOOK_SECRET'))).toBe(true);
  });
});
