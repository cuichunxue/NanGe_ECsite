// バックエンドAPIの場所。
//
// 本番では、購入者向けサイトとAPIを同じドメインで配信する構成（deploy/nginx.conf.example）を
// 想定している。その場合は同じドメインの /api を見ればよいので、設定を書き換える必要はない。
// 書き換え忘れでサイトが動かなくなるのを防ぐため、既定でそうしている。
//
// 開発中（frontend を 5173 番で動かしているとき）は、別ポートのバックエンドを見る。
//
// APIを別のドメインで公開する場合だけ、下の API_BASE_URL を直接書き換えること。
// 例: export const API_BASE_URL = 'https://api.example.com/api';
// その場合はバックエンドの CORS_ORIGIN に、購入者向けサイトのURLを設定すること。

const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '5173';

export const API_BASE_URL = isLocalDev ? 'http://localhost:4000/api' : '/api';
