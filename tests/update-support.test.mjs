import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { jstDate, jstMonthRange, netYenOf, updateSupportFinances } from '../scripts/update-support.mjs';

const paid = (net, amountRefunded = 0) => ({
  id: 'cs_test',
  status: 'complete',
  payment_status: 'paid',
  currency: 'jpy',
  payment_intent: {
    latest_charge: {
      amount_refunded: amountRefunded,
      balance_transaction: { currency: 'jpy', net },
    },
  },
});

test('JST の月の境界を Unix 秒で返す', () => {
  const { start, end } = jstMonthRange('2026-11');
  assert.equal(new Date(start * 1000).toISOString(), '2026-10-31T15:00:00.000Z');
  assert.equal(new Date(end * 1000).toISOString(), '2026-11-30T15:00:00.000Z');
  assert.equal(new Date(jstMonthRange('2026-12').end * 1000).toISOString(), '2026-12-31T15:00:00.000Z');
});

test('JST の日付', () => {
  assert.equal(jstDate(new Date('2026-11-25T15:30:00Z')), '2026-11-26');
});

test('手取りは手数料を引いた net、返金分を除く', () => {
  assert.equal(netYenOf(paid(482)), 482);
  assert.equal(netYenOf(paid(482, 200)), 282);
  assert.equal(netYenOf(paid(482, 500)), 0);
});

test('支払いが完了していないセッションは数えない', () => {
  assert.equal(netYenOf({ ...paid(482), status: 'expired' }), 0);
  assert.equal(netYenOf({ ...paid(482), payment_status: 'unpaid' }), 0);
});

test('円以外や残高取引が展開されていなければ止める', () => {
  assert.throws(() => netYenOf({ ...paid(482), currency: 'usd' }), /currency/);
  assert.throws(
    () => netYenOf({ ...paid(482), payment_intent: { latest_charge: { balance_transaction: 'txn_1' } } }),
    /not expanded/
  );
});

async function withJson(data) {
  const dir = await mkdtemp(path.join(tmpdir(), 'support-'));
  const file = path.join(dir, 'support-finances.json');
  await writeFile(file, JSON.stringify(data));
  return file;
}

test('JSON にある月の応援金だけを書き換え、更新日を JST の今日にする', async () => {
  const file = await withJson({
    version: 1,
    updatedAt: '2026-11-25',
    paymentUrl: 'https://buy.stripe.com/abc',
    months: [{ month: '2026-11', supportYen: 0, actualExpenseYen: 10431, estimatedExpenseYen: 0 }],
  });
  const isChanged = await updateSupportFinances({
    path: file,
    apiKey: 'rk_test',
    now: new Date('2026-11-27T00:00:00Z'),
    netYenFor: async (month) => (month === '2026-11' ? 964 : 999),
  });
  assert.equal(isChanged, true);
  const data = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(data.months.length, 1); // 運営費が未入力の月は足さない
  assert.equal(data.months[0].supportYen, 964);
  assert.equal(data.months[0].actualExpenseYen, 10431);
  assert.equal(data.updatedAt, '2026-11-27');
});

test('変わらなければ書き込まない', async () => {
  const original = {
    version: 1,
    updatedAt: '2026-11-25',
    paymentUrl: 'https://buy.stripe.com/abc',
    months: [{ month: '2026-11', supportYen: 964, actualExpenseYen: 10431, estimatedExpenseYen: 0 }],
  };
  const file = await withJson(original);
  const isChanged = await updateSupportFinances({ path: file, apiKey: 'rk_test', netYenFor: async () => 964 });
  assert.equal(isChanged, false);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), original);
});
