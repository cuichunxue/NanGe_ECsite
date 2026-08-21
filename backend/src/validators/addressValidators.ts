import { z } from 'zod';
import { PREFECTURES } from '../config/shipping';

/**
 * 届け先の検証。
 *
 * 都道府県は「表示のための文字列」ではなく、送料の地域区分を決める値なので、
 * 一覧に無い表記を受け付けてはならない。実際に試したところ「おきなわ」と
 * 入力された注文は本州扱いになり、送料1,200円のところ500円しか頂けなかった
 * （1件あたり700円の持ち出し）。「ニューヨーク州」のような値も通ってしまい、
 * そもそも発送できない住所が登録できていた。
 *
 * 郵便番号と電話番号も、形になっていない値のまま注文が通ると、荷物が出せない・
 * 連絡がつかないという形で店主が困ることになるため、ここで止める。
 */
const addressBody = z.object({
  recipient: z.string().trim().min(1, 'お名前を入力してください').max(50, 'お名前は50文字以内で入力してください'),
  phone: z
    .string()
    .trim()
    .min(1, '電話番号を入力してください')
    .max(20, '電話番号は20文字以内で入力してください')
    // 数字・ハイフン・丸括弧・空白・国番号の + のみ。数字は10桁以上（固定電話・携帯の下限）
    .regex(/^[0-9+()\-\s]+$/, '電話番号は数字とハイフンで入力してください')
    .refine((v) => (v.match(/[0-9]/g) ?? []).length >= 10, '電話番号の桁数が足りません'),
  province: z.enum(PREFECTURES as unknown as [string, ...string[]], {
    errorMap: () => ({ message: '都道府県は一覧から選んでください' }),
  }),
  city: z.string().trim().min(1, '市区町村を入力してください').max(50, '市区町村は50文字以内で入力してください'),
  district: z.string().trim().min(1, '町名・番地を入力してください').max(50, '町名・番地は50文字以内で入力してください'),
  detail: z.string().trim().min(1, '建物名・部屋番号を入力してください').max(200, '建物名・部屋番号は200文字以内で入力してください'),
  postalCode: z
    .string()
    .trim()
    .regex(/^[0-9]{3}-?[0-9]{4}$/, '郵便番号は7桁の数字で入力してください（例: 1500043）')
    .optional(),
  isDefault: z.boolean().optional(),
});

export const createAddressSchema = z.object({ body: addressBody });
export const updateAddressSchema = z.object({
  body: addressBody.partial(),
  params: z.object({ id: z.string().uuid() }),
});
