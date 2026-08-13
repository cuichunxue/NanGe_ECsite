#!/usr/bin/env bash
#
# Solo Shop のバックアップを戻す
#
#   ./deploy/restore.sh                      # 保存されているバックアップの一覧を表示
#   ./deploy/restore.sh 20260813-033000      # その時点の状態に戻す
#
# 現在のデータベースの中身と商品写真は置き換えられる。取り消せない。
#
# 大事なこと: バックアップは「戻せて初めて」バックアップになる。
# 本番で慌てて初めて試すことにならないよう、一度は練習しておくこと。
# 練習用に、別のデータベースへ戻して確かめることもできる:
#   TARGET_DATABASE_URL="postgresql://...@localhost:5432/soloshop_test" ./deploy/restore.sh 20260813-033000

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/soloshop}"
UPLOAD_DIR="${UPLOAD_DIR:-$APP_DIR/backend/uploads}"
ENV_FILE="${ENV_FILE:-$APP_DIR/backend/.env}"
STAMP="${1:-}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { echo "[エラー] $*" >&2; exit 1; }

# Prismaの接続URLに付く ?schema=public などは pg_restore が解釈できないため取り除く
strip_prisma_params() {
  local url="$1" base="${1%%\?*}" query="" out="" kv
  [[ "$url" == *\?* ]] && query="${url#*\?}"
  local IFS='&'
  for kv in $query; do
    case "${kv%%=*}" in
      sslmode|sslcert|sslkey|sslrootcert|application_name|connect_timeout|options|target_session_attrs)
        out="${out:+$out&}$kv" ;;
    esac
  done
  printf '%s%s' "$base" "${out:+?$out}"
}

if [[ -z "$STAMP" ]]; then
  echo "保存されているバックアップ:"
  find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump' 2>/dev/null | sort -r | while read -r f; do
    s="$(basename "$f" .dump)"; s="${s#db-}"
    printf '  %s  (%s)\n' "$s" "$(du -h "$f" | cut -f1)"
  done
  echo
  echo "戻すには: $0 <日時>"
  exit 0
fi

DB_FILE="$BACKUP_DIR/db-$STAMP.dump"
UPLOADS_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"
[[ -f "$DB_FILE" ]] || die "$DB_FILE が見つかりません。引数なしで実行すると一覧が出ます。"

if [[ -z "${TARGET_DATABASE_URL:-}" ]]; then
  [[ -f "$ENV_FILE" ]] || die "$ENV_FILE が見つかりません。TARGET_DATABASE_URL を環境変数で渡してください。"
  TARGET_DATABASE_URL="$(grep -E '^\s*DATABASE_URL\s*=' "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^[[:space:]]*//' -e 's/^"//' -e "s/^'//" -e 's/"[[:space:]]*$//' -e "s/'[[:space:]]*$//")"
fi
[[ -n "$TARGET_DATABASE_URL" ]] || die "戻す先のデータベースが分かりません。"
PG_URL="$(strip_prisma_params "$TARGET_DATABASE_URL")"

# 接続先を伏せずに見せてから確認する（本番と練習用を取り違えないため）
SAFE_URL="$(echo "$TARGET_DATABASE_URL" | sed -E 's#://([^:]+):[^@]*@#://\1:****@#')"
echo "次の内容で戻します:"
echo "  日時:         $STAMP"
echo "  データベース: $SAFE_URL"
echo "  商品写真:     $UPLOAD_DIR"
echo
echo "現在の中身は置き換えられます。取り消せません。"
if [[ "${ASSUME_YES:-}" != "1" ]]; then
  read -r -p "続けるには「yes」と入力してください: " answer
  [[ "$answer" == "yes" ]] || { echo "中止しました。"; exit 1; }
fi

# --- データベース ---
log "データベースを戻しています…"
# --clean --if-exists: 既存の表を消してから入れ直す。
# --single-transaction: 途中で失敗したら何も変更されずに終わる（中途半端な状態を作らない）。
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction \
  --dbname="$PG_URL" "$DB_FILE" || die "データベースを戻せませんでした。"
log "  完了"

# --- 商品写真 ---
if [[ -f "$UPLOADS_FILE" ]]; then
  log "商品写真を戻しています…"
  # 今あるものは念のため退避してから入れ替える
  if [[ -d "$UPLOAD_DIR" ]]; then
    mv "$UPLOAD_DIR" "$UPLOAD_DIR.before-restore-$(date '+%Y%m%d-%H%M%S')"
  fi
  mkdir -p "$(dirname "$UPLOAD_DIR")"
  tar -xzf "$UPLOADS_FILE" -C "$(dirname "$UPLOAD_DIR")" || die "商品写真を戻せませんでした。"
  log "  完了（$(find "$UPLOAD_DIR" -type f | wc -l) 枚）"
else
  log "この日時の商品写真のバックアップはありません（$UPLOADS_FILE）。"
fi

log "戻し終えました。APIサーバーを再起動してください: sudo systemctl restart soloshop-api"
