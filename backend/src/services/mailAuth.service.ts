/**
 * 送信ドメイン認証（SPF / DKIM / DMARC）の設定を確認する。
 *
 * 個人店では「注文確認メールが購入者の迷惑メールに入って気づかれない」ことが
 * そのまま売上と信用の損失になる。設定できているかはDNSを引けば分かるが、
 * レコードを読み解くのは専門的なので、判定と直し方をここにまとめる。
 *
 * DNS参照は引数で受け取り、判定処理そのものはテストできるようにしてある。
 */

export type CheckLevel = 'ok' | 'warn' | 'error';

export interface CheckResult {
  /** 何を確認したか */
  name: string;
  level: CheckLevel;
  message: string;
  /** 直し方。level が ok 以外のときに出す */
  hint?: string;
}

export type ResolveTxt = (hostname: string) => Promise<string[][]>;

/** 無料メールのドメイン。ここから送るとDMARCの整合が取れず、届かない相手が出る */
const FREE_WEBMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.co.jp',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'outlook.jp',
  'hotmail.com',
  'hotmail.co.jp',
  'live.jp',
  'icloud.com',
  'me.com',
  'aol.com',
  'docomo.ne.jp',
  'ezweb.ne.jp',
  'au.com',
  'softbank.ne.jp',
  'i.softbank.jp',
  'ymobile.ne.jp',
  'nifty.com',
  'excite.co.jp',
]);

/** DNSのTXTは255文字ごとに分割されて返るため、連結して1つの文字列に戻す */
export function joinTxt(records: string[][]): string[] {
  return records.map((chunks) => chunks.join(''));
}

/** `Solo Shop <shop@example.com>` のような表記からドメインだけを取り出す */
export function extractDomain(mailFrom: string): string | null {
  const address = mailFrom.includes('<') ? (mailFrom.match(/<([^>]+)>/)?.[1] ?? '') : mailFrom;
  const at = address.trim().lastIndexOf('@');
  if (at < 1 || at === address.trim().length - 1) return null;
  return address.trim().slice(at + 1).toLowerCase();
}

export function isFreeWebmailDomain(domain: string): boolean {
  return FREE_WEBMAIL_DOMAINS.has(domain.toLowerCase());
}

export function checkFromDomain(mailFrom: string): CheckResult {
  const name = '差出人アドレス (MAIL_FROM)';
  const domain = extractDomain(mailFrom);
  if (!domain) {
    return {
      name,
      level: 'error',
      message: `メールアドレスとして読み取れません: ${mailFrom || '(未設定)'}`,
      hint: 'MAIL_FROM="Solo Shop <shop@example.com>" の形式で設定してください。',
    };
  }
  if (isFreeWebmailDomain(domain)) {
    return {
      name,
      level: 'error',
      message: `${domain} は無料メールのドメインです`,
      hint:
        'GmailやYahoo!メールのアドレスを差出人にすると、そのドメインのDMARC設定に違反するため、' +
        '受信側で拒否・迷惑メール扱いになります。お店のドメイン（例: shop@あなたのドメイン）を差出人にしてください。',
    };
  }
  return { name, level: 'ok', message: `${domain}（自分のドメイン）` };
}

// --- SPF ---

/** SPFで1回のDNS参照を消費する仕組み。合計10回を超えると認証が失敗する */
const SPF_LOOKUP_MECHANISMS = /^(include:|a$|a:|a\/|mx$|mx:|mx\/|ptr$|ptr:|exists:|redirect=)/i;

export function findSpfRecords(txt: string[][]): string[] {
  return joinTxt(txt).filter((r) => r.trim().toLowerCase().startsWith('v=spf1'));
}

export function analyzeSpfRecord(record: string): CheckResult {
  const name = 'SPF';
  const terms = record.trim().split(/\s+/).slice(1);
  const all = terms.find((t) => /^[-~?+]?all$/i.test(t));
  if (!all) {
    return {
      name,
      level: 'warn',
      message: `all の指定がありません: ${record}`,
      hint: '末尾に ~all（推奨）または -all を付けて、指定外のサーバーからの送信を拒む設定にしてください。',
    };
  }
  if (all.startsWith('+') || all === 'all') {
    return {
      name,
      level: 'error',
      message: `+all はどのサーバーからの送信も許可してしまいます: ${record}`,
      hint: '+all を ~all または -all に変更してください。',
    };
  }
  if (all.startsWith('?')) {
    return {
      name,
      level: 'warn',
      message: `?all は判定を保留するため、なりすまし対策になりません: ${record}`,
      hint: '?all を ~all または -all に変更してください。',
    };
  }
  return { name, level: 'ok', message: record };
}

