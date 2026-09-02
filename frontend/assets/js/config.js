// バックエンドAPIの場所。
//
// 本番では、購入者向けサイトとAPIを同じドメインで配信する構成（deploy/nginx.conf.example）を
// 想定している。その場合は同じドメインの /api を見ればよいので、設定を書き換える必要はない。
// 書き換え忘れでサイトが動かなくなるのを防ぐため、既定でそうしている。
//
// APIを別のドメインで公開する場合だけ、下の関数の戻り値を直接書き換えること。
// 例: return 'https://api.example.com/api';
// その場合はバックエンドの CORS_ORIGIN に、購入者向けサイトのURLを設定すること。

function resolveApiBaseUrl() {
  const { protocol, hostname, port } = location;

  // ローカルで直接開いている場合（frontend を 5173 番で動かしているとき）は、
  // 別ポートのバックエンドをそのまま見る。
  if (['localhost', '127.0.0.1'].includes(hostname) && port === '5173') {
    return 'http://localhost:4000/api';
  }

  // GitHub Codespaces / Gitpod のように、ポート番号をホスト名に埋め込んで
  // 転送するクラウド開発環境（例: https://foo-5173.app.github.dev）。
  // frontendの5173番をbackendの4000番に置き換えたURLを組み立てる。
  // このURLへは直接ブラウザからアクセスするため、backend側のポートも
  // frontendと同様に公開（ブラウザからアクセス可能）設定にしておくこと。
  if (/(?:^|[.-])5173(?:[.-]|$)/.test(hostname)) {
    // 転送は通常443番(HTTPS)を暗黙に使うため port は空文字になるが、
    // 明示的なポートで転送する環境もあるため、あれば保持する。
    const portSuffix = port ? `:${port}` : '';
    return `${protocol}//${hostname.replace('5173', '4000')}${portSuffix}/api`;
  }

  // 本番相当（nginx等が同一ドメインでAPIへ中継する構成）
  return '/api';
}

export const API_BASE_URL = resolveApiBaseUrl();
