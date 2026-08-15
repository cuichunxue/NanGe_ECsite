#!/usr/bin/env bash
#
# Codespaces / Dev Container を作った直後に一度だけ走る準備処理。
# ここで「起動できる状態」まで持っていくことで、利用者が手作業で
# PostgreSQLを入れたり sudo と格闘したりせずに済むようにする。

set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶ backend/.env を用意します"
if [[ -f backend/.env ]]; then
  echo "  既にあるため、そのまま使います（上書きしません）"
else
  cp backend/.env.example backend/.env
  echo "  backend/.env.example から作成しました"
fi

echo "▶ 依存パッケージをインストールします（backend / frontend）"
npm install

# バックアップ手順(deploy/backup.sh)の確認に pg_dump / psql を使うため入れておく。
# 入らなくても開発自体は続けられるので、失敗しても止めない。
if ! command -v psql >/dev/null 2>&1; then
  echo "▶ PostgreSQLクライアントを入れます（バックアップ手順の確認用）"
  sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client || \
    echo "  入れられませんでした。開発には支障ありません。"
fi

echo "▶ データベースの起動を待ちます"
# pg_isready が無い環境でも動くよう、Node標準機能だけで待つ
node -e '
const net = require("net");
const deadline = Date.now() + 60000;
(function tryConnect() {
  const s = net.connect(5432, "localhost");
  s.on("connect", () => { s.end(); console.log("  接続できました"); process.exit(0); });
  s.on("error", () => {
    s.destroy();
    if (Date.now() > deadline) {
      console.error("  60秒待っても接続できませんでした");
      process.exit(1);
    }
    setTimeout(tryConnect, 1000);
  });
})();
'

echo "▶ データベースの構造を作ります"
npm run prisma:migrate

echo "▶ サンプルデータを入れます（店主アカウント・デモ会員・商品）"
npm run seed

cat <<'EOF'

────────────────────────────────────────────
 準備が終わりました。次のコマンドで起動します。

   npm run dev

 起動後、5173番ポートの転送URLをブラウザで開いてください。
 「ポート」パネルで 4000番も 5173番と同じ可視性(Public)に
 なっていることを確認してください。片方だけ非公開だと
 ログインできません。

 ログイン用アカウント:
   店主   owner@soloshop.example.com / Owner@12345
   会員   demo@soloshop.example.com  / Demo@12345
────────────────────────────────────────────
EOF