/**
 * SPFのDNS参照回数を数える（上限10回）。
 * 送信サービスを増やしていくと静かに超過し、ある日突然SPFが通らなくなる。
 */
export async function countSpfLookups(
  record: string,
  resolveTxt: ResolveTxt,
  seen = new Set<string>(),
  depth = 0,
): Promise<number> {
  if (depth > 10) return 0;
  let count = 0;
  for (const term of record.trim().split(/\s+/).slice(1)) {
    const bare = term.replace(/^[-~?+]/, '');
    if (!SPF_LOOKUP_MECHANISMS.test(bare)) continue;
    count += 1;

    const nested = bare.match(/^(?:include:|redirect=)(.+)$/i)?.[1]?.toLowerCase();
    if (!nested || seen.has(nested)) continue;
    seen.add(nested);
    try {
      const child = findSpfRecords(await resolveTxt(nested))[0];
      if (child) count += await countSpfLookups(child, resolveTxt, seen, depth + 1);
    } catch {
      // 引けないドメインは、その1回分だけ数えて先へ進む
    }
    if (count > 10) return count; // 超過が分かった時点で打ち切る
  }
  return count;
}

export async function checkSpf(domain: string, resolveTxt: ResolveTxt): Promise<CheckResult[]> {
  const name = 'SPF';
  let records: string[];
  try {
    records = findSpfRecords(await resolveTxt(domain));
  } catch (err) {
    // TXTが1件も無いドメインはエラーとして返ってくる。利用者にとっては
    // 「引けなかった」ではなく「SPFが無い」状態なので、下の案内に合流させる。
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOTFOUND' && code !== 'ENODATA') {
      return [
        {
          name,
          level: 'error',
          message: `${domain} のTXTレコードを取得できません（${(err as Error).message}）`,
          hint: 'ドメイン名の綴りと、DNSが正しく応答しているかを確認してください。',
        },
      ];
    }
    records = [];
  }

  if (records.length === 0) {
    return [
      {
        name,
        level: 'error',
        message: `${domain} にSPFレコードがありません`,
        hint: '利用中の送信サービスが指定する include を使い、TXTレコードを1件追加してください（例: "v=spf1 include:_spf.example.net ~all"）。',
      },
    ];
  }
  if (records.length > 1) {
    return [
      {
        name,
        level: 'error',
        message: `SPFレコードが${records.length}件あります（複数あると認証が失敗します）`,
        hint: `1件にまとめてください: ${records.join(' / ')}`,
      },
    ];
  }

  const results = [analyzeSpfRecord(records[0])];
  const lookups = await countSpfLookups(records[0], resolveTxt);
  if (lookups > 10) {
    results.push({
      name: 'SPFのDNS参照回数',
      level: 'error',
      message: `${lookups}回で上限の10回を超えています`,
      hint: '使っていない include を削除してください。上限を超えるとSPFは無条件で失敗します。',
    });
  } else {
    results.push({ name: 'SPFのDNS参照回数', level: 'ok', message: `${lookups}/10回` });
  }
  return results;
}

// --- DKIM ---

export async function checkDkim(domain: string, selector: string, resolveTxt: ResolveTxt): Promise<CheckResult> {
  const name = 'DKIM';
  if (!selector) {
    return {
      name,
      level: 'warn',
      message: 'セレクタが分からないため確認できません',
      hint:
        '送信サービスの管理画面でDKIMを有効にし、案内されたセレクタを MAIL_DKIM_SELECTOR に設定すると、ここで確認できるようになります。',
    };
  }
  const host = `${selector}._domainkey.${domain}`;
  let values: string[];
  try {
    values = joinTxt(await resolveTxt(host));
  } catch {
    return {
      name,
      level: 'error',
      message: `${host} にDKIMの公開鍵がありません`,
      hint: '送信サービスの管理画面で案内されるDKIM用のレコード（TXTまたはCNAME）をDNSに追加してください。',
    };
  }
  const record = values.find((v) => v.toLowerCase().includes('v=dkim1') || v.includes('p='));
  if (!record) {
    return { name, level: 'error', message: `${host} にDKIMの公開鍵がありません`, hint: 'DKIM用のレコードを追加してください。' };
  }
  const publicKey = record.match(/(?:^|;)\s*p\s*=\s*([^;]*)/)?.[1]?.trim();
  if (!publicKey) {
    return {
      name,
      level: 'error',
      message: `${host} の公開鍵が空です（失効した鍵）`,
      hint: '送信サービスでDKIMの鍵を作り直し、新しいレコードに差し替えてください。',
    };
  }
  return { name, level: 'ok', message: `${host} に公開鍵があります` };
}

