'use strict';

/* tastes.js / app.js のデータ検証と生成スモークテスト（node scripts/check.js） */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

// app.js が初期化時に触る DOM の最小スタブ
function stubElement() {
  return {
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
  };
}

const context = {
  document: {
    getElementById: () => stubElement(),
    querySelectorAll: () => [],
    createElement: () => stubElement(),
    activeElement: null,
  },
  navigator: {},
  console,
  clearTimeout,
  setTimeout: () => 0,
};
vm.createContext(context);

for (const file of ['tastes.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

// const/function 宣言はコンテキストのグローバルレキシカル環境に入るため式で取り出す
const { TASTES, generatePalettes, hexToHsl } = vm.runInContext(
  '({ TASTES, generatePalettes, hexToHsl })', context
);

let errors = 0;
function assert(cond, message) {
  if (!cond) {
    errors++;
    console.error('NG:', message);
  }
}

/* ---------- データ構造 ---------- */

assert(Array.isArray(TASTES), 'TASTES が配列であること');
assert(TASTES.length === 40, `テイストが40種類あること（実際: ${TASTES.length}）`);

const ids = new Set();
for (const t of TASTES) {
  assert(t.id && !ids.has(t.id), `テイストID重複なし: ${t.id}`);
  ids.add(t.id);
  assert(typeof t.label === 'string' && t.label.length > 0, `${t.id}: label があること`);
  assert(Array.isArray(t.s) && t.s.length === 2 && t.s[0] <= t.s[1], `${t.id}: s レンジが妥当`);
  assert(Array.isArray(t.l) && t.l.length === 2 && t.l[0] <= t.l[1], `${t.id}: l レンジが妥当`);
  assert(Array.isArray(t.recipes) && t.recipes.length === 6, `${t.id}: レシピが6つあること（実際: ${t.recipes?.length}）`);

  const names = new Set();
  for (const r of t.recipes || []) {
    assert(typeof r.name === 'string' && r.name.length > 0, `${t.id}: レシピ名があること`);
    assert(!names.has(r.name), `${t.id}: レシピ名重複なし: ${r.name}`);
    names.add(r.name);
    assert(Array.isArray(r.colors) && r.colors.length === 6, `${t.id}/${r.name}: 6色であること`);
    const baseCount = (r.colors || []).filter((c) => c.b).length;
    assert(baseCount === 1, `${t.id}/${r.name}: 基準色がちょうど1つ（実際: ${baseCount}）`);
  }
}

/* ---------- 生成スモークテスト ---------- */

const HEX_RE = /^#[0-9a-f]{6}$/;
const sampleBases = ['#3b82f6', '#e74c3c', '#f5e6c8', '#222831', '#16a085', '#ffffff', '#000000'];

for (const hex of sampleBases) {
  const base = hexToHsl(hex);
  for (const taste of TASTES) {
    const palettes = generatePalettes(base, taste);
    assert(palettes.length === 6, `${taste.id}@${hex}: 6パターン生成されること`);
    for (const p of palettes) {
      assert(p.colors.length === 6, `${taste.id}/${p.name}@${hex}: 6色生成されること`);
      for (const c of p.colors) {
        assert(HEX_RE.test(c), `${taste.id}/${p.name}@${hex}: 妥当なhex（実際: ${c}）`);
      }
      assert(new Set(p.colors).size >= 4, `${taste.id}/${p.name}@${hex}: 色の重複が少ないこと（ユニーク: ${new Set(p.colors).size}）`);
    }
  }
}

if (errors === 0) {
  const total = TASTES.reduce((n, t) => n + t.recipes.length, 0);
  console.log(`OK: ${TASTES.length} テイスト / ${total} レシピ / 生成テスト ${sampleBases.length} 基準色 × ${TASTES.length} テイスト`);
} else {
  console.error(`${errors} 件のエラー`);
  process.exit(1);
}
