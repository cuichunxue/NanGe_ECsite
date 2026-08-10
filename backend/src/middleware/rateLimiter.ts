import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: '試行回数が多すぎます。しばらく待ってから再試行してください。' },
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
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
