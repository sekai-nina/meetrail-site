// 応援金の自動更新 (sekai-nina/meet-greet-app#2159)。
// support-finances.json の paymentUrl の決済リンク経由で受け取った応援金を Stripe から読み、
// JSON に載っている月ごとに、Stripe の手数料を引いた手取り (返金分を除く) を supportYen に書く。
// 運営費が未入力の月は JSON に無いので触らない (= 0 円の運営費を作らない。運営費を入れた後の実行で埋まる)。
//
// 使い方: STRIPE_API_KEY=<読み取り専用の制限付きキー> node scripts/update-support.mjs
// 依存なし (Node 20 以上の fetch)。キーは GitHub Actions の Secrets からだけ渡す。

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const STRIPE_API = 'https://api.stripe.com/v1';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PAGE_LIMIT = 100;

/** `2026-11` → JST のその月の [開始, 翌月開始) を Unix 秒で */
export function jstMonthRange(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = (Date.UTC(year, monthNumber - 1, 1) - JST_OFFSET_MS) / 1000;
  const end = (Date.UTC(year, monthNumber, 1) - JST_OFFSET_MS) / 1000;
  return { start, end };
}

/** JST の日付 `YYYY-MM-DD` */
export function jstDate(now) {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 1 件の Checkout Session の手取り (円)。支払い完了でなければ 0。
 * 手取り = 残高取引の net (= 金額 − Stripe の手数料) − 返金額。マイナスにはしない。
 */
export function netYenOf(session) {
  if (session.status !== 'complete' || session.payment_status !== 'paid') return 0;
  if (session.currency !== 'jpy') throw new Error(`unexpected currency: ${session.currency}`);
  const charge = session.payment_intent?.latest_charge;
  const transaction = charge?.balance_transaction;
  if (!transaction || typeof transaction !== 'object') {
    throw new Error(`balance transaction is not expanded: ${session.id}`);
  }
  if (transaction.currency !== 'jpy') {
    throw new Error(`unexpected settlement currency: ${transaction.currency}`);
  }
  return Math.max(transaction.net - (charge.amount_refunded ?? 0), 0);
}

async function stripeGet(path, params, apiKey) {
  const url = new URL(`${STRIPE_API}${path}`);
  for (const [key, value] of params) url.searchParams.append(key, String(value));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`Stripe ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function listAll(path, params, apiKey) {
  const items = [];
  let startingAfter;
  for (;;) {
    const page = await stripeGet(
      path,
      [...params, ['limit', PAGE_LIMIT], ...(startingAfter ? [['starting_after', startingAfter]] : [])],
      apiKey
    );
    items.push(...page.data);
    if (!page.has_more) return items;
    startingAfter = page.data.at(-1).id;
  }
}

/** 公開している URL から決済リンクの ID (plink_...) を引く */
async function findPaymentLinkId(paymentUrl, apiKey) {
  const links = await listAll('/payment_links', [], apiKey);
  const link = links.find((item) => item.url === paymentUrl);
  if (!link) throw new Error(`payment link not found for ${paymentUrl}`);
  return link.id;
}

/** 残高取引がまだ作られていない (= 決済直後など)。次の実行で数え直す */
export class PendingBalanceError extends Error {}

/**
 * 支払い済みのセッションの charge と残高取引を、展開されていなければ個別に取り直す。
 * (= 一覧の expand が深さや権限で効かず ID 文字列のまま返ることがある、2026-11-25 実測)
 */
export async function expandSession(session, apiKey, get = stripeGet) {
  if (session.status !== 'complete' || session.payment_status !== 'paid') return session;
  const paymentIntent = session.payment_intent;
  if (!paymentIntent || typeof paymentIntent !== 'object') {
    throw new Error(`payment intent is not expanded: ${session.id}`);
  }
  let charge = paymentIntent.latest_charge;
  if (typeof charge === 'string') {
    charge = await get(`/charges/${charge}`, [['expand[]', 'balance_transaction']], apiKey);
  }
  if (!charge) throw new PendingBalanceError(`charge is not created yet: ${session.id}`);
  let transaction = charge.balance_transaction;
  if (typeof transaction === 'string') {
    transaction = await get(`/balance_transactions/${transaction}`, [], apiKey);
  }
  if (!transaction) throw new PendingBalanceError(`balance transaction is not created yet: ${session.id}`);
  return {
    ...session,
    payment_intent: { ...paymentIntent, latest_charge: { ...charge, balance_transaction: transaction } },
  };
}

async function netYenForMonth(paymentLinkId, month, apiKey) {
  const { start, end } = jstMonthRange(month);
  const sessions = await listAll(
    '/checkout/sessions',
    [
      ['payment_link', paymentLinkId],
      ['created[gte]', start],
      ['created[lt]', end],
      ['expand[]', 'data.payment_intent.latest_charge.balance_transaction'],
    ],
    apiKey
  );
  let sum = 0;
  for (const session of sessions) sum += netYenOf(await expandSession(session, apiKey));
  return sum;
}

/** JSON を更新する。変わったら true */
export async function updateSupportFinances({ path, apiKey, now = new Date(), netYenFor }) {
  const data = JSON.parse(await readFile(path, 'utf8'));
  if (!data.paymentUrl) {
    console.log('paymentUrl が未設定なので何もしない');
    return false;
  }
  const resolveNet =
    netYenFor ??
    (await (async () => {
      const paymentLinkId = await findPaymentLinkId(data.paymentUrl, apiKey);
      return (month) => netYenForMonth(paymentLinkId, month, apiKey);
    })());
  let isChanged = false;
  for (const row of data.months) {
    const supportYen = await resolveNet(row.month);
    console.log(`${row.month}: ${row.supportYen} → ${supportYen}`);
    if (row.supportYen !== supportYen) {
      row.supportYen = supportYen;
      isChanged = true;
    }
  }
  if (!isChanged) return false;
  data.updatedAt = jstDate(now);
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apiKey = process.env.STRIPE_API_KEY;
  if (!apiKey) throw new Error('STRIPE_API_KEY is required');
  if (!apiKey.startsWith('rk_')) throw new Error('読み取り専用の制限付きキー (rk_...) を使う');
  const path = fileURLToPath(new URL('../support-finances.json', import.meta.url));
  try {
    const isChanged = await updateSupportFinances({ path, apiKey });
    console.log(isChanged ? 'updated' : 'unchanged');
  } catch (error) {
    // 保留中は失敗にしない (= 書き込まずに終わり、次の実行で数え直す)
    if (!(error instanceof PendingBalanceError)) throw error;
    console.log(`pending: ${error.message}`);
  }
}
