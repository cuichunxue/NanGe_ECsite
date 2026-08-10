import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

let transporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return Boolean(env.smtp.host && env.mailFrom);
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      ...(env.smtp.user ? { auth: { user: env.smtp.user, pass: env.smtp.pass } } : {}),
    });
  }
  return transporter;
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
    await getTransporter().sendMail({
      from: env.mailFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
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
