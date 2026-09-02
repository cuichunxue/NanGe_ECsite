import { describe, it, expect } from 'vitest';
import {
  extractDomain,
  checkFromDomain,
  checkSpf,
  checkDkim,
  checkDmarc,
  checkMailAuth,
  countSpfLookups,
  analyzeDmarcRecord,
  type ResolveTxt,
} from './mailAuth.service';

/** DNSの代わりに、与えた表から引くだけの関数を渡す */
function fakeDns(zone: Record<string, string[]>): ResolveTxt {
  return async (host) => {
    const records = zone[host];
    if (!records) {
      const err = new Error('queryTxt ENOTFOUND') as NodeJS.ErrnoException;
      err.code = 'ENOTFOUND';
      throw err;
    }
    return records.map((r) => [r]);
  };
}

describe('差出人アドレス', () => {
  it('表示名つきの書き方からドメインを取り出す', () => {
    expect(extractDomain('Solo Shop <shop@example.com>')).toBe('example.com');
    expect(extractDomain('shop@Example.COM')).toBe('example.com');
  });

  it('アドレスとして読めない場合はnull', () => {
    expect(extractDomain('')).toBeNull();
    expect(extractDomain('shop')).toBeNull();
    expect(extractDomain('@example.com')).toBeNull();
  });

  it('無料メールのアドレスを差出人にしていたら要対応にする', () => {
    const result = checkFromDomain('Solo Shop <myshop@gmail.com>');
    expect(result.level).toBe('error');
    expect(result.hint).toContain('お店のドメイン');
  });

  it('自分のドメインなら問題なし', () => {
    expect(checkFromDomain('Solo Shop <shop@example.com>').level).toBe('ok');
  });
});

describe('SPF', () => {
  const spfOnly = (record: string) => fakeDns({ 'example.com': [record] });

  it('レコードが無ければ要対応', async () => {
    const [result] = await checkSpf('example.com', fakeDns({}));
    expect(result.level).toBe('error');
    expect(result.message).toContain('SPFレコードがありません');
  });

  it('複数あると認証が失敗するため要対応', async () => {
    const dns = fakeDns({ 'example.com': ['v=spf1 include:a.example ~all', 'v=spf1 include:b.example ~all'] });
    const [result] = await checkSpf('example.com', dns);
    expect(result.level).toBe('error');
    expect(result.message).toContain('2件');
  });

  it('~all なら問題なし', async () => {
    const results = await checkSpf('example.com', spfOnly('v=spf1 include:_spf.example.net ~all'));
    expect(results.every((r) => r.level === 'ok')).toBe(true);
  });

  it('+all は要対応', async () => {
    const [result] = await checkSpf('example.com', spfOnly('v=spf1 +all'));
    expect(result.level).toBe('error');
  });

  it('?all と all無しは注意', async () => {
    expect((await checkSpf('example.com', spfOnly('v=spf1 include:x.example ?all')))[0].level).toBe('warn');
    expect((await checkSpf('example.com', spfOnly('v=spf1 include:x.example')))[0].level).toBe('warn');
  });

  it('入れ子のincludeも数えて、10回を超えたら要対応にする', async () => {
    const dns = fakeDns({
      'example.com': ['v=spf1 include:a.example include:b.example ~all'],
      // a が5回、b が5回で、親の2回と合わせて12回になる
      'a.example': ['v=spf1 a mx include:a1.example include:a2.example include:a3.example ~all'],
      'b.example': ['v=spf1 a mx include:b1.example include:b2.example include:b3.example ~all'],
    });
    const count = await countSpfLookups('v=spf1 include:a.example include:b.example ~all', dns);
    expect(count).toBeGreaterThan(10);

    const results = await checkSpf('example.com', dns);
    expect(results.find((r) => r.name === 'SPFのDNS参照回数')?.level).toBe('error');
  });

  it('include が循環していても止まる', async () => {
    const dns = fakeDns({
      'a.example': ['v=spf1 include:b.example ~all'],
      'b.example': ['v=spf1 include:a.example ~all'],
    });
    await expect(countSpfLookups('v=spf1 include:a.example ~all', dns)).resolves.toBeLessThan(10);
  });

  it('DNS参照を伴わない指定は数えない', async () => {
    const count = await countSpfLookups('v=spf1 ip4:203.0.113.0/24 ip6:2001:db8::/32 -all', fakeDns({}));
    expect(count).toBe(0);
  });
});

