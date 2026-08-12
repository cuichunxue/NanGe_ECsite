import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { startOrderCleanup } from './services/orderCleanup.service';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[Solo Shop API] listening on port ${env.port} (${env.nodeEnv})`);
});

// 支払われなかった注文が在庫を握ったままにならないよう、定期的に売り場へ戻す
startOrderCleanup();

async function shutdown(signal: string) {
  console.log(`\n${signal} received. shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 想定外の例外でプロセス全体が無応答になるのを防ぐため、ログを残してから
// 安全に終了する（自動再起動はプロセスマネージャ/オーケストレータに委ねる）。
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  server.close(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  server.close(() => process.exit(1));
});
