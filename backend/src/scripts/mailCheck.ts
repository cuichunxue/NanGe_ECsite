/**
 * メールが届く状態になっているかを確認する。
 *
 *   npm run mail:check                    設定とDNS(SPF/DKIM/DMARC)を確認する
 *   npm run mail:check -- you@example.com そのアドレスへテストメールを送る
 *
 * 迷惑メール扱いは「送ったつもりで届いていない」ため気づきにくい。
 * 公開前と、送信サービスやドメインを変えたときに実行する。
 */
import 'dotenv/config';
import { promises as dns } from 'dns';
import { env } from '../config/env';
import { checkMailAuth, type CheckResult } from '../services/mailAuth.service';
import { isMailConfigured, verifyMailTransport, sendMailOrThrow } from '../services/mail.service';

const MARK: Record<CheckResult['level'], string> = { ok: '  OK  ', warn: ' 注意 ', error: '要対応' };

function print(result: CheckResult): void {
  console.log(`${MARK[result.level]} ${result.name}: ${result.message}`);
  if (result.hint && result.level !== 'ok') console.log(`         → ${result.hint}`);
}

async function main(): Promise<void> {
  const testRecipient = process.argv[2];
  const results: CheckResult[] = [];

  console.log('■ 送信設定');
  if (!isMailConfigured()) {
    print({
      name: 'SMTP',
      level: 'error',
      message: '未設定のため、メールは送信されずログに出力されます',
      hint: 'backend/.env に SMTP_HOST と MAIL_FROM を設定してください。',
    });
    console.log('\n設定が済んでから、もう一度実行してください。');
    process.exit(1);
  }
  console.log(`  OK   差出人: ${env.mailFrom}`);
  console.log(`  OK   送信サーバー: ${env.smtp.host}:${env.smtp.port}${env.smtp.secure ? '（SSL）' : ''}`);
  console.log(`  OK   返信先: ${env.mailReplyTo || env.ownerEmail || '(未設定。MAIL_REPLY_TO の設定をおすすめします)'}`);

  try {
    await verifyMailTransport();
    console.log('  OK   送信サーバーに接続できました');
  } catch (err) {
    results.push({
      name: 'SMTP接続',
      level: 'error',
      message: (err as Error).message,
      hint: 'ホスト名・ポート・ユーザー名・パスワードを確認してください。ポート465を使う場合は SMTP_SECURE=true が必要です。',
    });
  }

  console.log('\n■ 送信ドメイン認証（DNS）');
  const authResults = await checkMailAuth(env.mailFrom, env.mailDkim.selector, (host) => dns.resolveTxt(host));
  authResults.forEach(print);
  results.push(...authResults);

  if (testRecipient) {
    console.log('\n■ テスト送信');
    // 本番と同じ経路で送りつつ、ここでは成否を知りたいので失敗を握りつぶさない版を使う
    try {
      await sendMailOrThrow({
        to: testRecipient,
        subject: '【Solo Shop】メール設定の確認',
        text: [
          'このメールは、お店からのお知らせが正しく届くかを確認するためのテストです。',
          '',
          '受け取ったら、次の点を確認してください。',
          '・迷惑メールフォルダではなく受信トレイに入っているか',
          '・差出人がお店の名前で表示されているか',
          '・「送信元を確認できません」といった警告が出ていないか',
          '',
          `差出人: ${env.mailFrom}`,
          `送信日時: ${new Date().toLocaleString('ja-JP')}`,
        ].join('\n'),
      });
      console.log(`  OK   ${testRecipient} 宛に送信しました`);
      console.log('       受信トレイと迷惑メールフォルダの両方を確認してください。迷惑メールに入るようなら、上の項目を見直してください。');
    } catch (err) {
      results.push({ name: 'テスト送信', level: 'error', message: (err as Error).message });
      console.log(`要対応 テスト送信に失敗しました: ${(err as Error).message}`);
    }
  } else {
    console.log('\n（アドレスを指定すると、テストメールも送れます: npm run mail:check -- you@example.com）');
  }

  const errors = results.filter((r) => r.level === 'error').length;
  const warns = results.filter((r) => r.level === 'warn').length;
  console.log(`\n結果: 要対応 ${errors} 件 / 注意 ${warns} 件`);
  if (errors > 0) console.log('要対応の項目があるうちは、購入者に届かない可能性があります。');
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
