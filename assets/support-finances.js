(async () => {
  const byId = (id) => document.getElementById(id);
  const money = (n) => `${n.toLocaleString('ja-JP')}円`;
  const yearMonth = (m) => { const [y, mo] = m.split('-'); return `${y}年${Number(mo)}月`; };
  const date = (d) => { const [y, mo, da] = d.split('-'); return `${y}年${Number(mo)}月${Number(da)}日`; };
  const isYen = (n) => Number.isSafeInteger(n) && n >= 0;
  const KEYS = ['supportYen', 'actualExpenseYen', 'estimatedExpenseYen'];
  // 実費の内訳は無くてもよい。あれば全件が正しく、合計が実費と一致する (= 内訳と合計を食い違わせない)
  const hasValidItems = (items, actualExpenseYen) => {
    if (items === undefined) return true;
    if (!Array.isArray(items)) return false;
    const isItem = (item) => item && typeof item.label === 'string' && item.label.length > 0 && (item.detail === undefined || typeof item.detail === 'string') && isYen(item.yen);
    return items.every(isItem) && items.reduce((sum, item) => sum + item.yen, 0) === actualExpenseYen;
  };
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
    const STRIPE_PAYMENT_URL = /^https:\/\/(buy|donate)\.stripe\.com\/[A-Za-z0-9_-]+$/;
    if (data.paymentUrl && !STRIPE_PAYMENT_URL.test(data.paymentUrl)) throw new Error('invalid payment url');
    // 毎月の応援 (任意)。金額ごとの決済リンクと、解約・変更のためのカスタマーポータル
    const monthly = data.monthlyPayments ?? [];
    if (!Array.isArray(monthly) || !monthly.every((m) => m && Number.isSafeInteger(m.yen) && m.yen > 0 && typeof m.url === 'string' && STRIPE_PAYMENT_URL.test(m.url))) throw new Error('invalid monthly payments');
    if (!(data.supportStartMonth === undefined || data.supportStartMonth === null || (typeof data.supportStartMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(data.supportStartMonth)))) throw new Error('invalid support start month');
    if (!(data.portalUrl === undefined || data.portalUrl === null || (typeof data.portalUrl === 'string' && /^https:\/\/billing\.stripe\.com\/p\/login\/[A-Za-z0-9_]+$/.test(data.portalUrl)))) throw new Error('invalid portal url');
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
  const supportStartMonth = data.supportStartMonth ?? null;
  if (supportStartMonth) {
    byId('support-start-note').textContent = `応援の受付は ${yearMonth(supportStartMonth)}から始めました。それより前の運営費は開発者が負担しています。`;
    byId('support-start-note').hidden = false;
  }
  // 解約の入口が無いまま毎月の応援は出さない
  const monthly = data.monthlyPayments ?? [];
  if (monthly.length && data.portalUrl) {
    for (const { yen, url } of monthly) {
      const link = document.createElement('a');
      link.className = 'btn btn--outline';
      link.href = url;
      link.textContent = `月 ${money(yen)}`;
      byId('support-monthly-links').append(link);
    }
    byId('support-portal').href = data.portalUrl;
    byId('support-monthly').hidden = false;
  }
  if (!data.months.length) { byId('finance-status').textContent = '収支の公開は準備中です。'; return; }
  const seen = new Set();
  const total = { supportYen: 0, actualExpenseYen: 0, estimatedExpenseYen: 0 };
  const isValid = data.months.every((row) => {
    if (!row || typeof row.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) || seen.has(row.month) || !KEYS.every((key) => isYen(row[key]))) return false;
    if (!hasValidItems(row.items, row.actualExpenseYen)) return false;
    seen.add(row.month);
    for (const key of KEYS) total[key] += row[key];
    return Object.values(total).every(Number.isSafeInteger) && Number.isSafeInteger(total.actualExpenseYen + total.estimatedExpenseYen);
  }) && (data.updatedAt === null || /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(data.updatedAt));
  if (!isValid) { byId('finance-status').textContent = '収支を表示できませんでした。公開データを確認しています。'; return; }
  // 概算があるときだけ「運営費は実費と概算の合計」と書く (= 「AI 代は 0 円」と読ませない)
  if (total.estimatedExpenseYen > 0) byId('finance-estimated-note').hidden = false;
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
  // 月ごとの表
  const cell = (tag, text, className) => {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    if (tag === 'th') el.setAttribute('scope', 'row');
    return el;
  };
  // 応援の受付開始前の月は、割合ではなく「開発者が負担」と出す
  const percentText = (row) => {
    if (supportStartMonth !== null && row.month < supportStartMonth) return '開発者が負担';
    const { percent } = coverageOf(row);
    return percent === null ? '—' : pct(percent);
  };
  for (const row of sorted) {
    const tr = document.createElement('tr');
    tr.append(
      cell('th', yearMonth(row.month)),
      cell('td', money(coverageOf(row).expenseYen), 'num'),
      cell('td', money(row.supportYen), 'num'),
      cell('td', percentText(row), 'num')
    );
    byId('finance-rows').append(tr);
  }
  // 合計 (一番古い月から)
  const totalRow = document.createElement('tr');
  const totalExpense = total.actualExpenseYen + total.estimatedExpenseYen;
  const totalCoverage = coverageOf({ supportYen: total.supportYen, actualExpenseYen: totalExpense, estimatedExpenseYen: 0 });
  totalRow.append(
    cell('th', `${yearMonth(sorted.at(-1).month)}からの合計`),
    cell('td', money(totalExpense), 'num'),
    cell('td', money(total.supportYen), 'num'),
    cell('td', totalCoverage.percent === null ? '—' : pct(totalCoverage.percent), 'num')
  );
  byId('finance-total-row').append(totalRow);
  // 月ごとの内訳は折りたたむ (= 表を主にする)
  for (const row of sorted) {
    if (!row.items?.length) continue;
    const details = document.createElement('details');
    details.className = 'finance-detail';
    const summary = document.createElement('summary');
    summary.textContent = `${yearMonth(row.month)}の内訳（運営費 ${money(coverageOf(row).expenseYen)}）`;
    const list = document.createElement('ul');
    list.className = 'finance-detail__items';
    for (const expense of row.items) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = expense.detail ? `${expense.label}（${expense.detail}）` : expense.label;
      const yen = document.createElement('span');
      yen.textContent = money(expense.yen);
      li.append(name, yen);
      list.append(li);
    }
    details.append(summary, list);
    byId('finance-details').append(details);
  }
  byId('finance-updated').textContent = data.updatedAt ? `更新日 ${date(data.updatedAt)}` : '';
  byId('finance-status').hidden = true;
  byId('finance-content').hidden = false;
})();
