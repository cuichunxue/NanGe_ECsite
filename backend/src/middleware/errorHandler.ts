import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/apiError';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `パス ${req.originalUrl} は存在しません` },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      // どの項目が重複したかを伝えないと、運営者は何を直せばよいか判断できない。
      // Prismaは meta.target に一意制約の対象カラムを返すので、日本語の項目名に対応付ける。
      const FIELD_LABEL: Record<string, string> = {
        sku: '商品コード(SKU)',
        email: 'メールアドレス',
        orderNo: '注文番号',
        token: '認証トークン',
      };
      const target = err.meta?.target;
      const columns = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
      const label = columns.map((c) => FIELD_LABEL[c] ?? c).join('・');
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE',
          message: label ? `この${label}は既に使われています。別の値を入力してください` : '既に存在するデータです',
        },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '対象データが見つかりません' },
      });
    }
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'サーバー内部エラーが発生しました' },
  });
}