// --- DMARC ---

export function parseDmarcTags(record: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of record.split(';')) {
    const [k, ...rest] = part.split('=');
    if (!k || rest.length === 0) continue;
    tags[k.trim().toLowerCase()] = rest.join('=').trim();
  }
  return tags;
}

export function analyzeDmarcRecord(record: string): CheckResult[] {
  const tags = parseDmarcTags(record);
  const policy = (tags.p ?? '').toLowerCase();
  const results: CheckResult[] = [];

  if (!policy) {
    results.push({
      name: 'DMARC',
      level: 'error',
      message: `p（ポリシー）の指定がありません: ${record}`,
      hint: '"v=DMARC1; p=none; rua=mailto:あなたのアドレス" の形にしてください。',
    });
  } else if (policy === 'none') {
    results.push({
      name: 'DMARC',
      level: 'warn',
      message: `p=none（監視のみ。なりすましは拒否されません）`,
      hint:
        'まずはこの状態でレポートを1〜2週間確認し、自分の送信がすべて認証を通っていることを確かめてから、' +
        'p=quarantine → p=reject と段階的に強めてください。',
    });
  } else {
    results.push({ name: 'DMARC', level: 'ok', message: `p=${policy}` });
  }

  if (!tags.rua) {
    results.push({
      name: 'DMARCレポート送付先',
      level: 'warn',
      message: 'rua の指定がありません',
      hint: 'rua=mailto:あなたのアドレス を追加すると、認証の成否が日次で届き、届かない原因に気づけます。',
    });
  } else {
    results.push({ name: 'DMARCレポート送付先', level: 'ok', message: tags.rua });
  }

  const pct = Number(tags.pct ?? '100');
  if (Number.isFinite(pct) && pct < 100) {
    results.push({
      name: 'DMARC適用率',
      level: 'warn',
      message: `pct=${pct}（ポリシーが一部のメールにしか適用されていません）`,
      hint: '段階移行が終わったら pct を外して100%にしてください。',
    });
  }
  return results;
}

export async function checkDmarc(domain: string, resolveTxt: ResolveTxt): Promise<CheckResult[]> {
  const name = 'DMARC';
  const host = `_dmarc.${domain}`;
  let records: string[];
  try {
    records = joinTxt(await resolveTxt(host)).filter((r) => r.trim().toLowerCase().startsWith('v=dmarc1'));
  } catch {
    records = [];
  }
  if (records.length === 0) {
    return [
      {
        name,
        level: 'error',
        message: `${host} にDMARCレコードがありません`,
        hint:
          'TXTレコードを1件追加してください: "v=DMARC1; p=none; rua=mailto:あなたのアドレス"。' +
          'GmailやYahoo!メールは、DMARC未設定のドメインからのメールを受け取らないことがあります。',
      },
    ];
  }
  if (records.length > 1) {
    return [{ name, level: 'error', message: `${host} にDMARCレコードが${records.length}件あります`, hint: '1件にまとめてください。' }];
  }
  return analyzeDmarcRecord(records[0]);
}

/** 差出人ドメインの認証設定をまとめて確認する */
export async function checkMailAuth(
  mailFrom: string,
  dkimSelector: string,
  resolveTxt: ResolveTxt,
): Promise<CheckResult[]> {
  const fromCheck = checkFromDomain(mailFrom);
  const domain = extractDomain(mailFrom);
  if (!domain || fromCheck.level === 'error') return [fromCheck];

  const [spf, dkim, dmarc] = await Promise.all([
    checkSpf(domain, resolveTxt),
    checkDkim(domain, dkimSelector, resolveTxt),
    checkDmarc(domain, resolveTxt),
  ]);
  return [fromCheck, ...spf, dkim, ...dmarc];
}
