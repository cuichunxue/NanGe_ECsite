import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Expressの `trust proxy` 設定値を組み立てる。
 * nginx / Cloudflare などのリバースプロキシ配下では、これを設定しないと
 * 全ての訪問者がプロキシの1IPとして扱われ、レート制限がサイト全体で共有されてしまう。
 * 一方、直接公開しているのに有効化すると X-Forwarded-For を詐称してレート制限を
 * 回避できてしまうため、既定は無効とし、プロキシ配下のときだけ明示的に指定する。
 */
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined || raw === '') return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : raw; // 数値=信頼するホップ数 / 文字列=IPやサブネット指定
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  databaseUrl: required('DATABASE_URL'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  isProd: process.env.NODE_ENV === 'production',

  // メール本文に載せる購入者向けサイトのURL（注文詳細ページへのリンクに使う）
  siteUrl: (process.env.SITE_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
  mailFrom: process.env.MAIL_FROM ?? '',
  // 注文通知の宛先。未設定なら管理者(店主)アカウントのメールアドレスを使う。
  ownerEmail: process.env.OWNER_EMAIL ?? '',
};
