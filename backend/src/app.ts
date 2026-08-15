import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { apiRateLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

import authRoutes from './routes/auth.routes';
import categoryRoutes from './routes/category.routes';
import productRoutes from './routes/product.routes';
import cartRoutes from './routes/cart.routes';
import orderRoutes from './routes/order.routes';
import reviewRoutes from './routes/review.routes';
import wishlistRoutes from './routes/wishlist.routes';
import addressRoutes from './routes/address.routes';
import adminRoutes from './routes/admin.routes';
import webhookRoutes from './routes/webhook.routes';

export function createApp() {
  const app = express();

  // リバースプロキシ配下では TRUST_PROXY を設定すること。未設定だと訪問者の
  // IPが全てプロキシのIPになり、レート制限が訪問者ごとではなくサイト全体に
  // かかってしまう（アクセスが集中した際に全員が締め出される）。
  app.set('trust proxy', env.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      // 本番は CORS_ORIGIN の許可リストに厳密に絞る。開発中は、Codespaces/Gitpod等の
      // クラウド開発環境が発行する転送URLが起動のたびに変わり得るため、送信元をそのまま
      // 許可する（`origin: true` はcorsパッケージの機能で、Originヘッダをそのまま反映する。
      // 実運用のデータを扱わない開発時のみの挙動であり、本番には影響しない）。
      origin: env.isProd ? env.corsOrigin.split(',').map((s) => s.trim()) : true,
      credentials: true,
    }),
  );
  app.use(compression());

  // 決済代行からのWebhookは署名検証のために生のボディが必要なので、
  // JSONパーサより前に登録する（先にJSONへ変換されると署名を再計算できない）。
  app.use('/api/webhooks', webhookRoutes);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (!env.isProd) {
    app.use(morgan('dev'));
  }
  // アップロードされた商品画像を配信する。
  // 中身は画像であることを確認済みだが、万一に備えて種別の推測を禁止し、
  // ブラウザが別の形式として解釈しないようにする。
  //
  // 購入者向けサイトはこのAPIとは別のオリジンで配信されるため、Helmetが既定で付ける
  // Cross-Origin-Resource-Policy: same-origin のままだと商品写真が表示されない。
  // 商品写真は誰でも見てよい公開情報なので、この配信経路に限り cross-origin を許す。
  app.use(
    '/uploads',
    express.static(env.uploadDir, {
      index: false,
      dotfiles: 'ignore',
      maxAge: '30d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );

  app.use('/api', apiRateLimiter);

  // liveness: プロセスが応答可能かのみを見る軽量チェック（依存先には触れない）
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
  });

  // readiness: DB疎通まで含めて確認する（ロードバランサ/オーケストレータのトラフィック振り分け判定用）
  app.get('/api/health/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ success: true, data: { status: 'ok', db: 'up', time: new Date().toISOString() } });
    } catch {
      res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'データベースに接続できません' } });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/wishlist', wishlistRoutes);
  app.use('/api/addresses', addressRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
