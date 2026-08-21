import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError, ZodIssue } from 'zod';
import { ApiError } from '../utils/apiError';

/**
 * 入力チェックと、その結果を利用者に伝える文面の組み立て。
 *
 * Zodの既定のメッセージは英語で、しかも `body.phone` のような内部の構造名が付く。
 * これをそのまま返すと、購入者は注文の途中で「body.phone: String must contain...」を
 * 見せられ、何を直せばよいのか分からなくなる。ここで日本語に整えてから返す。
 */

/** 入力欄の内部名と、利用者に見せる呼び名の対応 */
const FIELD_LABEL: Record<string, string> = {
  name: 'お名前',
  email: 'メールアドレス',
  password: 'パスワード',
  currentPassword: '現在のパスワード',
  newPassword: '新しいパスワード',
  phone: '電話番号',
  recipient: 'お届け先のお名前',
  province: '都道府県',
  city: '市区町村',
  district: '町名・番地',
  detail: '建物名・部屋番号',
  postalCode: '郵便番号',
  quantity: '数量',
  productId: '商品',
  addressId: '配送先',
  orderId: '注文',
  paymentMethod: 'お支払い方法',
  price: '価格',
  originalPrice: '定価',
  stock: '在庫数',
  sku: '商品コード(SKU)',
  brand: 'ブランド',
  categoryId: 'カテゴリ',
  taxRate: '消費税率',
  description: '商品説明',
  images: '商品画像',
  status: '状態',
  rating: '評価',
  content: '内容',
  remark: '備考',
  carrier: '配送業者',
  trackingNumber: 'お問い合わせ番号',
  keyword: 'キーワード',
  token: '認証トークン',
};

/** `body.phone` のような内部の構造名を取り除き、利用者に見せる呼び名にする */
function labelFor(path: ZodIssue['path']): string {
  const parts = path.filter((p) => !['body', 'query', 'params'].includes(String(p)));
  const last = String(parts[parts.length - 1] ?? '');
  return FIELD_LABEL[last] ?? last;
}

/**
 * 1件の指摘を日本語の文にする。
 * スキーマ側で日本語のメッセージを指定してある場合は、そちらの方が具体的なのでそのまま使う。
 */
function toJapanese(issue: ZodIssue): string {
  // 非ASCII文字を含む＝スキーマ側で用意した日本語メッセージ。
  // ASCIIの範囲(\x00-\x7F)を指定するために制御文字を書く必要があるため、
  // 制御文字を禁じる検査だけここでは外す。
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(issue.message)) return issue.message;

  const label = labelFor(issue.path);
  switch (issue.code) {
    case 'invalid_type':
      // 値が送られてこなかった場合と、型が違う場合を区別する
      return issue.received === 'undefined' || issue.received === 'null'
        ? `${label}を入力してください`
        : `${label}の形式が正しくありません`;
    case 'too_small': {
      if (issue.type === 'string') {
        return Number(issue.minimum) <= 1 ? `${label}を入力してください` : `${label}は${issue.minimum}文字以上で入力してください`;
      }
      if (issue.type === 'array') {
        return Number(issue.minimum) <= 1 ? `${label}を1つ以上選んでください` : `${label}は${issue.minimum}個以上選んでください`;
      }
      return issue.inclusive
        ? `${label}は${issue.minimum}以上の数値を入力してください`
        : `${label}は${issue.minimum}より大きい数値を入力してください`;
    }
    case 'too_big': {
      if (issue.type === 'string') return `${label}は${issue.maximum}文字以内で入力してください`;
      if (issue.type === 'array') return `${label}は${issue.maximum}個までです`;
      return issue.inclusive
        ? `${label}は${issue.maximum}以下の数値を入力してください`
        : `${label}は${issue.maximum}より小さい数値を入力してください`;
    }
    case 'invalid_string':
      if (issue.validation === 'email') return 'メールアドレスの形式が正しくありません';
      if (issue.validation === 'url') return `${label}はURLの形式で入力してください`;
      if (issue.validation === 'uuid') return `${label}の指定が正しくありません`;
      return `${label}の形式が正しくありません`;
    case 'invalid_enum_value':
      return `${label}に選べない値が指定されています`;
    case 'unrecognized_keys':
      return '送信された内容に不明な項目が含まれています';
    default:
      return `${label}の入力内容をご確認ください`;
  }
}

/**
 * 指摘をまとめて1つの文面にする。
 * 同じ内容が並ぶと読みにくいため重複を除き、多すぎる場合は先頭だけを見せる
 * （一度に全部直させるより、1つずつ直してもらう方が迷わない）。
 */
function buildMessage(error: ZodError): string {
  const messages = [...new Set(error.errors.map(toJapanese))];
  if (messages.length <= 2) return messages.join(' ');
  return `${messages[0]} ほか${messages.length - 1}件をご確認ください`;
}

export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      if (parsed.body) req.body = parsed.body;
      if (parsed.query) req.query = parsed.query;
      if (parsed.params) req.params = parsed.params;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(ApiError.badRequest(buildMessage(err), 'VALIDATION_ERROR'));
      }
      next(err);
    }
  };
}
