const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../assets/support-finances.js'), 'utf8');

async function render(data, ok = true) {
  const elements = {};
  const node = () => ({ hidden: true, textContent: '', href: '', className: '', style: {}, attrs: {}, children: [], append(...kids) { this.children.push(...kids); }, setAttribute(k, v) { this.attrs[k] = v; } });
  const document = { getElementById(id) { return elements[id] ??= node(); }, createElement: node };
  await vm.runInNewContext(script, { document, fetch: async () => ({ ok, json: async () => data }) });
  return elements;
}

test('未入力は0円扱いせず支援ボタンを表示しない', async () => {
  const els = await render({ version: 1, updatedAt: null, paymentUrl: null, months: [] });
  assert.match(els['finance-status'].textContent, /準備中/);
  assert.equal(els['support-payment-wrap'], undefined);
});

test('公開済みの支援額・実費・概算と差額を表示する', async () => {
  const els = await render({ version: 1, updatedAt: '2026-11-23', paymentUrl: 'https://buy.stripe.com/example', months: [{ month: '2026-11', supportYen: 1000, actualExpenseYen: 2000, estimatedExpenseYen: 500 }] });
  assert.equal(els['support-payment-wrap'].hidden, false);
  assert.equal(els['finance-content'].hidden, false);
  assert.equal(els['finance-balance'].textContent, '1,500円の赤字');
  assert.match(els['finance-updated'].textContent, /2026年11月23日/);
});

test('不正な支援先やデータは表示せずエラーにする', async () => {
  const els = await render({ version: 1, updatedAt: null, paymentUrl: 'https://example.com', months: [] });
  assert.equal(els['support-payment-wrap'], undefined);
  assert.match(els['finance-status'].textContent, /読み込めません/);
  assert.match(els['support-payment-status'].textContent, /確認できません/);
});

test('月のデータだけが不正なら収支だけエラーにし、支援ボタンは残す', async () => {
  const els = await render({ version: 1, updatedAt: null, paymentUrl: 'https://buy.stripe.com/example', months: [{ month: '2026-11', supportYen: 1.5, actualExpenseYen: 0, estimatedExpenseYen: 0 }] });
  assert.equal(els['support-payment-wrap'].hidden, false);
  assert.match(els['finance-status'].textContent, /表示できません/);
});

test('概算が 0 円なら概算の行を出さない', async () => {
  const els = await render({ version: 1, updatedAt: '2026-11-25', paymentUrl: null, months: [{ month: '2026-11', supportYen: 0, actualExpenseYen: 10431, estimatedExpenseYen: 0 }] });
  assert.equal(els['finance-estimated-row'], undefined); // 触っていない = HTML の hidden のまま
  assert.equal(els['finance-balance'].textContent, '10,431円の赤字');
});

test('概算があれば概算の行と注記を出す', async () => {
  const els = await render({ version: 1, updatedAt: null, paymentUrl: null, months: [{ month: '2026-11', supportYen: 0, actualExpenseYen: 100, estimatedExpenseYen: 50 }] });
  assert.equal(els['finance-estimated-row'].hidden, false);
  assert.equal(els['finance-estimated-note'].hidden, false);
});

test('最新の月にまかなえた割合と残りを出し、過去の月は細い棒で並べる', async () => {
  const els = await render({ version: 1, updatedAt: null, paymentUrl: null, months: [
    { month: '2026-10', supportYen: 1500, actualExpenseYen: 7500, estimatedExpenseYen: 0 },
    { month: '2026-11', supportYen: 0, actualExpenseYen: 10431, estimatedExpenseYen: 0 },
  ] });
  assert.equal(els['coverage'].hidden, false);
  assert.match(els['coverage-label'].textContent, /2026年11月/);
  assert.equal(els['coverage-percent'].textContent, '0%');
  assert.equal(els['coverage-fill'].style.width, '0%');
  assert.match(els['coverage-remaining'].textContent, /あと 10,431円/);
  assert.equal(els['finance-months'].children.length, 2); // 最新の月も一覧に入る
  const past = els['finance-months'].children[1];
  assert.equal(past.children[0].children[0].textContent, '2026年10月');
  assert.equal(past.children[0].children[1].textContent, '20%');
  assert.equal(past.children[1].children[0].style.width, '20%');
});

test('運営費を超えたら割合は 100% 超、棒は 100% で止める', async () => {
  const els = await render({ version: 1, updatedAt: null, paymentUrl: null, months: [
    { month: '2026-11', supportYen: 12000, actualExpenseYen: 10000, estimatedExpenseYen: 0 },
  ] });
  assert.equal(els['coverage-percent'].textContent, '120%');
  assert.equal(els['coverage-fill'].style.width, '100%');
  assert.match(els['coverage-remaining'].textContent, /まかなえています/);
});

test('運営費も応援も 0 円の月は「まかなえています」と言わない', async () => {
  const els = await render({ version: 1, updatedAt: null, paymentUrl: null, months: [
    { month: '2026-11', supportYen: 0, actualExpenseYen: 0, estimatedExpenseYen: 0 },
  ] });
  assert.equal(els['coverage-percent'].textContent, '');
  assert.match(els['coverage-remaining'].textContent, /運営費はありません/);
});
