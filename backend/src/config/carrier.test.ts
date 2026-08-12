import { describe, it, expect } from 'vitest';
import { CARRIERS, carrierLabel, trackingUrlFor } from './carrier';
// 画面用の対応表。メール(バックエンド)と画面(フロントエンド)で追跡先がずれると、
// 購入者に届く番号とリンクが食い違うため、同じ内容であることをここで確かめる。
import { CARRIERS as FRONT_CARRIERS, trackingUrlFor as frontTrackingUrlFor } from '../../../frontend/assets/js/carrier.js';

describe('配送業者と追跡URL', () => {
  it('追跡番号を差し込んだURLを作る', () => {
    expect(trackingUrlFor('yamato', '1234-5678-9012')).toBe(
      'https://member.kms.kuronekoyamato.co.jp/parcel/detail?pno=1234-5678-9012',
    );
  });

  it('追跡番号はURLとして安全な形にする', () => {
    expect(trackingUrlFor('japanpost', 'a b&c')).toContain('reqCodeNo1=a%20b%26c');
  });

  it('追跡に対応しない発送方法ではURLを作らない', () => {
    expect(trackingUrlFor('other', 'ABC-999')).toBeNull();
  });

  it('追跡番号が無ければURLを作らない', () => {
    expect(trackingUrlFor('yamato', null)).toBeNull();
    expect(trackingUrlFor('yamato', '')).toBeNull();
  });

  it('未知の業者でも例外にせず、空の表示に落とす', () => {
    expect(trackingUrlFor('dhl', '123')).toBeNull();
    expect(carrierLabel('dhl')).toBe('');
    expect(carrierLabel(null)).toBe('');
  });

  it('フロントエンドの対応表と一致している', () => {
    const shape = (list: { key: string; label: string }[]) => list.map((c) => `${c.key}:${c.label}`);
    expect(shape(FRONT_CARRIERS)).toEqual(shape(CARRIERS));
    for (const c of CARRIERS) {
      expect(frontTrackingUrlFor(c.key, 'TEST-1')).toBe(trackingUrlFor(c.key, 'TEST-1'));
    }
  });
});
