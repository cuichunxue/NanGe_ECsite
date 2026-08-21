import { env } from './env';

/**
 * 本番として起動するときに、設定の取り違えを起動時点で知らせる。
 *
 * 個人運営では、設定の間違いに気づくきっかけが「購入者からの連絡」しかない。
 * しかも商品写真のURLのように、間違ったまま保存されて後から直せなくなるものもある。
 * 開店してから気づくのでは遅いので、起動時に確認する。
 */

export interface StartupIssue {
  level: 'error' | 'warn';
  message: string;
}

/** .env.example をそのまま本番に持ってきてしまった場合に一致する値 */
const PLACEHOLDER_SECRETS = ['change-me-access-secret-min-32-chars-long', 'change-me-refresh-secret-min-32-chars-long'];

const isLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url);

export function collectStartupIssues(): StartupIssue[] {
  const issues: StartupIssue[] = [];
  if (!env.isProd) return issues;

  // --- 起動を止めるもの ---
  // 秘密鍵が例のままだと、誰でも管理者になりすませる。
  for (const [name, value] of [
    ['JWT_ACCESS_SECRET', env.jwtAccessSecret],
    ['JWT_REFRESH_SECRET', env.jwtRefreshSecret],
  ] as const) {
    if (PLACEHOLDER_SECRETS.includes(value)) {
      issues.push({ level: 'error', message: `${name} が設定例のままです。誰でも管理者になりすませる状態のため起動を中止します。\n    次のコマンドで作った値に置き換えてください: openssl rand -base64 48` });
    } else if (value.length < 32) {
      issues.push({ level: 'error', message: `${name} が短すぎます（${value.length}文字）。32文字以上にしてください: openssl rand -base64 48` });
    }
  }

  // --- 続行するが知らせるもの ---
  if (isLocal(env.publicApiUrl)) {
    issues.push({
      level: 'warn',
      message:
        'PUBLIC_API_URL が開発用のままです。この状態でアップロードした商品写真は、購入者から見えないURLで保存されます\n    （保存後に設定を直しても、その写真のURLは直りません）。公開URLを設定してください。',
    });
  }
  if (isLocal(env.siteUrl)) {
    issues.push({ level: 'warn', message: 'SITE_URL が開発用のままです。メールに載る注文詳細ページのリンクが開けません。' });
  }
  if (isLocal(env.corsOrigin) && !isLocal(env.publicApiUrl)) {
    issues.push({ level: 'warn', message: 'CORS_ORIGIN が開発用のままです。購入者向けサイトを別ドメインで配信している場合、ブラウザから接続できません。' });
  }
  if (!env.smtp.host || !env.mailFrom) {
    issues.push({ level: 'warn', message: 'メールが未設定です。注文確認・発送のお知らせが購入者に届きません（内容はログにのみ出力されます）。' });
  }
  if (!env.komoju.secretKey) {
    issues.push({
      level: 'warn',
      message: 'KOMOJU が未設定です。クレジットカード・PayPay・WeChat Payでの支払いはできません（代金引換のみ）。',
    });
  } else if (!env.komoju.webhookSecret) {
    issues.push({
      level: 'warn',
      message: 'KOMOJU_WEBHOOK_SECRET が未設定です。入金の通知を受け取れないため、支払い済みの注文が支払い待ちのままになります。',
    });
  }
  return issues;
}

/**
 * 設定を確認し、結果を表示する。
 * 起動を続けられない問題があれば false を返す。
 */
export function reportStartupIssues(issues = collectStartupIssues()): boolean {
  for (const issue of issues) {
    const label = issue.level === 'error' ? '[設定エラー]' : '[設定の確認]';
    console[issue.level === 'error' ? 'error' : 'warn'](`${label} ${issue.message}`);
  }
  return !issues.some((i) => i.level === 'error');
}
