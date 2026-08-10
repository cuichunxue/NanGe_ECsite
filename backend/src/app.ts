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
      origin: env.corsOrigin.split(',').map((s) => s.trim()),
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
