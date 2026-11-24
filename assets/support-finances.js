(async () => {
  const byId = (id) => document.getElementById(id);
  const money = (n) => `${n.toLocaleString('ja-JP')}円`;
  const yearMonth = (m) => { const [y, mo] = m.split('-'); return `${y}年${Number(mo)}月`; };
  const date = (d) => { const [y, mo, da] = d.split('-'); return `${y}年${Number(mo)}月${Number(da)}日`; };
  const isYen = (n) => Number.isSafeInteger(n) && n >= 0;
  const KEYS = ['supportYen', 'actualExpenseYen', 'estimatedExpenseYen'];
  let data;
  try {
    const response = await fetch('support-finances.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('fetch failed');
    data = await response.json();
    const isNullableString = (v) => v === null || typeof v === 'string';
    if (!data || data.version !== 1 || !Array.isArray(data.months) || !isNullableString(data.updatedAt) || !isNullableString(data.paymentUrl)) throw new Error('invalid data');
    if (data.paymentUrl && !/^https:\/\/(buy|donate)\.stripe\.com\/[A-Za-z0-9_-]+$/.test(data.paymentUrl)) throw new Error('invalid payment url');
  } catch {
    byId('support-payment-status').textContent = '応援金の受付状況を確認できませんでした。';
    byId('finance-status').textContent = '収支を読み込めませんでした。時間をおいてお試しください。';
    return;
  }
  // 決済リンクは収支と別に出す (= 収支の入力ミスで応援の受付まで止めない)
  if (data.paymentUrl) {
    byId('support-payment').href = data.paymentUrl;
    byId('support-payment-wrap').hidden = false;
    byId('support-payment-status').textContent = 'いただいた応援金は、ミトレルの開発・運営に活用します。';
  }
  if (!data.months.length) { byId('finance-status').textContent = '収支の公開は準備中です。'; return; }
  const seen = new Set();
  const total = { supportYen: 0, actualExpenseYen: 0, estimatedExpenseYen: 0 };
  const isValid = data.months.every((row) => {
    if (!row || typeof row.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) || seen.has(row.month) || !KEYS.every((key) => isYen(row[key]))) return false;
    seen.add(row.month);
    for (const key of KEYS) total[key] += row[key];
    return Object.values(total).every(Number.isSafeInteger) && Number.isSafeInteger(total.actualExpenseYen + total.estimatedExpenseYen);
  }) && (data.updatedAt === null || /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(data.updatedAt));
  if (!isValid) { byId('finance-status').textContent = '収支を表示できませんでした。公開データを確認しています。'; return; }
  byId('finance-support').textContent = money(total.supportYen);
  byId('finance-actual').textContent = money(total.actualExpenseYen);
  byId('finance-estimated').textContent = money(total.estimatedExpenseYen);
  const balance = total.supportYen - total.actualExpenseYen - total.estimatedExpenseYen;
  byId('finance-balance').textContent = balance < 0 ? `${money(-balance)}の赤字` : money(balance);
  for (const row of [...data.months].sort((a, b) => b.month.localeCompare(a.month))) {
    const item = document.createElement('p');
    item.textContent = `${yearMonth(row.month)}：応援金 ${money(row.supportYen)} / 実費 ${money(row.actualExpenseYen)} / 概算 ${money(row.estimatedExpenseYen)}`;
    byId('finance-months').append(item);
  }
  byId('finance-updated').textContent = data.updatedAt ? `更新日 ${date(data.updatedAt)}` : '';
  byId('finance-status').hidden = true;
  byId('finance-content').hidden = false;
})();
