// 商品画像が未登録のときに表示するプレースホルダ。
// 外部の画像生成サービスに頼ると、写真を用意する前の商品を並べている間ずっと
// 外部通信が発生し、その事業者が落ちれば画像が壊れる。SVGを埋め込んで
// 通信ゼロ・即時表示にする。
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#f3f4f6"/>
  <g fill="none" stroke="#c9ccd1" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="128" y="140" width="144" height="112" rx="10"/>
    <path d="M128 214l38-36 30 28 34-32 40 38"/>
  </g>
  <circle cx="171" cy="174" r="11" fill="#c9ccd1"/>
  <text x="200" y="296" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#9aa0a6">画像はまだありません</text>
</svg>`;

export const NO_IMAGE_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(SVG)}`;