describe('DKIM', () => {
  it('セレクタが未設定なら確認できない旨を注意として出す', async () => {
    const result = await checkDkim('example.com', '', fakeDns({}));
    expect(result.level).toBe('warn');
  });

  it('公開鍵が無ければ要対応', async () => {
    const result = await checkDkim('example.com', 'default', fakeDns({}));
    expect(result.level).toBe('error');
    expect(result.message).toContain('default._domainkey.example.com');
  });

  it('失効した鍵（p=が空）は要対応', async () => {
    const dns = fakeDns({ 'default._domainkey.example.com': ['v=DKIM1; k=rsa; p='] });
    const result = await checkDkim('example.com', 'default', dns);
    expect(result.level).toBe('error');
    expect(result.message).toContain('失効');
  });

  it('公開鍵があれば問題なし', async () => {
    const dns = fakeDns({ 'default._domainkey.example.com': ['v=DKIM1; k=rsa; p=MIGfMA0GCSq'] });
    expect((await checkDkim('example.com', 'default', dns)).level).toBe('ok');
  });

  it('255文字で分割されたTXTを連結して読む', async () => {
    const long = 'A'.repeat(300);
    const resolve: ResolveTxt = async () => [['v=DKIM1; k=rsa; p=' + long.slice(0, 255), long.slice(255)]];
    expect((await checkDkim('example.com', 's1', resolve)).level).toBe('ok');
  });
});

describe('DMARC', () => {
  it('レコードが無ければ要対応', async () => {
    const [result] = await checkDmarc('example.com', fakeDns({}));
    expect(result.level).toBe('error');
    expect(result.hint).toContain('v=DMARC1');
  });

  it('p=none は監視のみなので注意', () => {
    const results = analyzeDmarcRecord('v=DMARC1; p=none; rua=mailto:owner@example.com');
    expect(results[0].level).toBe('warn');
    expect(results[1].level).toBe('ok');
  });

  it('p=reject なら問題なし', () => {
    expect(analyzeDmarcRecord('v=DMARC1; p=reject; rua=mailto:owner@example.com')[0].level).toBe('ok');
  });

  it('レポート送付先が無ければ注意', () => {
    const results = analyzeDmarcRecord('v=DMARC1; p=quarantine');
    expect(results.find((r) => r.name === 'DMARCレポート送付先')?.level).toBe('warn');
  });

  it('pctが100未満なら適用漏れとして注意', () => {
    const results = analyzeDmarcRecord('v=DMARC1; p=reject; rua=mailto:o@example.com; pct=20');
    expect(results.find((r) => r.name === 'DMARC適用率')?.level).toBe('warn');
  });
});

describe('まとめて確認', () => {
  it('すべて整っていれば要対応が出ない', async () => {
    const dns = fakeDns({
      'example.com': ['v=spf1 include:_spf.example.net -all'],
      '_spf.example.net': ['v=spf1 ip4:203.0.113.0/24 -all'],
      's1._domainkey.example.com': ['v=DKIM1; k=rsa; p=MIGfMA0GCSq'],
      '_dmarc.example.com': ['v=DMARC1; p=reject; rua=mailto:owner@example.com'],
    });
    const results = await checkMailAuth('Solo Shop <shop@example.com>', 's1', dns);
    expect(results.filter((r) => r.level !== 'ok')).toEqual([]);
  });

  it('差出人が無料メールなら、DNSを引かずにそこだけを指摘する', async () => {
    const results = await checkMailAuth('myshop@gmail.com', 's1', fakeDns({}));
    expect(results).toHaveLength(1);
    expect(results[0].level).toBe('error');
  });
});
