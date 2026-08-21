// ESLint の設定（v9以降の「フラット設定」形式）。
//
// backend(TypeScript) と frontend(素のJavaScript) を1つの設定でまとめて見る。
// frontend はビルドを挟まずブラウザへそのまま配ることを選んでいるため、
// 打ち間違いや存在しない変数の参照を機械的に見つける手段がここしか無い。
// 実際に、書き間違えた変数名がテストをすり抜けて画面を壊したことがある。

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    // 生成物・依存・アップロードされた画像は対象外
    ignores: [
      '**/node_modules/**',
      'backend/dist/**',
      'backend/uploads/**',
      'backend/prisma/migrations/**',
      'frontend/assets/css/**',
    ],
  },

  // --- 日本語のテキストを扱ううえでの調整（全ファイル共通） ---
  {
    rules: {
      // 全角スペースは、日本語の文面で桁を揃えるために使う。
      // 例: 「・リネンシャツ × 1」と金額の間。文字列・テンプレート・コメント内は見逃す。
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipComments: true }],
    },
  },

  // --- バックエンド（TypeScript / Node.js） ---
  {
    files: ['backend/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // 「使っていない」の指摘は、先頭に _ を付けた引数だけ見逃す。
      // 例: catch (_err) のように、受け取るが使わないことを明示した場合。
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // --- テスト ---
  {
    files: ['backend/**/*.test.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // テストではモックの都合で any を使うことがある
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // --- フロントエンド（ブラウザで動く素のJavaScript） ---
  {
    files: ['frontend/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // --- フロントエンドの簡易サーバー（こちらはNode.jsで動く） ---
  {
    files: ['frontend/server.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
