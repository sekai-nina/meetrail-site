const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../assets/support-finances.js'), 'utf8');

async function render(data, ok = true) {
  const elements = {};
  const node = () => ({ hidden: true, textContent: '', href: '', children: [], append(child) { this.children.push(child); } });
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
  assert.match(els['finance-months'].children[0].textContent, /2026-11/);
});

test('不正な支援先やデータは表示せずエラーにする', async () => {
  const els = await render({ version: 1, updatedAt: null, paymentUrl: 'https://example.com', months: [] });
  assert.equal(els['support-payment-wrap'], undefined);
  assert.match(els['finance-status'].textContent, /読み込めません/);
  assert.match(els['support-payment-status'].textContent, /確認できません/);
});
