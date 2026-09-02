/**
 * Tailwind CSS のビルド設定。
 *
 * 生成物 `assets/css/style.css` はリポジトリにコミットされており、
 * サイトを動かすだけならビルドは不要（従来どおり静的配信するだけでよい）。
 * 再ビルドが必要なのは、クラス名を新しく使い始めたときや配色を変えたときだけで、
 * その場合は `npm run build:css` を実行する。
 */
export default {
  content: ['./*.html', './admin/*.html', './assets/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf4ee',
          100: '#f8e3d3',
          400: '#d98a52',
          500: '#c1682f',
          600: '#a5551f',
          700: '#7c4018',
        },
      },
    },
  },
};
