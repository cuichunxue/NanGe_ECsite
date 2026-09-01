import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { sendMailInBackground } from './mail.service';
import { carrierLabel, trackingUrlFor } from '../config/carrier';

/**
 * 注文に関するメール通知。
 *
 * どの関数も呼び出し元を待たせず、失敗しても注文処理に影響を与えない。
 * 個人運営では「注文が入ったことに気づけない」ことが最大の機会損失になるため、
 * 店主への通知を軸に、購入者にも節目で状況を知らせる。
 */

const yen = (value: unknown) => `¥${Number(value).toLocaleString('ja-JP')}`;

type OrderForMail = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

function loadOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: { select: { name: true, email: true } } },
  });
}

/** 配送先はスナップショットで保存されているため、住所変更後も注文当時の宛先を再現できる */
function formatAddress(snapshot: unknown): string {
  const a = (snapshot ?? {}) as Record<string, string | undefined>;
  const zip = a.postalCode ? `〒${a.postalCode}\n` : '';
  return `${zip}${a.province ?? ''}${a.city ?? ''}${a.district ?? ''}${a.detail ?? ''}\n${a.recipient ?? ''} 様（${a.phone ?? ''}）`;
}

/**
 * 追跡番号の案内。購入者が最も知りたい情報なので、番号と追跡ページのURLを載せる。
 * 追跡に対応しない発送方法もあるため、控えが無ければ何も出さない。
 */
function formatTracking(order: OrderForMail): string[] {
  if (!order.trackingNumber) return [];
  const lines = ['', `配送業者: ${carrierLabel(order.carrier)}`, `お問い合わせ番号: ${order.trackingNumber}`];
  const url = trackingUrlFor(order.carrier, order.trackingNumber);
  if (url) lines.push(`配送状況: ${url}`);
  lines.push('※ 反映まで、発送から数時間かかることがあります。');
  return lines;
}

function formatItems(order: OrderForMail): string {
  return order.items.map((i) => `・${i.productName} × ${i.quantity}　${yen(i.price)}`).join('\n');
}

function formatAmounts(order: OrderForMail): string {
  return [
    `商品小計: ${yen(order.subtotal)}`,
    `送料: ${Number(order.shippingFee) === 0 ? '無料' : yen(order.shippingFee)}`,
    ...(Number(order.codFee ?? 0) > 0 ? [`代引手数料: ${yen(order.codFee)}`] : []),
    `合計: ${yen(order.totalAmount)}`,
  ].join('\n');
}

/** 注文通知の宛先。OWNER_EMAIL 未設定なら管理者(店主)アカウントのアドレスを使う */
async function resolveOwnerEmail(): Promise<string | null> {
  if (env.ownerEmail) return env.ownerEmail;
  const owner = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { email: true } });
  return owner?.email ?? null;
}

/** 購入者へ注文内容の控えを送る */
export function notifyOrderPlaced(orderId: string): void {
  void (async () => {
    const order = await loadOrder(orderId);
    if (!order) return;
    sendMailInBackground({
      to: order.user.email,
      subject: `【Solo Shop】ご注文ありがとうございます（${order.orderNo}）`,
      text: [
        `${order.user.name} 様`,
        '',
        'ご注文ありがとうございます。以下の内容で承りました。',
        '',
        `注文番号: ${order.orderNo}`,
        '',
        '【ご注文商品】',
        formatItems(order),
        '',
        formatAmounts(order),
        '',
        '【お届け先】',
        formatAddress(order.addressSnapshot),
        '',
        `ご注文の状況はこちらからご確認いただけます:`,
        `${env.siteUrl}/order-detail.html?id=${order.id}`,
      ].join('\n'),
    });
  })().catch((err) => console.error('[mail] 注文確認メールの準備に失敗しました', err));
}

/** 店主へ「発送をお願いします」と知らせる */
export function notifyOwnerOrderPaid(orderId: string): void {
  void (async () => {
    const [order, ownerEmail] = await Promise.all([loadOrder(orderId), resolveOwnerEmail()]);
    if (!order || !ownerEmail) return;
    sendMailInBackground({
      to: ownerEmail,
      // そのまま返信すれば購入者に届くようにしておく（発送の連絡や在庫の相談に使える）
      replyTo: order.user.email,
      subject: `【Solo Shop】新しいご注文がありました（${order.orderNo}）`,
      text: [
        'お支払いが完了した注文があります。発送をお願いします。',
        '',
        `注文番号: ${order.orderNo}`,
        `ご購入者: ${order.user.name} 様（${order.user.email}）`,
        '',
        '【商品】',
        formatItems(order),
        '',
        formatAmounts(order),
        '',
        '【お届け先】',
        formatAddress(order.addressSnapshot),
        '',
        '管理画面から発送処理を行ってください:',
        `${env.siteUrl}/admin/order-detail.html?id=${order.id}`,
      ].join('\n'),
    });
  })().catch((err) => console.error('[mail] 注文通知メールの準備に失敗しました', err));
}

