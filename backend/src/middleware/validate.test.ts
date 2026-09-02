import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate } from './validate';
import { errorHandler } from './errorHandler';

/**
 * 入力の間違いを利用者に伝える文面を固定する。
 *
 * ここが崩れると、購入者は注文の途中で「body.phone: String must contain at least
 * 1 character(s)」のような開発者向けの文言を見せられ、何を直せばよいか分からなくなる。
 */

function appWith(schema: z.AnyZodObject) {
  const app = express();
  app.use(express.json());
  app.post('/t', validate(schema), (_req, res) => res.json({ success: true }));
  app.use(errorHandler);
  return app;
}

const messageOf = async (schema: z.AnyZodObject, body: unknown) => {
  const res = await request(appWith(schema)).post('/t').send(body as object);
  return { status: res.status, message: res.body?.error?.message ?? '' };
};

describe('入力チェックの文面', () => {
  it('内部の構造名(body.◯◯)を利用者に見せない', async () => {
    const { message } = await messageOf(z.object({ body: z.object({ phone: z.string().min(1) }) }), { phone: '' });
    expect(message).not.toContain('body.');
    expect(message).toBe('電話番号を入力してください');
  });

  it('英語のまま返さない（必須項目の未入力）', async () => {
    const { message } = await messageOf(z.object({ body: z.object({ recipient: z.string().min(1) }) }), {});
    expect(message).toBe('お届け先のお名前を入力してください');
    expect(/[A-Za-z]{4,}/.test(message)).toBe(false);
  });

  it('数値の下限を日本語で伝える', async () => {
    const { message } = await messageOf(z.object({ body: z.object({ price: z.number().positive() }) }), { price: -1 });
    expect(message).toBe('価格は0より大きい数値を入力してください');
  });

  it('文字数の上限を日本語で伝える', async () => {
    const { message } = await messageOf(z.object({ body: z.object({ remark: z.string().max(5) }) }), { remark: 'あいうえおか' });
    expect(message).toBe('備考は5文字以内で入力してください');
  });

  it('メールアドレスの形式を日本語で伝える', async () => {
    const { message } = await messageOf(z.object({ body: z.object({ email: z.string().email() }) }), { email: 'あ' });
    expect(message).toBe('メールアドレスの形式が正しくありません');
  });

  it('スキーマ側で用意した日本語のメッセージはそのまま使う', async () => {
    const schema = z.object({ body: z.object({ password: z.string().min(8, 'パスワードは8文字以上で入力してください') }) });
    const { message } = await messageOf(schema, { password: 'a' });
    expect(message).toBe('パスワードは8文字以上で入力してください');
  });

  it('同じ指摘が重なっても繰り返さない', async () => {
    const schema = z.object({
      body: z.object({ a: z.string().min(1, '入力してください'), b: z.string().min(1, '入力してください') }),
    });
    const { message } = await messageOf(schema, { a: '', b: '' });
    expect(message).toBe('入力してください');
  });

  it('指摘が多いときは先頭だけ見せて件数を添える（一度に全部直させない）', async () => {
    const schema = z.object({
      body: z.object({
        recipient: z.string().min(1),
        phone: z.string().min(1),
        city: z.string().min(1),
        detail: z.string().min(1),
      }),
    });
    const { message } = await messageOf(schema, {});
    expect(message).toBe('お届け先のお名前を入力してください ほか3件をご確認ください');
  });

  it('入力チェックを通る場合はそのまま処理へ進む', async () => {
    const res = await request(appWith(z.object({ body: z.object({ phone: z.string().min(1) }) })))
      .post('/t')
      .send({ phone: '09012345678' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
