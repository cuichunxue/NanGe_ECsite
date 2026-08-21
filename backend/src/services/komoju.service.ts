import crypto from 'crypto';
import { env } from '../config/env';
import { komojuTypeFor } from '../config/payment';
import { ApiError } from '../utils/apiError';

/**
 * 決済代行 KOMOJU との通信。
 *
 * カード番号は当サイトを一切通らない。KOMOJUが用意する決済ページ（セッション）へ
 * 購入者を遷移させ、支払いの成否はKOMOJUからのWebhookで受け取る。
 * この方式にすることで、カード情報を自前で預からずに済む。
 *
 * 仕様は公式SDK(@komoju/komoju-sdk)の型定義に準拠:
 *   - ベースURL: https://komoju.com/api/v1
 *   - 認証: HTTP Basic（利用者名にシークレットキー、パスワードは空）
 *   - セッション作成: POST /sessions
 *   - 返金:           POST /payments/{id}/refund
 */

/**
 * 当サイトが購入者に提示する支払い方法と、KOMOJU側の呼び名の対応は
 * config/payment.ts にまとめてある（画面の選択肢と食い違わないようにするため）。
 */
export type OnlinePaymentMethod = string;

export function isKomojuConfigured(): boolean {
  return Boolean(env.komoju.secretKey);
}

function authorizationHeader(): string {
  // シークレットキーを利用者名、パスワードは空にしたBasic認証
  return `Basic ${Buffer.from(`${env.komoju.secretKey}:`).toString('base64')}`;
}

async function komojuRequest<T>(path: string, body: unknown): Promise<T> {
  if (!isKomojuConfigured()) {
    throw ApiError.badRequest('決済サービスが設定されていません', 'PAYMENT_NOT_CONFIGURED');
  }
  let res: Response;
  try {
    res = await fetch(`${env.komoju.apiBase}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorizationHeader(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // 決済会社に届かなかった場合。購入者には決済が始まっていないことを伝える。
    console.error(`[komoju] ${path} への接続に失敗しました`, err);
    throw ApiError.badGateway('決済サービスに接続できませんでした。時間をおいて再度お試しください', 'PAYMENT_UNAVAILABLE');
  }

  const payload = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    console.error(`[komoju] ${path} が ${res.status} を返しました`, payload);
    throw ApiError.badGateway('決済の手続きを開始できませんでした', 'PAYMENT_ERROR');
  }
  return payload as T;
}

export interface KomojuSession {
  id: string;
  session_url: string;
  status: 'pending' | 'completed' | 'cancelled';
  amount: number;
  currency: string;
}

export interface CreateSessionInput {
  /** 円単位の請求額。JPYは補助単位を持たないため、そのままの金額を渡す */
  amount: number;
  method: OnlinePaymentMethod;
  email: string;
  returnUrl: string;
  /** Webhookで注文を特定できるようにするための控え */
  orderId: string;
  orderNo: string;
  userId: string;
  lineItems: { name: string; amount: number; quantity: number }[];
}

export async function createPaymentSession(input: CreateSessionInput): Promise<KomojuSession> {
  const komojuType = komojuTypeFor(input.method);
  if (!komojuType) {
    // 呼び出し元で弾いているはずだが、代金引換の注文をここへ渡すと
    // KOMOJUに空の決済手段を要求してしまうため、念のため止める。
    throw ApiError.badRequest('この支払い方法はオンライン決済に対応していません', 'NOT_ONLINE_PAYMENT');
  }
  return komojuRequest<KomojuSession>('/sessions', {
    mode: 'payment',
    amount: input.amount,
    currency: 'JPY',
    return_url: input.returnUrl,
    email: input.email,
    // 在庫を確保しておく時間の半分で決済ページを閉じる。在庫を売り場に戻した後で
    // 支払いだけ成立してしまう（商品がないのに入金される）状態を避けるための余裕。
    expires_in_seconds: Math.floor((env.paymentHoldMinutes * 60) / 2),
    default_locale: 'ja',
    payment_types: [komojuType],
    external_customer_id: input.userId,
    line_items: input.lineItems.map((i) => ({
      description: i.name,
      amount: i.amount,
      quantity: i.quantity,
    })),
    // metadataの値は文字列でなければならない
    metadata: { order_id: input.orderId, order_no: input.orderNo },
  });
}

export async function refundPayment(paymentId: string, description: string): Promise<void> {
  await komojuRequest(`/payments/${encodeURIComponent(paymentId)}/refund`, { description });
}

/**
 * Webhookが本当にKOMOJUから届いたものかを検証する。
 *
 * 署名は「受信した生のバイト列」に対するHMAC-SHA256なので、JSONを解析して
 * 組み立て直した文字列では一致しない。必ず生のボディを渡すこと。
 * 比較は timingSafeEqual で行い、比較時間の差から署名を推測されないようにする。
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!env.komoju.webhookSecret) {
    console.error('[komoju] KOMOJU_WEBHOOK_SECRET が未設定のため、Webhookを受け付けられません');
    return false;
  }
  if (!signature) return false;

  const expected = crypto.createHmac('sha256', env.komoju.webhookSecret).update(rawBody).digest('hex');
  const received = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (received.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(received, expectedBuf);
}

/** Webhookで届くイベント。data には決済(Payment)が入る */
export interface KomojuEvent {
  id: string;
  type: string;
  data: {
    id: string;
    status: 'authorized' | 'cancelled' | 'captured' | 'expired' | 'failed' | 'pending' | 'refunded';
    amount: number;
    total: number;
    currency: string;
    session: string | null;
    metadata?: Record<string, string>;
    payment_details?: { type?: string };
  };
}