/**
 * 代金引換の注文が入ったことを店主に知らせる。
 *
 * 代金引換はKOMOJUを通らないため入金の通知が来ない。この関数が無いと、
 * 店主は代金引換の注文にまったく気づけず、管理画面を開くまで放置される。
 * 注文が入ったことに気づけないのは、個人運営では最大の機会損失になる。
 */
export function notifyOwnerCodOrder(orderId: string): void {
  void (async () => {
    const [order, ownerEmail] = await Promise.all([loadOrder(orderId), resolveOwnerEmail()]);
    if (!order || !ownerEmail) return;
    sendMailInBackground({
      to: ownerEmail,
      // そのまま返信すれば購入者に届くようにしておく
      replyTo: order.user.email,
      subject: `【Solo Shop】新しいご注文がありました（代金引換 / ${order.orderNo}）`,
      text: [
        '代金引換のご注文が入りました。発送をお願いします。',
        '代金は商品のお届け時に、配達員がお預かりします。',
        '',
        `注文番号: ${order.orderNo}`,
        `ご購入者: ${order.user.name} 様（${order.user.email}）`,
        '',
        '【商品】',
        formatItems(order),
        '',
        formatAmounts(order),
        '',
        '【お届け先】',
        formatAddress(order.addressSnapshot),
        '',
        '管理画面から発送処理を行ってください:',
        `${env.siteUrl}/admin/order-detail.html?id=${order.id}`,
      ].join('\n'),
    });
  })().catch((err) => console.error('[mail] 代金引換の注文通知の準備に失敗しました', err));
}

/**
 * 取り消し済みの注文に入金が届いたことを店主に知らせる。
 * 商品を確保していないのに代金だけ受け取った状態なので、返金の判断が要る。
 */
export function notifyOwnerPaymentNeedsAttention(orderId: string, paymentId: string): void {
  void (async () => {
    const [order, ownerEmail] = await Promise.all([loadOrder(orderId), resolveOwnerEmail()]);
    if (!order || !ownerEmail) return;
    sendMailInBackground({
      to: ownerEmail,
      replyTo: order.user.email,
      subject: `【Solo Shop】要確認: 取り消し済みの注文に入金がありました（${order.orderNo}）`,
      text: [
        'お支払い期限が過ぎて取り消した注文に、入金が確認されました。',
        '商品の在庫は売り場に戻してあるため、代金だけをお預かりしている状態です。',
        '返金するか、あらためて商品を確保して発送するかをご判断ください。',
        '',
        `注文番号: ${order.orderNo}`,
        `決済ID: ${paymentId}`,
        `ご購入者: ${order.user.name} 様（${order.user.email}）`,
        '',
        '【商品】',
        formatItems(order),
        '',
        formatAmounts(order),
        '',
        `${env.siteUrl}/admin/order-detail.html?id=${order.id}`,
      ].join('\n'),
    });
  })().catch((err) => console.error('[mail] 要確認通知の準備に失敗しました', err));
}

/** 購入者へ発送を知らせる */
export function notifyOrderShipped(orderId: string): void {
  void (async () => {
    const order = await loadOrder(orderId);
    if (!order) return;
    sendMailInBackground({
      to: order.user.email,
      subject: `【Solo Shop】商品を発送しました（${order.orderNo}）`,
      text: [
        `${order.user.name} 様`,
        '',
        'ご注文いただいた商品を発送しました。到着まで今しばらくお待ちください。',
        '',
        `注文番号: ${order.orderNo}`,
        ...formatTracking(order),
        '',
        '【商品】',
        formatItems(order),
        '',
        '【お届け先】',
        formatAddress(order.addressSnapshot),
        '',
        '商品がお手元に届きましたら、下記ページの「受け取りました」ボタンを押してください。',
        `${env.siteUrl}/order-detail.html?id=${order.id}`,
      ].join('\n'),
    });
  })().catch((err) => console.error('[mail] 発送通知メールの準備に失敗しました', err));
}
