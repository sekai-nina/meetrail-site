(async () => {
  const byId = (id) => document.getElementById(id);
  const money = (n) => `${n.toLocaleString('ja-JP')}円`;
  try {
    const response = await fetch('support-finances.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('fetch failed');
    const data = await response.json();
    if (data.version !== 1 || !Array.isArray(data.months) || !(data.updatedAt === null || typeof data.updatedAt === 'string') || !(data.paymentUrl === null || typeof data.paymentUrl === 'string')) throw new Error('invalid data');
    if (data.paymentUrl && !/^https:\/\/(buy|donate)\.stripe\.com\/[A-Za-z0-9_-]+$/.test(data.paymentUrl)) throw new Error('invalid payment url');
    const seen = new Set();
    const total = { supportYen: 0, actualExpenseYen: 0, estimatedExpenseYen: 0 };
    for (const row of data.months) {
      if (!row || typeof row.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) || seen.has(row.month) || !Object.keys(total).every((key) => Number.isSafeInteger(row[key]) && row[key] >= 0)) throw new Error('invalid month');
      seen.add(row.month);
      for (const key of Object.keys(total)) total[key] += row[key];
      if (!Object.values(total).every(Number.isSafeInteger) || !Number.isSafeInteger(total.actualExpenseYen + total.estimatedExpenseYen)) throw new Error('invalid totals');
    }
    if (data.paymentUrl) {
      byId('support-payment').href = data.paymentUrl;
      byId('support-payment-wrap').hidden = false;
      byId('support-payment-status').textContent = 'いただいた応援金は、ミトレルの開発・運営に活用します。';
    }
    if (!data.months.length) { byId('finance-status').textContent = '収支の公開は準備中です。'; return; }
    byId('finance-support').textContent = money(total.supportYen);
    byId('finance-actual').textContent = money(total.actualExpenseYen);
    byId('finance-estimated').textContent = money(total.estimatedExpenseYen);
    const balance = total.supportYen - total.actualExpenseYen - total.estimatedExpenseYen;
    byId('finance-balance').textContent = balance < 0 ? `${money(-balance)}の赤字` : money(balance);
    for (const row of [...data.months].sort((a, b) => b.month.localeCompare(a.month))) {
      const item = document.createElement('p');
      item.textContent = `${row.month}：応援金 ${money(row.supportYen)} / 実費 ${money(row.actualExpenseYen)} / 概算 ${money(row.estimatedExpenseYen)}`;
      byId('finance-months').append(item);
    }
    byId('finance-updated').textContent = data.updatedAt ? `更新日 ${data.updatedAt}` : '';
    byId('finance-status').hidden = true;
    byId('finance-content').hidden = false;
  } catch {
    byId('support-payment-status').textContent = '応援金の受付状況を確認できませんでした。';
    byId('finance-status').textContent = '収支を読み込めませんでした。時間をおいてお試しください。';
  }
})();
