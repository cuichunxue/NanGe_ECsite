# Solo Shop — 個人向けオリジナルECサイト

個人が一人で運営する小さなお店（ハンドメイド作家、個人事業主など）が、自分自身で安心・簡単に運用できる規模で実装したフルスタックECプラットフォームです。クーポン・複数管理者・多段階カテゴリといった大規模事業者向けの機能は思い切って省き、商品出品・注文管理・在庫管理といったコア機能に絞っています。

- 要件定義書: [`docs/requirements.md`](docs/requirements.md)
- バックエンド: Node.js / Express / TypeScript / Prisma / PostgreSQL
- フロントエンド: 素のHTML / CSS / JavaScript（ビルド不要、ES Modules。Tailwind CSSはCDN経由で利用）
- 認証: JWT（アクセストークン + リフレッシュトークン）

## 主な機能

- 会員登録・ログイン・プロフィール・複数配送先住所管理・パスワード再設定
- 商品検索・絞り込み・並び替え・カテゴリ（1階層のフラット構造）・在庫僅少バッジ
- カート・チェックアウト・モック決済
- 注文管理（支払い待ち→支払済み→発送済み→受取完了[購入者自身で確認可能]→レビュー投稿、キャンセル/返金）
- レビュー・評価、お気に入り
- 管理画面（店主本人のみアクセス可能。ダッシュボード、商品/カテゴリ/注文/会員/レビュー管理）
- 特定商取引法に基づく表示ページ（個人事業主向けの記載例つき。フッターから常時アクセス可）

詳細は要件定義書を参照してください。

## ディレクトリ構成

```
NanGe_ECsite/
├── docs/requirements.md   # 要件定義書
├── backend/                # Express API サーバー
│   ├── prisma/schema.prisma
│   ├── prisma/seed.ts
│   └── src/
└── frontend/                # 素のHTML/CSS/JavaScriptによるマルチページサイト
    ├── *.html               # 購入者向け画面（トップ、商品一覧/詳細、カート、注文 等）
    ├── admin/*.html         # 管理画面（店主専用）
    ├── assets/js/           # ESモジュール（API通信・共通レイアウト・各画面ロジック）
    ├── assets/css/          # 共通スタイル
    └── server.js            # 依存パッケージ不要の開発用静的サーバー
```

本プロジェクトはコンテナ基盤（Docker等）を使わず、Node.js / PostgreSQLをホストに直接インストールして動かす構成です。

## セットアップ（開発環境）

### 1. PostgreSQLを用意

```bash
# 例: ローカルPostgreSQLにDB/ユーザーを作成
createuser soloshop --pwprompt
createdb soloshop -O soloshop
```

### 2. バックエンド

```bash
cd backend
cp .env.example .env   # 必要に応じて値を編集（DATABASE_URL, JWTシークレット等）
npm install
npm run prisma:migrate:dev   # マイグレーション適用
npm run seed                 # サンプルデータ投入（店主/デモ会員/商品/カテゴリ）
npm run dev                  # http://localhost:4000
```

### 3. フロントエンド

ビルド不要の素のHTML/JavaScriptです。`frontend/assets/js/config.js` の `API_BASE_URL` がバックエンドのURL（既定値 `http://localhost:4000/api`）を指しているため、バックエンドの `CORS_ORIGIN` は下記サーバーの既定ポート `http://localhost:5173` のままで動作します。

```bash
cd frontend
npm run dev                  # http://localhost:5173 で静的配信（依存パッケージ不要）
```

`npm run dev` は Node.js 標準機能のみで実装した簡易サーバー（`server.js`）を起動します。任意の静的ファイルサーバー（`npx serve`、`python -m http.server` 等）でも代替可能です。

### デモアカウント（シード投入済み）

| 種別 | メールアドレス | パスワード |
|---|---|---|
| 店主（管理者） | owner@soloshop.example.com | Owner@12345 |
| 一般会員 | demo@soloshop.example.com | Demo@12345 |

本番運用時は `.env` の `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `ADMIN_PASSWORD` を必ず変更してください。また、`frontend/legal.html`（特定商取引法に基づく表示）の【 】内も実際の情報に置き換えてから公開してください。

## 本番運用（参考）

```bash
# バックエンド
cd backend
npm install
npm run build
npm run prisma:migrate   # prisma migrate deploy
npm start                 # node dist/index.js

# フロントエンド（ビルド不要。frontend/ 配下を任意のWebサーバー・CDNでそのまま配信する）
# 配信前に assets/js/config.js の API_BASE_URL を本番バックエンドのURLに変更すること
cd frontend
npm start                  # 動作確認用に簡易サーバーで配信する場合
```

## テスト

```bash
cd backend
npm test        # vitest + supertest によるAPIテスト
npx tsc --noEmit  # 型チェック
```

フロントエンドはビルドや型チェックを必要としない素のHTML/JavaScriptです。`npm run dev` でサーバーを起動し、ブラウザで主要な画面・操作を確認してください。

## セキュリティ設計の要点

- パスワードは bcrypt でハッシュ化して保存
- JWT（アクセス短命 + リフレッシュ）による認証、フロントエンドのfetchラッパーで401時に自動リフレッシュ
- 全APIエンドポイントでZodによる入力バリデーション
- Prisma ORMによりSQLインジェクションを防止
- Helmet + CORS許可オリジン限定 + 認証系・注文系レート制限
- 管理者（店主）APIはRBACミドルウェア (`requireAdmin`) で保護
- パスワード再設定トークンはハッシュ化保存・30分有効・使い切り。アカウント有無に関わらず同一レスポンスとしユーザー列挙を防止
- バックエンドは `/api/health`（liveness）と `/api/health/ready`（DB疎通込みreadiness）を提供し、未捕捉例外はログ出力の上で安全にプロセスを終了

## 個人向けに簡素化したポイント

小〜中規模事業者向けの元プラットフォームから、個人が一人で運営することを前提に以下を大胆に簡素化しています。

- **クーポン機能を廃止**: 発行・取得・チェックアウト適用・新規登録特典の自動付与を全て削除し、注文金額計算をシンプルに保っています。
- **管理者は店主一人を想定**: 複数管理者の作成・権限管理機能は設けていません（`ADMIN`ロールは seed で1件のみ作成）。
- **カテゴリはフラットな1階層のみ**: 大分類/中分類のツリー構造を廃止し、管理画面もシンプルな一覧+追加/削除のみにしています。
- **バナー管理を廃止**: トップページの管理者用カルーセル管理機能を削除し、静的なウェルカムメッセージに置き換えています。

## ライセンス・注意事項

本プロジェクトは学習・個人利用目的のオリジナル実装であり、特定の企業のブランド・商標・デザインは一切使用していません。
