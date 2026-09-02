#!/usr/bin/env node
// 公開前の確認。書き換えずに公開すると法令や信用に関わる箇所が残っていないかを調べる。
//
// バックエンドの設定(.env)は起動時に startupCheck が確認するが、購入者向けサイトは
// 静的なHTMLをそのまま配るため、確認する仕組みが無かった。特定商取引法に基づく表示に
// 「【氏名を入力してください】」が残ったまま公開する、という事故をここで止める。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const FRONTEND = join(ROOT, 'frontend');

const CHECKS = [
  {
    pattern: /【[^】]*】/g,
    why: '運営者が書き換える前提の穴埋め（【 】）が残っています。特定商取引法に基づく表示・利用規約・プライバシーポリシーは、実際の情報に置き換えてから公開してください。',
  },
  {
    pattern: /shop\.example\.com/g,
    why: 'SNSのカード表示(OGP)用の仮ドメインが残っています。README「公開前に書き換えるページ」の手順で実際のドメインに置き換えてください。',
  },
];

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'assets') continue;
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith('.html')) yield p;
  }
}

const findings = [];
for (const file of htmlFiles(FRONTEND)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const check of CHECKS) {
    lines.forEach((line, i) => {
      const m = line.match(check.pattern);
      if (m) findings.push({ file: relative(ROOT, file), line: i + 1, text: m[0].slice(0, 60), why: check.why });
    });
  }
}

if (findings.length === 0) {
  console.log('公開前の確認: 問題は見つかりませんでした。');
  process.exit(0);
}

const byWhy = new Map();
for (const f of findings) {
  if (!byWhy.has(f.why)) byWhy.set(f.why, []);
  byWhy.get(f.why).push(f);
}
console.error(`公開前の確認: 直す必要がある箇所が ${findings.length} 件あります。\n`);
for (const [why, items] of byWhy) {
  console.error(`■ ${why}`);
  // 同じ文言が全ページに入っているもの（OGPの仮ドメインなど）は、ファイルごとにまとめて出す
  const distinctTexts = new Set(items.map((f) => f.text));
  if (distinctTexts.size === 1 && items.length > 3) {
    const perFile = new Map();
    for (const f of items) perFile.set(f.file, (perFile.get(f.file) ?? 0) + 1);
    for (const [file, n] of perFile) console.error(`  ${file}（${n}箇所）`);
  } else {
    for (const f of items) console.error(`  ${f.file}:${f.line}  ${f.text}`);
  }
  console.error('');
}
process.exit(1);
