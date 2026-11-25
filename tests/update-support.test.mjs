import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  expandInvoice,
  expandSession,
  jstDate,
  jstMonthRange,
  netYenOf,
  netYenOfInvoice,
  PendingBalanceError,
  updateSupportFinances,
} from '../scripts/update-support.mjs';

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

test('展開されなかった charge と残高取引を個別に取り直す', async () => {
  const calls = [];
  const get = async (p) => {
    calls.push(p);
    if (p === '/charges/ch_1') return { id: 'ch_1', amount_refunded: 0, balance_transaction: 'txn_1' };
    if (p === '/balance_transactions/txn_1') return { currency: 'jpy', net: 96 };
    throw new Error(`unexpected ${p}`);
  };
  const session = { ...paid(0), payment_intent: { latest_charge: 'ch_1' } };
  const expanded = await expandSession(session, 'rk_test', get);
  assert.deepEqual(calls, ['/charges/ch_1', '/balance_transactions/txn_1']);
  assert.equal(netYenOf(expanded), 96);
});

test('展開済みなら取り直さない', async () => {
  const expanded = await expandSession(paid(96), 'rk_test', async () => {
    throw new Error('should not fetch');
  });
  assert.equal(netYenOf(expanded), 96);
});

test('残高取引がまだ無ければ保留として止める', async () => {
  const session = { ...paid(0), payment_intent: { latest_charge: { amount_refunded: 0, balance_transaction: null } } };
  await assert.rejects(expandSession(session, 'rk_test', async () => ({})), PendingBalanceError);
});

test('未完了のセッションは取り直さない', async () => {
  const session = { ...paid(0), status: 'expired', payment_intent: 'pi_1' };
  assert.equal(await expandSession(session, 'rk_test', async () => { throw new Error('no'); }), session);
});

const paidInvoice = (net, amountRefunded = 0) => ({
  id: 'in_test',
  status: 'paid',
  currency: 'jpy',
  charge: { amount_refunded: amountRefunded, balance_transaction: { currency: 'jpy', net } },
});

test('毎月の応援の請求書は手数料を引いた net、返金分を除く', () => {
  assert.equal(netYenOfInvoice(paidInvoice(288)), 288);
  assert.equal(netYenOfInvoice(paidInvoice(288, 100)), 188);
  assert.equal(netYenOfInvoice({ ...paidInvoice(288), status: 'open' }), 0);
  assert.equal(netYenOfInvoice({ ...paidInvoice(0), charge: null }), 0);
  assert.throws(() => netYenOfInvoice({ ...paidInvoice(288), currency: 'usd' }), /currency/);
});

test('請求書の charge と残高取引が展開されていなければ取り直す', async () => {
  const calls = [];
  const get = async (p) => {
    calls.push(p);
    if (p === '/charges/ch_9') return { amount_refunded: 0, balance_transaction: 'txn_9' };
    if (p === '/balance_transactions/txn_9') return { currency: 'jpy', net: 288 };
    throw new Error(`unexpected ${p}`);
  };
  const expanded = await expandInvoice({ ...paidInvoice(0), charge: 'ch_9' }, 'rk_test', get);
  assert.deepEqual(calls, ['/charges/ch_9', '/balance_transactions/txn_9']);
  assert.equal(netYenOfInvoice(expanded), 288);
});

test('毎月の応援だけ設定されていても集計する', async () => {
  const file = await withJson({
    version: 1,
    updatedAt: '2026-11-25',
    paymentUrl: null,
    monthlyPayments: [{ yen: 300, url: 'https://buy.stripe.com/m300' }],
    months: [{ month: '2026-12', supportYen: 0, actualExpenseYen: 100, estimatedExpenseYen: 0 }],
  });
  const isChanged = await updateSupportFinances({ path: file, apiKey: 'rk_test', netYenFor: async () => 288 });
  assert.equal(isChanged, true);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).months[0].supportYen, 288);
});
