(async () => {
  const byId = (id) => document.getElementById(id);
  const money = (n) => `${n.toLocaleString('ja-JP')}円`;
  const yearMonth = (m) => { const [y, mo] = m.split('-'); return `${y}年${Number(mo)}月`; };
  const date = (d) => { const [y, mo, da] = d.split('-'); return `${y}年${Number(mo)}月${Number(da)}日`; };
  const isYen = (n) => Number.isSafeInteger(n) && n >= 0;
  const KEYS = ['supportYen', 'actualExpenseYen', 'estimatedExpenseYen'];
  // 運営費 (実費 + 概算) のうち応援でまかなえた割合。運営費 0 円なら percent は null
  const coverageOf = (row) => {
    const expenseYen = row.actualExpenseYen + row.estimatedExpenseYen;
    const remainingYen = Math.max(expenseYen - row.supportYen, 0);
    if (expenseYen === 0) return { percent: null, barPercent: 0, expenseYen, remainingYen };
    // 小数第 1 位まで切り捨て (= 少額の応援でも数字が動く)
    const percent = Math.floor((row.supportYen * 1000) / expenseYen) / 10;
    return { percent, barPercent: Math.min(percent, 100), expenseYen, remainingYen };
  };
  // 運営費が 0 円の月は「まかなえた」と言わない (= 応援 0 円でも達成に読める)
  const pct = (n) => `${n.toFixed(1)}%`;
  const coverageMessage = ({ percent, remainingYen }, label) => {
    if (percent === null) return `${label}の運営費はありません。`;
    if (remainingYen > 0) return `あと ${money(remainingYen)} で${label}の運営費に届きます。`;
    return `${label}の運営費は応援でまかなえています。`;
  };
  const setBar = (bar, fill, barPercent) => {
    fill.style.width = `${barPercent}%`;
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(barPercent));
  };
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
  // 概算が無い (= 0 円) ときは行ごと出さない (= 「AI 代は 0 円」と読ませない)
  if (total.estimatedExpenseYen > 0) {
    byId('finance-estimated').textContent = money(total.estimatedExpenseYen);
    byId('finance-estimated-row').hidden = false;
    byId('finance-estimated-note').hidden = false;
  }
  const balance = total.supportYen - total.actualExpenseYen - total.estimatedExpenseYen;
  byId('finance-balance').textContent = balance < 0 ? `${money(-balance)}の赤字` : money(balance);
  const sorted = [...data.months].sort((a, b) => b.month.localeCompare(a.month));
  // 最新の月は、運営費のうち応援でまかなえた割合を大きく出す
  const latest = sorted[0];
  const latestCoverage = coverageOf(latest);
  const latestLabel = yearMonth(latest.month);
  byId('coverage-label').textContent = `${latestLabel}の運営費のうち、応援でまかなえた割合`;
  byId('coverage-percent').textContent = latestCoverage.percent === null ? '' : pct(latestCoverage.percent);
  setBar(byId('coverage-bar'), byId('coverage-fill'), latestCoverage.barPercent);
  byId('coverage-amounts').textContent = `応援金 ${money(latest.supportYen)} ／ 運営費 ${money(latestCoverage.expenseYen)}`;
  byId('coverage-remaining').textContent = coverageMessage(latestCoverage, latestLabel);
  byId('coverage').hidden = false;
  // 月ごとの一覧 (= 合計の内訳。最新の月も含める) は細い棒で並べる
  for (const row of sorted) {
    const coverage = coverageOf(row);
    const item = document.createElement('div');
    item.className = 'past-month';
    const head = document.createElement('p');
    head.className = 'past-month__head';
    const monthLabel = document.createElement('span');
    monthLabel.textContent = yearMonth(row.month);
    const percentLabel = document.createElement('span');
    percentLabel.textContent = coverage.percent === null ? '—' : pct(coverage.percent);
    head.append(monthLabel, percentLabel);
    const bar = document.createElement('div');
    bar.className = 'coverage__bar coverage__bar--thin';
    const fill = document.createElement('span');
    fill.className = 'coverage__fill';
    bar.append(fill);
    setBar(bar, fill, coverage.barPercent);
    const amounts = document.createElement('p');
    amounts.className = 'past-month__amounts';
    amounts.textContent = `応援金 ${money(row.supportYen)} ／ 運営費 ${money(coverage.expenseYen)}`;
    item.append(head, bar, amounts);
    byId('finance-months').append(item);
  }
  byId('finance-updated').textContent = data.updatedAt ? `更新日 ${date(data.updatedAt)}` : '';
  byId('finance-status').hidden = true;
  byId('finance-content').hidden = false;
})();
