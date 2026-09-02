import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { extractDomain } from './mailAuth.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** 返信先。未指定なら MAIL_REPLY_TO（なければ OWNER_EMAIL）を使う */
  replyTo?: string;
}

let transporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return Boolean(env.smtp.host && env.mailFrom);
}

export function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      ...(env.smtp.user ? { auth: { user: env.smtp.user, pass: env.smtp.pass } } : {}),
      // 自前で署名する場合のみ。送信サービス経由なら向こうが署名するため通常は未設定。
      ...(env.mailDkim.selector && env.mailDkim.privateKey
        ? {
            dkim: {
              domainName: extractDomain(env.mailFrom) ?? '',
              keySelector: env.mailDkim.selector,
              privateKey: env.mailDkim.privateKey,
            },
          }
        : {}),
    });
  }
  return transporter;
}

/** SMTPサーバーに接続できるか確かめる（`npm run mail:check` から使う） */
export async function verifyMailTransport(): Promise<void> {
  await getTransporter().verify();
}

/**
 * メールを送り、失敗したら例外を投げる。
 * 設定を確認する `npm run mail:check` のように、成否を知りたい場面で使う。
 */
export async function sendMailOrThrow(message: MailMessage): Promise<void> {
  const replyTo = message.replyTo || env.mailReplyTo || env.ownerEmail;
  await getTransporter().sendMail({
    from: env.mailFrom,
    to: message.to,
    subject: message.subject,
    text: message.text,
    // 返信できないメールは問い合わせの機会を失うだけでなく、受信側の評価も下げる
    ...(replyTo ? { replyTo } : {}),
  });
}

/**
 * メールを送る。SMTPが未設定の間は送信せず内容をログに出す。
 *
 * この関数は決して例外を投げない。メールは注文や決済の付随処理であり、
 * 送信に失敗したからといって注文自体を失敗させてはならないため、
 * 失敗はログに残すだけにとどめる。
 */
export async function sendMail(message: MailMessage): Promise<void> {
  if (!isMailConfigured()) {
    console.log(
      `[mail:未設定のため送信せず] 宛先=${message.to} 件名=${message.subject}\n${message.text}`,
    );
    return;
  }
  try {
    await sendMailOrThrow(message);
  } catch (err) {
    console.error(`[mail:送信失敗] 宛先=${message.to} 件名=${message.subject}`, err);
  }
}

/**
 * 呼び出し元の処理を待たせずにメールを送る。
 * 注文確定などの応答速度に影響させないため、結果は待たずログに任せる。
 */
export function sendMailInBackground(message: MailMessage): void {
  void sendMail(message);
}
