import rateLimit from 'express-rate-limit';

const tooManyRequests = (message: string) => ({
  success: false,
  error: { code: 'TOO_MANY_REQUESTS', message },
});

// 会員登録・パスワード再設定など、成功そのものが繰り返されると迷惑になる操作
// （アカウント量産、他人へのメール送りつけ）を抑える。成功・失敗の両方を数える。
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequests('試行回数が多すぎます。しばらく待ってから再試行してください。'),
});

// ログインは「パスワードの総当たり」を防ぐのが目的なので、失敗した試行だけを数える。
// 成功まで数えると、同じIPを共有する購入者（携帯キャリア回線・職場・店舗Wi-Fi等）が
// 互いを締め出してしまい、買い物ができなくなる。
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequests('ログインの失敗が続いています。しばらく待ってから再試行してください。'),
});

// トークン更新はログイン中の端末が自動的に呼ぶ（アクセストークンは15分で失効する）。
// 推測が現実的でないランダムなトークンを検証するだけなので総当たりの対象ではなく、
// ログインと同じ枠で絞ると、買い物中の購入者が突然ログアウトさせられてしまう。
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequests('リクエストが多すぎます。しばらく待ってから再試行してください。'),
});

// 1ページの表示で商品一覧・カテゴリ・カート等へ5前後のリクエストが発生するため、
// 上限は「1人が普通に閲覧し続けても届かない」水準に置く。低すぎると、SNSで
// 紹介された直後や、同一IPを共有する携帯キャリア回線の購入者同士が締め出される。
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'リクエストが多すぎます。しばらく待ってから再試行してください。' },
  },
});

// 注文確定はカード試行・在庫連打などの悪用影響が大きいため、通常APIより厳しく絞る。
// ログイン済みユーザー単位で制限し、同一IPの複数会員が互いをブロックしないようにする。
export const orderRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: '注文リクエストが多すぎます。しばらく待ってから再試行してください。' },
  },
});
