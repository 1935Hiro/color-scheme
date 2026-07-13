'use strict';

/* ================================================================
 * 色変換ユーティリティ
 * ================================================================ */

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// "3b82f6" / "#3b82f6" / "#abc" → "#3b82f6"（不正なら null）
function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) {
    s = s.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-f]{6}$/.test(s)) return null;
  return '#' + s;
}

// hex → {h: 0-360, s: 0-100, l: 0-100}
function hexToHsl(hex) {
  const n = normalizeHex(hex);
  if (!n) return null;
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// h: 0-360, s: 0-100, l: 0-100 → "#rrggbb"
function hslToHex(h, s, l) {
  h = mod(h, 360);
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

// 背景色に対して読みやすい文字色を返す
function textColorFor(hex) {
  const n = normalizeHex(hex);
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? 'rgba(0,0,0,.72)' : 'rgba(255,255,255,.92)';
}

// 色相を target に向かって amount(0-1) だけ引き寄せる（最短経路）
function pullHue(h, target, amount) {
  const diff = mod(target - h + 540, 360) - 180;
  return mod(h + diff * amount, 360);
}

/* ================================================================
 * アクセシビリティ: コントラスト比 & 色覚シミュレーション
 * ================================================================ */

// WCAG 2.1 相対輝度
function relativeLuminance(hex) {
  const n = normalizeHex(hex);
  const lin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = lin(parseInt(n.slice(1, 3), 16));
  const g = lin(parseInt(n.slice(3, 5), 16));
  const b = lin(parseInt(n.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG コントラスト比（1〜21）
function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// 色覚タイプ別の近似変換行列（Viénot 1999 の線形RGB近似）
const CVD_TYPES = [
  {
    id: 'protan', label: '1型色覚（P型）',
    m: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
  },
  {
    id: 'deutan', label: '2型色覚（D型）',
    m: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
  },
  {
    id: 'tritan', label: '3型色覚（T型）',
    m: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525],
  },
];

// hex を指定タイプの見え方に変換（線形RGB上で行列変換する近似）
function simulateCvd(hex, matrix) {
  const n = normalizeHex(hex);
  const toLin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const toSrgb = (v) => {
    v = clamp(v, 0, 1);
    v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
  };
  const r = toLin(parseInt(n.slice(1, 3), 16));
  const g = toLin(parseInt(n.slice(3, 5), 16));
  const b = toLin(parseInt(n.slice(5, 7), 16));
  const m = matrix;
  const r2 = m[0] * r + m[1] * g + m[2] * b;
  const g2 = m[3] * r + m[4] * g + m[5] * b;
  const b2 = m[6] * r + m[7] * g + m[8] * b;
  return '#' + toSrgb(r2) + toSrgb(g2) + toSrgb(b2);
}

/* ================================================================
 * カラーイメージテイスト定義
 * s / l はそのテイストのトーンレンジ（生成色をこの範囲に収める）
 * huePull はベース以外の色相を特定方向へ寄せる補正
 * ================================================================ */

const TASTES = [
  { id: 'vivid',    label: 'ビビッド／ポップ',   s: [70, 100], l: [45, 60] },
  { id: 'cute',     label: 'かわいい／パステル', s: [35, 65],  l: [74, 90] },
  { id: 'natural',  label: 'ナチュラル',         s: [25, 55],  l: [45, 70], huePull: { target: 80,  amount: 0.25 } },
  { id: 'elegant',  label: 'エレガント',         s: [14, 40],  l: [40, 66], huePull: { target: 300, amount: 0.18 } },
  { id: 'modern',   label: 'モダン／クール',     s: [8, 35],   l: [24, 55], huePull: { target: 215, amount: 0.22 } },
  { id: 'retro',    label: 'レトロ',             s: [35, 60],  l: [34, 56] },
  { id: 'japanese', label: '和風／シック',       s: [15, 45],  l: [24, 46] },
  { id: 'clear',    label: 'クリア／爽やか',     s: [40, 72],  l: [64, 86], huePull: { target: 200, amount: 0.22 } },
  { id: 'romantic', label: 'ロマンティック',     s: [25, 55],  l: [70, 88], huePull: { target: 340, amount: 0.25 } },
  { id: 'feminine', label: 'フェミニン',         s: [30, 60],  l: [58, 80], huePull: { target: 320, amount: 0.20 } },
  { id: 'gorgeous', label: 'ゴージャス／豪華',   s: [45, 80],  l: [30, 52], huePull: { target: 40,  amount: 0.15 } },
  { id: 'mysterious', label: 'ミステリアス',     s: [25, 55],  l: [18, 40], huePull: { target: 270, amount: 0.25 } },
  { id: 'tropical', label: 'トロピカル',         s: [65, 95],  l: [50, 68], huePull: { target: 150, amount: 0.15 } },
  { id: 'casual',   label: 'カジュアル',         s: [55, 85],  l: [52, 70] },
  { id: 'urban',    label: 'アーバン／無機質',   s: [3, 18],   l: [35, 65] },
  { id: 'earth',    label: 'アース／オータム',   s: [30, 60],  l: [35, 58], huePull: { target: 30,  amount: 0.30 } },
  { id: 'minimal',  label: 'ミニマル／モノトーン', s: [0, 10], l: [22, 82] },
  { id: 'smoky',    label: 'スモーキー／ニュアンス', s: [8, 26], l: [45, 72] },
  { id: 'nordic',   label: '北欧／ノルディック', s: [15, 45],  l: [62, 86], huePull: { target: 210, amount: 0.15 } },
  { id: 'vintage',  label: 'ヴィンテージ／セピア', s: [15, 40], l: [40, 65], huePull: { target: 35, amount: 0.35 } },
  { id: 'classic',  label: 'クラシック／トラッド', s: [25, 52], l: [24, 46], huePull: { target: 355, amount: 0.15 } },
  { id: 'dandy',    label: 'ダンディ／マスキュリン', s: [10, 35], l: [20, 42], huePull: { target: 220, amount: 0.20 } },
  { id: 'midnight', label: 'ラグジュアリー／ミッドナイト', s: [30, 60], l: [12, 32], huePull: { target: 240, amount: 0.20 } },
  { id: 'cyber',    label: 'サイバー／ネオン',   s: [75, 100], l: [50, 66], huePull: { target: 285, amount: 0.20 } },
  { id: 'sweet',    label: 'スイート／キャンディ', s: [50, 80], l: [68, 86], huePull: { target: 330, amount: 0.20 } },
  { id: 'fresh',    label: 'フレッシュ／シトラス', s: [60, 90], l: [55, 75], huePull: { target: 75,  amount: 0.25 } },
  { id: 'marine',   label: 'マリン／オーシャン', s: [45, 80],  l: [45, 70], huePull: { target: 210, amount: 0.35 } },
  { id: 'forest',   label: 'フォレスト／ボタニカル', s: [30, 60], l: [30, 55], huePull: { target: 130, amount: 0.35 } },
  { id: 'sunset',   label: 'サンセット／ウォーム', s: [55, 85], l: [50, 68], huePull: { target: 25,  amount: 0.30 } },
  { id: 'ethnic',   label: 'エスニック／スパイス', s: [50, 80], l: [38, 58], huePull: { target: 15,  amount: 0.20 } },
];

/* ================================================================
 * 配色パターン生成
 *
 * 各エントリ:
 *   dh    — 基準色からの色相オフセット（度）
 *   ds/dl — テイストレンジ内の相対位置(0-1)への加算オフセット
 *   base  — true なら基準色そのものを使用
 * ================================================================ */

const SCHEMES = [
  {
    name: '同系色（モノクロマティック）',
    entries: [
      { dh: 0, ds: -0.10, dl: 0.38 },
      { dh: 0, ds: -0.20, dl: 0.20 },
      { dh: 0, base: true },
      { dh: 0, ds: 0.12,  dl: -0.16 },
      { dh: 0, ds: -0.25, dl: -0.30 },
      { dh: 0, ds: 0.18,  dl: -0.44 },
    ],
  },
  {
    name: '類似色（アナロガス）',
    entries: [
      { dh: -30, dl: 0.12 },
      { dh: -15, dl: -0.10 },
      { dh: 0, base: true },
      { dh: 15, dl: 0.18 },
      { dh: 30, dl: -0.14 },
      { dh: 45, dl: 0.05 },
    ],
  },
  {
    name: '補色（コンプリメンタリー）',
    entries: [
      { dh: 0, base: true },
      { dh: 0,   dl: 0.24 },
      { dh: 0,   dl: -0.22, ds: -0.15 },
      { dh: 180, dl: 0.16 },
      { dh: 180 },
      { dh: 180, dl: -0.24 },
    ],
  },
  {
    name: '分裂補色（スプリット）',
    entries: [
      { dh: 0, base: true },
      { dh: 0,    dl: 0.22 },
      { dh: 150 },
      { dh: 150,  dl: 0.20 },
      { dh: -150 },
      { dh: -150, dl: -0.18 },
    ],
  },
  {
    name: 'トライアド',
    entries: [
      { dh: 0, base: true },
      { dh: 0,   dl: 0.24 },
      { dh: 120 },
      { dh: 120, dl: -0.16 },
      { dh: 240 },
      { dh: 240, dl: 0.20 },
    ],
  },
  {
    name: 'トーングラデーション',
    monotone: true, // 明度を単調変化させグラデーション向きに並べる
    entries: [
      { dh: 0, lPos: 1.0 },
      { dh: 0, lPos: 0.8 },
      { dh: 0, lPos: 0.6 },
      { dh: 0, lPos: 0.4 },
      { dh: 0, lPos: 0.2 },
      { dh: 0, lPos: 0.0 },
    ],
  },
];

// 基準色とテイストから6パターン（各6色）を生成する
function generatePalettes(base, taste) {
  const baseHex = hslToHex(base.h, base.s, base.l);
  // 基準色の彩度・明度をテイストレンジ内の相対位置(0-1)として扱う
  const sPosBase = base.s / 100;
  const lPosBase = base.l / 100;

  return SCHEMES.map((scheme) => {
    const colors = scheme.entries.map((e) => {
      if (e.base) return baseHex;

      let h = mod(base.h + (e.dh || 0), 360);
      if (taste.huePull && e.dh !== 0) {
        h = pullHue(h, taste.huePull.target, taste.huePull.amount);
      }

      let sPos, lPos;
      if (scheme.monotone) {
        sPos = clamp(sPosBase, 0.15, 1);
        // グラデーション用はテイストレンジを少し拡張して明暗差を出す
        const lMin = clamp(taste.l[0] - 14, 6, 94);
        const lMax = clamp(taste.l[1] + 14, 6, 94);
        return hslToHex(h, lerp(taste.s[0], taste.s[1], sPos), lerp(lMin, lMax, e.lPos));
      }

      sPos = clamp(sPosBase + (e.ds || 0), 0, 1);
      lPos = clamp(lPosBase + (e.dl || 0), 0, 1);
      const s = lerp(taste.s[0], taste.s[1], sPos);
      const l = lerp(taste.l[0], taste.l[1], lPos);
      return hslToHex(h, s, l);
    });
    return { name: scheme.name, colors };
  });
}

function gradientCss(colors) {
  const stops = colors.map((c, i) => `${c} ${Math.round((i / (colors.length - 1)) * 100)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/* ================================================================
 * メタリックグラデーション定義
 * ================================================================ */

const METALLICS = [
  { name: 'ゴールド',           css: 'linear-gradient(135deg, #f6e27a 0%, #f9d423 18%, #b8860b 38%, #f6e27a 52%, #e6c200 68%, #8b6914 88%, #f2d572 100%)' },
  { name: 'シャンパンゴールド', css: 'linear-gradient(135deg, #f7ecd7 0%, #ecd9b0 20%, #c9a96a 42%, #f2e4c6 58%, #d8bc84 78%, #b09155 100%)' },
  { name: 'サテンゴールド',     css: 'linear-gradient(135deg, #e9d8a6 0%, #d4b96a 25%, #c2a14e 50%, #e2cd8e 75%, #cbb05e 100%)' },
  { name: 'ホワイトゴールド',   css: 'linear-gradient(135deg, #fdfbf3 0%, #efe8d0 22%, #cfc4a0 42%, #f7f1de 58%, #ded4b2 80%, #c4b78e 100%)' },
  { name: 'ローズゴールド',     css: 'linear-gradient(135deg, #f8d7c9 0%, #eec1b0 20%, #c98d76 42%, #f3cabb 56%, #d9a08a 76%, #b57a63 100%)' },
  { name: 'ピンクゴールド',     css: 'linear-gradient(135deg, #fce4dc 0%, #f2c4b8 22%, #d69a8a 44%, #f7d4c8 58%, #e0ab9a 80%, #c48878 100%)' },
  { name: 'シルバー',           css: 'linear-gradient(135deg, #ffffff 0%, #d7d7d7 20%, #a8a8a8 40%, #f5f5f5 55%, #c0c0c0 72%, #8f8f8f 90%, #e8e8e8 100%)' },
  { name: 'クローム',           css: 'linear-gradient(135deg, #e8f0f8 0%, #ffffff 10%, #9fb2c4 30%, #5a6a7a 45%, #cfd9e4 55%, #ffffff 70%, #7e8e9e 90%, #dfe8f0 100%)' },
  { name: 'プラチナ',           css: 'linear-gradient(135deg, #f7f6f4 0%, #e5e3df 22%, #c3c0ba 42%, #f0eeea 58%, #d3d0ca 78%, #b5b2ac 100%)' },
  { name: 'スチール',           css: 'linear-gradient(135deg, #d8dee6 0%, #aab6c4 22%, #76828f 44%, #c4cdd8 58%, #8d99a7 78%, #626d7a 100%)' },
  { name: 'チタン',             css: 'linear-gradient(135deg, #d9d4cf 0%, #b3aca5 22%, #837c74 45%, #c8c1ba 60%, #9a938b 80%, #6e6760 100%)' },
  { name: 'ガンメタル',         css: 'linear-gradient(135deg, #6b7178 0%, #4a4f55 25%, #2b2e33 48%, #5c6167 62%, #3a3e43 82%, #24272b 100%)' },
  { name: 'カッパー（銅）',     css: 'linear-gradient(135deg, #e8a87c 0%, #d17e50 24%, #8f4a25 45%, #e09a6c 58%, #b56434 80%, #7a3d1d 100%)' },
  { name: 'ブロンズ',           css: 'linear-gradient(135deg, #d9b47f 0%, #b98a4a 24%, #7a5520 46%, #cfa768 60%, #96702f 82%, #5f4318 100%)' },
  { name: '真鍮（ブラス）',     css: 'linear-gradient(135deg, #e6cf7e 0%, #cbab4f 24%, #93752a 46%, #ddc26c 60%, #ab8c3a 82%, #7c621f 100%)' },
  { name: 'パール',             css: 'linear-gradient(135deg, #ffffff 0%, #fdeef2 18%, #e8ecf7 36%, #fff8ec 54%, #eef2f6 72%, #fbeaf0 88%, #ffffff 100%)' },
  { name: 'ホログラフィック',   css: 'linear-gradient(135deg, #ffd1ff 0%, #a6c1ee 18%, #c2ffd8 36%, #fff6b7 52%, #fbc2eb 68%, #a1c4fd 84%, #ffd1ff 100%)' },
  { name: 'オイルスリック',     css: 'linear-gradient(135deg, #1a2a3a 0%, #3f2b63 18%, #14555a 38%, #6b2d5c 56%, #1d3f6e 74%, #45215a 90%, #102030 100%)' },
  { name: 'メタリックブルー',   css: 'linear-gradient(135deg, #b7d3f3 0%, #5f93d8 24%, #1f4e96 46%, #8fb6e6 60%, #33619f 82%, #163767 100%)' },
  { name: 'メタリックレッド',   css: 'linear-gradient(135deg, #f3b3ad 0%, #d95f55 24%, #8e1f1a 46%, #e88a80 60%, #a83229 82%, #6b1512 100%)' },
  { name: 'メタリックグリーン', css: 'linear-gradient(135deg, #bfe3c0 0%, #6fae72 24%, #2c6231 46%, #97c79a 60%, #417d46 82%, #1d4721 100%)' },
  { name: 'メタリックパープル', css: 'linear-gradient(135deg, #dcc4ef 0%, #a674cf 24%, #5d2e8c 46%, #c39ce0 60%, #7644a3 82%, #421d68 100%)' },
  { name: 'ピアノブラック',     css: 'linear-gradient(135deg, #4a4a4e 0%, #1c1c1f 30%, #050506 55%, #333338 70%, #101012 90%, #232326 100%)' },
  { name: 'アルミニウム',       css: 'linear-gradient(135deg, #f2f4f5 0%, #d5d9dc 22%, #b2b7bb 44%, #e5e8ea 58%, #c3c8cc 80%, #a5aaae 100%)' },
  { name: 'マーキュリー（水銀）', css: 'linear-gradient(135deg, #ffffff 0%, #cfd4d8 15%, #8e969d 32%, #f2f5f7 48%, #a6aeb5 64%, #ffffff 80%, #b8bfc5 100%)' },
  { name: 'ブラッシュドシルバー', css: 'linear-gradient(135deg, rgba(255,255,255,.55) 0%, rgba(0,0,0,.22) 45%, rgba(255,255,255,.4) 60%, rgba(0,0,0,.18) 100%), repeating-linear-gradient(0deg, #b9bcc0 0px, #d8dbdf 2px, #aeb1b5 4px)' },
  { name: 'ヘアラインゴールド', css: 'linear-gradient(135deg, rgba(255,255,255,.5) 0%, rgba(0,0,0,.25) 45%, rgba(255,255,255,.35) 60%, rgba(0,0,0,.2) 100%), repeating-linear-gradient(0deg, #c9a54e 0px, #e8cd82 2px, #b8933d 4px)' },
  { name: 'カーボン',           css: 'linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(0,0,0,.35) 50%, rgba(255,255,255,.1) 100%), repeating-linear-gradient(45deg, #1c1e22 0px, #33363c 3px, #16181b 6px)' },
  { name: 'アイアン（鉄）',     css: 'linear-gradient(135deg, #9b968f 0%, #6e6963 24%, #45413c 46%, #8a857e 60%, #57534d 82%, #38342f 100%)' },
  { name: 'グラファイト',       css: 'linear-gradient(135deg, #7d7f84 0%, #55575c 25%, #313337 48%, #6a6c71 62%, #404247 82%, #27292d 100%)' },
  { name: 'タングステン',       css: 'linear-gradient(135deg, #b0aca4 0%, #8a867e 24%, #5f5b54 46%, #a09c94 60%, #726e66 82%, #4c4841 100%)' },
  { name: 'パラジウム',         css: 'linear-gradient(135deg, #eeedeb 0%, #d2d0cc 22%, #a9a7a2 44%, #e2e0dc 58%, #bcbab5 80%, #97958f 100%)' },
  { name: 'アンティークゴールド', css: 'linear-gradient(135deg, #d6bc76 0%, #ab8a3e 25%, #6f571f 48%, #c4a758 62%, #86682a 82%, #574314 100%)' },
  { name: '錆メタル（ラスト）', css: 'linear-gradient(135deg, #d18a56 0%, #a55a2e 20%, #6e3517 40%, #c07845 55%, #8a4820 72%, #55250e 90%, #a2582c 100%)' },
  { name: 'オーロラメタル',     css: 'linear-gradient(135deg, #8fe3d0 0%, #5aa7c9 20%, #7a6fc9 40%, #b98fd6 55%, #5fc4a8 75%, #4a7fc1 90%, #8fe3d0 100%)' },
  { name: 'プリズム',           css: 'linear-gradient(135deg, #ff9a9e 0%, #ffd76e 18%, #8ee98f 36%, #6ed6e8 54%, #8f9cf0 70%, #e08fe8 86%, #ff9a9e 100%)' },
  { name: 'ネオンクローム',     css: 'linear-gradient(135deg, #6ff7ff 0%, #3aa7ff 22%, #7b4dff 44%, #e64df0 62%, #4d7cff 82%, #6ff7ff 100%)' },
  { name: 'メタリックピンク',   css: 'linear-gradient(135deg, #fbd0e0 0%, #ef8fb2 24%, #b34578 46%, #f5b3cc 60%, #cc6693 82%, #8f2f5c 100%)' },
  { name: 'メタリックオレンジ', css: 'linear-gradient(135deg, #ffd0a3 0%, #f59a4e 24%, #b05e14 46%, #fcbd80 60%, #cc7a2b 82%, #8a470c 100%)' },
  { name: 'メタリックティール', css: 'linear-gradient(135deg, #b0e8e3 0%, #5fb8b0 24%, #206b64 46%, #8fd4cd 60%, #398880 82%, #124d47 100%)' },
  { name: 'メタリックワイン',   css: 'linear-gradient(135deg, #d9a0b0 0%, #a85570 24%, #6b1f3a 46%, #c47f94 60%, #883350 82%, #4d1128 100%)' },
];

/* ================================================================
 * 状態管理
 * ================================================================ */

const state = {
  base: hexToHsl('#3b82f6'), // {h, s, l}
  tasteId: 'vivid',
};
const history = []; // ドリルダウン履歴: {base, tasteId}
const a11y = { fg: '#ffffff', bg: '#3b82f6' }; // コントラストチェッカーの状態

function currentTaste() {
  return TASTES.find((t) => t.id === state.tasteId) || TASTES[0];
}

function baseHex() {
  return hslToHex(state.base.h, state.base.s, state.base.l);
}

/* ================================================================
 * DOM 参照
 * ================================================================ */

const el = {
  mainTabs: document.getElementById('main-tabs'),
  tabGenerator: document.getElementById('tab-generator'),
  tabMetallic: document.getElementById('tab-metallic'),
  backBtn: document.getElementById('back-btn'),
  basePreview: document.getElementById('base-preview'),
  hexInput: document.getElementById('hex-input'),
  colorPicker: document.getElementById('color-picker'),
  sliderH: document.getElementById('slider-h'),
  sliderS: document.getElementById('slider-s'),
  sliderL: document.getElementById('slider-l'),
  valueH: document.getElementById('value-h'),
  valueS: document.getElementById('value-s'),
  valueL: document.getElementById('value-l'),
  tasteTabs: document.getElementById('taste-tabs'),
  palettes: document.getElementById('palettes'),
  metallicGallery: document.getElementById('metallic-gallery'),
  toast: document.getElementById('toast'),
  tabA11y: document.getElementById('tab-a11y'),
  fgPicker: document.getElementById('fg-picker'),
  fgHex: document.getElementById('fg-hex'),
  bgPicker: document.getElementById('bg-picker'),
  bgHex: document.getElementById('bg-hex'),
  swapContrast: document.getElementById('swap-contrast'),
  useBaseBg: document.getElementById('use-base-bg'),
  contrastPreview: document.getElementById('contrast-preview'),
  contrastRatio: document.getElementById('contrast-ratio'),
  wcagBadges: document.getElementById('wcag-badges'),
  baseContrast: document.getElementById('base-contrast'),
  cvdSim: document.getElementById('cvd-sim'),
};

/* ================================================================
 * コピー & トースト
 * ================================================================ */

let toastTimer = null;

function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('show');
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 300);
  }, 1600);
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // file:// などで Clipboard API が使えない場合のフォールバック
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  showToast(message);
}

/* ================================================================
 * 描画
 * ================================================================ */

function syncInputs() {
  const hex = baseHex();
  const { h, s, l } = state.base;

  if (document.activeElement !== el.hexInput) {
    el.hexInput.value = hex.toUpperCase();
  }
  el.colorPicker.value = hex;
  el.basePreview.style.background = hex;

  el.sliderH.value = h;
  el.sliderS.value = s;
  el.sliderL.value = l;
  el.valueH.textContent = `${h}°`;
  el.valueS.textContent = `${s}%`;
  el.valueL.textContent = `${l}%`;

  // スライダーの背景を現在の色に合わせる
  el.sliderH.style.background =
    'linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)';
  el.sliderS.style.background =
    `linear-gradient(90deg, ${hslToHex(h, 0, l)}, ${hslToHex(h, 100, l)})`;
  el.sliderL.style.background =
    `linear-gradient(90deg, #000, ${hslToHex(h, s, 50)}, #fff)`;

  el.backBtn.hidden = history.length === 0;
}

function renderTasteTabs() {
  el.tasteTabs.innerHTML = TASTES.map((t) =>
    `<button class="taste-tab${t.id === state.tasteId ? ' active' : ''}" data-taste="${t.id}">${t.label}</button>`
  ).join('');
}

function renderPalettes() {
  const palettes = generatePalettes(state.base, currentTaste());
  const base = baseHex();

  el.palettes.innerHTML = palettes.map((p) => {
    const swatches = p.colors.map((c) => {
      const upper = c.toUpperCase();
      const isBase = c === base;
      return `
        <div class="swatch-col">
          <button class="swatch${isBase ? ' is-base' : ''}" data-expand="${c}"
                  style="background:${c}; color:${textColorFor(c)}"
                  title="この色から配色を展開">
            <span class="swatch-expand">展開 ▸</span>
            ${isBase ? '<span class="base-badge">基準色</span>' : ''}
          </button>
          <button class="copy-btn" data-copy="${upper}" title="カラーコードをコピー">
            <code>${upper}</code><span class="copy-icon">⧉</span>
          </button>
        </div>`;
    }).join('');

    const grad = gradientCss(p.colors);
    return `
      <div class="palette-card">
        <h3 class="palette-name">${p.name}</h3>
        <div class="swatch-row">${swatches}</div>
        <div class="gradient-row">
          <div class="gradient-bar" style="background:${grad}"></div>
          <button class="grad-copy-btn" data-copy-css="background: ${grad};">CSSコピー</button>
        </div>
      </div>`;
  }).join('');
}

function renderMetallics() {
  el.metallicGallery.innerHTML = METALLICS.map((m) => `
    <div class="metallic-card">
      <div class="metallic-preview" style="background:${m.css}"></div>
      <div class="metallic-info">
        <span class="metallic-name">${m.name}</span>
        <button class="grad-copy-btn" data-copy-css="background: ${m.css};">CSSコピー</button>
      </div>
    </div>`
  ).join('');
}

/* ---------------- アクセシビリティタブ ---------------- */

function wcagBadge(label, ok) {
  return `<span class="wcag-badge ${ok ? 'pass' : 'fail'}">${ok ? '✓' : '✕'} ${label}</span>`;
}

function renderContrastChecker() {
  const { fg, bg } = a11y;
  const ratio = contrastRatio(fg, bg);
  const r = Math.round(ratio * 100) / 100;

  el.fgPicker.value = fg;
  el.bgPicker.value = bg;
  if (document.activeElement !== el.fgHex) el.fgHex.value = fg.toUpperCase();
  if (document.activeElement !== el.bgHex) el.bgHex.value = bg.toUpperCase();

  el.contrastPreview.style.background = bg;
  el.contrastPreview.style.color = fg;
  el.contrastRatio.textContent = `${r} : 1`;

  el.wcagBadges.innerHTML = [
    wcagBadge('AA 通常テキスト（4.5:1）', ratio >= 4.5),
    wcagBadge('AA 大テキスト（3:1）', ratio >= 3),
    wcagBadge('AAA 通常テキスト（7:1）', ratio >= 7),
    wcagBadge('AAA 大テキスト（4.5:1）', ratio >= 4.5),
  ].join('');
}

function renderBaseContrast() {
  const base = baseHex();
  const rows = [
    { fg: '#ffffff', label: '白テキスト' },
    { fg: '#000000', label: '黒テキスト' },
  ].map(({ fg, label }) => {
    const ratio = Math.round(contrastRatio(fg, base) * 100) / 100;
    const okAA = ratio >= 4.5;
    const okLarge = ratio >= 3;
    return `
      <div class="base-contrast-item">
        <div class="base-contrast-sample" style="background:${base}; color:${fg}">
          ${label} Aa<br><small>${base.toUpperCase()}</small>
        </div>
        <div class="base-contrast-detail">
          <strong>${ratio} : 1</strong>
          ${wcagBadge('AA 通常', okAA)}
          ${wcagBadge('AA 大', okLarge)}
        </div>
      </div>`;
  });
  el.baseContrast.innerHTML = rows.join('');
}

function renderCvdSim() {
  const palettes = generatePalettes(state.base, currentTaste());

  el.cvdSim.innerHTML = palettes.map((p) => {
    const rows = [{ label: '通常', m: null }, ...CVD_TYPES].map((type) => {
      const cells = p.colors.map((c) => {
        const shown = type.m ? simulateCvd(c, type.m) : c;
        return `<div class="cvd-cell" style="background:${shown}" title="${type.m ? '元の色: ' + c.toUpperCase() : c.toUpperCase()}"></div>`;
      }).join('');
      return `
        <div class="cvd-row">
          <span class="cvd-label">${type.label}</span>
          <div class="cvd-strip">${cells}</div>
        </div>`;
    }).join('');
    return `
      <div class="cvd-palette">
        <h3 class="palette-name">${p.name}</h3>
        ${rows}
      </div>`;
  }).join('');
}

function renderA11y() {
  renderContrastChecker();
  renderBaseContrast();
  renderCvdSim();
}

function renderAll() {
  syncInputs();
  renderTasteTabs();
  renderPalettes();
  renderA11y();
}

/* ================================================================
 * 状態更新
 * ================================================================ */

function setBaseHsl(h, s, l) {
  state.base = { h: mod(Math.round(h), 360), s: clamp(Math.round(s), 0, 100), l: clamp(Math.round(l), 0, 100) };
  renderAll();
}

function setBaseHex(hex) {
  const hsl = hexToHsl(hex);
  if (hsl) setBaseHsl(hsl.h, hsl.s, hsl.l);
}

function drillDown(hex) {
  history.push({ base: { ...state.base }, tasteId: state.tasteId });
  setBaseHex(hex);
  showToast(`${hex.toUpperCase()} を基準色にしました`);
  el.tabGenerator.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function goBack() {
  const prev = history.pop();
  if (!prev) return;
  state.tasteId = prev.tasteId;
  setBaseHsl(prev.base.h, prev.base.s, prev.base.l);
}

/* ================================================================
 * イベント
 * ================================================================ */

// メインタブ切り替え
el.mainTabs.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.main-tab');
  if (!btn) return;
  document.querySelectorAll('.main-tab').forEach((b) => b.classList.toggle('active', b === btn));
  const tab = btn.dataset.tab;
  el.tabGenerator.hidden = tab !== 'generator';
  el.tabMetallic.hidden = tab !== 'metallic';
  el.tabA11y.hidden = tab !== 'a11y';
});

// HEX 入力
el.hexInput.addEventListener('input', () => {
  const hex = normalizeHex(el.hexInput.value);
  if (hex) setBaseHex(hex);
});
el.hexInput.addEventListener('blur', () => {
  el.hexInput.value = baseHex().toUpperCase();
});

// カラーピッカー
el.colorPicker.addEventListener('input', () => setBaseHex(el.colorPicker.value));

// HSL スライダー
el.sliderH.addEventListener('input', () => setBaseHsl(+el.sliderH.value, state.base.s, state.base.l));
el.sliderS.addEventListener('input', () => setBaseHsl(state.base.h, +el.sliderS.value, state.base.l));
el.sliderL.addEventListener('input', () => setBaseHsl(state.base.h, state.base.s, +el.sliderL.value));

// テイストタブ
el.tasteTabs.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.taste-tab');
  if (!btn) return;
  state.tasteId = btn.dataset.taste;
  renderAll();
});

// パレット内: コピー / ドリルダウン
el.palettes.addEventListener('click', (ev) => {
  const copyBtn = ev.target.closest('[data-copy]');
  if (copyBtn) {
    copyText(copyBtn.dataset.copy, `${copyBtn.dataset.copy} をコピーしました`);
    return;
  }
  const cssBtn = ev.target.closest('[data-copy-css]');
  if (cssBtn) {
    copyText(cssBtn.dataset.copyCss, 'グラデーションCSSをコピーしました');
    return;
  }
  const swatch = ev.target.closest('[data-expand]');
  if (swatch) drillDown(swatch.dataset.expand);
});

// メタリックギャラリー: CSS コピー
el.metallicGallery.addEventListener('click', (ev) => {
  const cssBtn = ev.target.closest('[data-copy-css]');
  if (cssBtn) copyText(cssBtn.dataset.copyCss, 'グラデーションCSSをコピーしました');
});

// 前に戻る
el.backBtn.addEventListener('click', goBack);

// コントラストチェッカー
function setContrastColor(key, hex) {
  const n = normalizeHex(hex);
  if (!n) return;
  a11y[key] = n;
  renderContrastChecker();
}

el.fgPicker.addEventListener('input', () => setContrastColor('fg', el.fgPicker.value));
el.bgPicker.addEventListener('input', () => setContrastColor('bg', el.bgPicker.value));
el.fgHex.addEventListener('input', () => setContrastColor('fg', el.fgHex.value));
el.bgHex.addEventListener('input', () => setContrastColor('bg', el.bgHex.value));
el.fgHex.addEventListener('blur', () => { el.fgHex.value = a11y.fg.toUpperCase(); });
el.bgHex.addEventListener('blur', () => { el.bgHex.value = a11y.bg.toUpperCase(); });

el.swapContrast.addEventListener('click', () => {
  [a11y.fg, a11y.bg] = [a11y.bg, a11y.fg];
  renderContrastChecker();
});

el.useBaseBg.addEventListener('click', () => {
  a11y.bg = baseHex();
  renderContrastChecker();
  showToast(`背景色を ${a11y.bg.toUpperCase()} に設定しました`);
});

/* ================================================================
 * 初期化
 * ================================================================ */

renderMetallics();
renderAll();
