import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ApiError } from '../utils/apiError';
import { MAX_IMAGE_BYTES } from '../services/upload.service';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `パス ${req.originalUrl} は存在しません` },
  });
}

// _next は使わないが、Expressはこの4引数の形でのみエラー処理として認識する
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  // リクエストのJSONが壊れている場合。body-parserがexpress.json()の中で投げる
  // SyntaxErrorで、クライアント側の入力不備でしかない（サーバーの不具合ではない）。
  // 判定せずに下の catch-all まで落とすと500として扱われ、ログにも「内部エラー」として
  // 記録されてしまい、運営者が実際のサーバー障害と区別できなくなる。
  if (err instanceof SyntaxError && (err as SyntaxError & { type?: string; status?: number }).type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'リクエストの形式が正しくありません' },
    });
  }

  // 本文が大きすぎる場合。body-parserは entity.too.large を投げる。
  // 判定しないと500になり、運営者にはサーバー障害と区別がつかなくなる。
  if ((err as { type?: string }).type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: '送信された内容が大きすぎます' },
    });
  }

  // 添付ファイルの制限に引っかかった場合。原因が分からないと運営者は
  // 「サイトが壊れた」と受け取ってしまうため、何をすればよいかを返す。
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `画像は${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MBまでです。小さくしてからお試しください`
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? '一度にアップロードできる画像は1枚です'
          : 'ファイルを受け取れませんでした';
    return res.status(400).json({ success: false, error: { code: err.code, message } });
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
    if (err.code === 'P2003') {
      // 参照先が存在しないIDを指定した場合（例: 削除済み・存在しないカテゴリIDで商品を作成）。
      // 運営者の入力ミスであり、サーバーの不具合ではないため404として返す。
      const field = String(err.meta?.field_name ?? '');
      const label = field.includes('categoryId') ? 'カテゴリ' : '関連データ';
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `指定された${label}が見つかりません` },
      });
    }
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'サーバー内部エラーが発生しました' },
  });
}
