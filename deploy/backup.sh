#!/usr/bin/env bash
#
# Solo Shop のバックアップ
#
# 失うと取り返しがつかないのは次の2つ。両方を1回でまとめて保存する。
#   1. データベース … 注文・会員・商品。消えると売上の記録ごと無くなる
#   2. backend/uploads/ … 商品写真。撮り直しがきかない
#
# 使い方:
#   ./deploy/backup.sh                      # 既定の場所(/var/backups/soloshop)へ保存
#   BACKUP_DIR=/mnt/usb ./deploy/backup.sh  # 保存先を変える
#   KEEP_DAYS=30 ./deploy/backup.sh         # 保存期間を変える（既定14日）
#
# 毎日自動で実行するには deploy/soloshop-backup.timer を使う。
#
# 重要: 保存先はこのサーバーの外にも置くこと。同じディスクに置いたバックアップは、
# ディスクが壊れたときに一緒に失われる。

set -euo pipefail

# --- 設定 ---
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/soloshop}"
KEEP_DAYS="${KEEP_DAYS:-14}"
UPLOAD_DIR="${UPLOAD_DIR:-$APP_DIR/backend/uploads}"
ENV_FILE="${ENV_FILE:-$APP_DIR/backend/.env}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { echo "[エラー] $*" >&2; exit 1; }

# Prismaの接続URLには ?schema=public のようなPrisma独自の指定が付く。
# pg_dump / pg_restore はこれを解釈できずに止まってしまうため、取り除く。
# PostgreSQL本体が理解する指定（SSL関連など）はそのまま残す。
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

# --- 接続先をbackend/.envから読み取る ---
# バックアップ先だけ別に管理すると、片方を直し忘れて別のDBを保存してしまう。
if [[ -z "${DATABASE_URL:-}" ]]; then
  [[ -f "$ENV_FILE" ]] || die "$ENV_FILE が見つかりません。DATABASE_URL を環境変数で渡してください。"
  DATABASE_URL="$(grep -E '^\s*DATABASE_URL\s*=' "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^[[:space:]]*//' -e 's/^"//' -e "s/^'//" -e 's/"[[:space:]]*$//' -e "s/'[[:space:]]*$//")"
fi
[[ -n "$DATABASE_URL" ]] || die "DATABASE_URL を取得できませんでした。"
PG_URL="$(strip_prisma_params "$DATABASE_URL")"

command -v pg_dump >/dev/null || die "pg_dump が見つかりません（postgresql-client を入れてください）。"

STAMP="$(date '+%Y%m%d-%H%M%S')"
mkdir -p "$BACKUP_DIR"

DB_FILE="$BACKUP_DIR/db-$STAMP.dump"
UPLOADS_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"

# --- データベース ---
log "データベースを保存しています…"
# -Fc: 圧縮された形式。pg_restore で一部のテーブルだけ戻すこともできる
pg_dump --format=custom --no-owner --no-privileges --file="$DB_FILE" "$PG_URL" \
  || die "データベースの保存に失敗しました。"

# 中身を読めるか確かめる。書き出せても壊れていては意味がない。
pg_restore --list "$DB_FILE" >/dev/null || die "保存したファイルを読み取れません: $DB_FILE"
log "  $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"

# --- 商品写真 ---
if [[ -d "$UPLOAD_DIR" ]]; then
  log "商品写真を保存しています…"
  tar -czf "$UPLOADS_FILE" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")" \
    || die "商品写真の保存に失敗しました。"
  tar -tzf "$UPLOADS_FILE" >/dev/null || die "保存したファイルを読み取れません: $UPLOADS_FILE"
  log "  $UPLOADS_FILE ($(du -h "$UPLOADS_FILE" | cut -f1), $(tar -tzf "$UPLOADS_FILE" | grep -cv '/$') 枚)"
else
  log "商品写真の保存先が見つかりません（$UPLOAD_DIR）。まだ1枚もアップロードしていない場合は正常です。"
fi

# --- 古いものを消す ---
# 消す前に、残る組が1つ以上あることを確かめる。
# 何かの理由で今日の保存が失敗していた場合に、古いものまで消してしまわないため。
REMAINING="$(find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump' -mtime -"$KEEP_DAYS" | wc -l)"
if (( REMAINING > 0 )); then
  DELETED="$(find "$BACKUP_DIR" -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -print -delete | wc -l)"
  (( DELETED > 0 )) && log "$KEEP_DAYS 日より古いバックアップを $DELETED 件削除しました。"
fi

log "完了しました。保存先: $BACKUP_DIR"
log "戻し方: ./deploy/restore.sh $STAMP"
