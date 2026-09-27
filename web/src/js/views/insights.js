import { $, esc } from '../core/util.js';
import { money } from '../core/money.js';
import { thisMonth, addMonths, fmtMonth, daysInMonth, todayKey, weekdayShort, fmtShortDate } from '../core/dates.js';
import { store, monthStats, trend, category, account, activeAccounts, monthsWithData } from '../core/store.js';
import { haptic } from '../core/native.js';
import { icon } from '../ui/icons.js';
import { donut, bars, pairBars } from '../ui/charts.js';
import { catRGB, METHOD, txRow, emptyState, acctRGB } from './common.js';

export const IS = { mk: thisMonth() };

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const chartW = () => Math.max(240, Math.min(560, innerWidth - 32) - 36);

function smartInsights(mk, ms) {
  const out = [];
  const isNow = mk === thisMonth();
  const dim = daysInMonth(mk);
  const dayN = isNow ? +todayKey().slice(8) : dim;
  const pm = monthStats(addMonths(mk, -1));
  const prevLabel = fmtMonth(addMonths(mk, -1), { year: false });

  if (ms.expense && pm.expense) {
    const prevSame = isNow ? pm.byDay.slice(0, dayN).reduce((s, v) => s + v, 0) : pm.expense;
    if (prevSame) {
      const ch = Math.round(((ms.expense - prevSame) / prevSame) * 100);
      if (Math.abs(ch) >= 5) out.push(ch < 0
        ? ['🎉', `You’ve spent <b>${Math.abs(ch)}% less</b> than ${isNow ? 'this point in ' : ''}${esc(prevLabel)}. Nice.`]
        : ['📈', `Spending is <b>${ch}% higher</b> than ${isNow ? 'this point in ' : ''}${esc(prevLabel)}.`]);
    }
  }
  const top = [...ms.byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && ms.expense) {
    const c = category(top[0]);
    out.push([c?.emoji || '🏷️', `<b>${esc(c?.name || 'Other')}</b> is your top category — <b>${pct(top[1], ms.expense)}%</b> of spending (${esc(money(top[1]))}).`]);
  }
  if (isNow && ms.expense && dayN >= 5 && dayN < dim) {
    const proj = Math.round((ms.expense / dayN) * dim);
    out.push(['🔮', `At this pace you’ll spend about <b>${esc(money(proj, { decimals: 'never' }))}</b> by month-end${store.settings.budget ? ` (${proj > store.settings.budget ? 'over' : 'within'} your ${esc(money(store.settings.budget, { decimals: 'never' }))} budget)` : ''}.`]);
  }
  // weekends vs weekdays (per-day averages of everyday spending — fixed bills excluded)
  const FIXED = new Set(['rent', 'emi', 'bills', 'subscriptions', 'education']);
  let we = 0, wd = 0, weN = 0, wdN = 0;
  const [y, m] = mk.split('-').map(Number);
  const flex = new Array(dim).fill(0);
  for (const t of ms.txs) if (t.type === 'expense' && !FIXED.has(t.categoryId)) flex[+t.date.slice(8) - 1] += t.amount;
  for (let d = 1; d <= dayN; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow === 0 || dow === 6) { we += flex[d - 1]; weN++; } else { wd += flex[d - 1]; wdN++; }
  }
  if (weN >= 2 && wdN >= 4 && we && wd) {
    const r = (we / weN) / (wd / wdN);
    if (r > 1.4) out.push(['🛋️', `Weekends cost you <b>${r.toFixed(1)}×</b> more per day than weekdays.`]);
    else if (r < 0.7) out.push(['🧘', `You spend less on weekends — about <b>${Math.round((1 - r) * 100)}%</b> less per day than weekdays.`]);
  }
  const noSpend = ms.byDay.slice(0, dayN).filter(v => v === 0).length;
  if (noSpend >= 3) out.push(['🌱', `<b>${noSpend} no-spend day${noSpend > 1 ? 's' : ''}</b> this month. Every one counts.`]);
  if (ms.expense && ms.byMethod.card / ms.expense > 0.35) out.push(['💳', `<b>${pct(ms.byMethod.card, ms.expense)}%</b> of spending went on credit cards — pay the full bill to avoid interest.`]);
  if (ms.income && ms.expense < ms.income) out.push(['🏦', `You saved <b>${pct(ms.income - ms.expense, ms.income)}%</b> of your income${isNow ? ' so far' : ''}.`]);
  if (ms.biggest) out.push(['🧾', `Biggest single expense: <b>${esc(money(ms.biggest.amount))}</b> — ${esc(ms.biggest.note || category(ms.biggest.categoryId)?.name || '')} on ${esc(fmtShortDate(ms.biggest.date))}.`]);
  return out.slice(0, 5);
}

export function renderInsights(root) {
  const mk = IS.mk;
  const ms = monthStats(mk);
  const isNow = mk === thisMonth();
  const hasAny = ms.txs.length > 0;
  const oldest = monthsWithData().slice(-1)[0] || mk;
  const canPrev = mk > oldest || mk > addMonths(thisMonth(), -24);
  const dim = daysInMonth(mk);
  const dayN = isNow ? +todayKey().slice(8) : dim;
  const avg = dayN ? Math.round(ms.expense / dayN) : 0;
  const saveRate = ms.income ? Math.round(((ms.income - ms.expense) / ms.income) * 100) : null;

  // categories
  const cats = [...ms.byCat.entries()].sort((a, b) => b[1] - a[1]);
  const topN = cats.slice(0, 5);
  const rest = cats.slice(5).reduce((s, [, v]) => s + v, 0);
  const segs = topN.map(([id, v]) => { const c = category(id); return { value: v, color: c?.color || '#7E8A80', label: c?.name, id }; });
  if (rest) segs.push({ value: rest, color: '#7E8A80', label: 'Other', id: null });

  // methods
  const acctRows = [...ms.byAcct.entries()].sort((a, b) => b[1] - a[1]);

  // daily chart
  const w = chartW();
  const labels = [0, 6, 13, 20, dim - 1].map(i => ({ i, text: String(i + 1) }));
  const tr = trend(mk, 6).map(t => ({ label: fmtMonth(t.mk, { short: true, year: false }), a: t.income, b: t.expense, current: t.mk === mk }));
  const top5 = ms.txs.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5);
  const ins = smartInsights(mk, ms);

  root.innerHTML = `
  <div class="scroller" data-scroller>
    <div class="page enter">
      <header class="lt" style="--n:0"><div><span class="eyebrow">Where your money goes</span><h1>Insights</h1></div></header>
      <div class="monthnav glass" style="--n:1">
        <button class="icon-btn sm press" data-act="prev" ${canPrev ? '' : 'disabled style="opacity:.3"'} aria-label="Previous month">${icon('chev-l')}</button>
        <div class="m">${esc(fmtMonth(mk))}<small>${isNow ? `Day ${dayN} of ${dim}` : `${ms.txs.length} transactions`}</small></div>
        <button class="icon-btn sm press" data-act="next" ${isNow ? 'disabled style="opacity:.3"' : ''} aria-label="Next month">${icon('chev-r')}</button>
      </div>
      ${!hasAny ? `<div class="glass" style="border-radius:var(--r-lg);margin-top:14px;--n:2">${emptyState({ emoji: '📊', title: `No data for ${fmtMonth(mk, { year: false })}`, text: 'Log a few transactions and your charts, patterns and tips will appear here.' })}</div>` : `
      <div class="quad" style="margin-top:14px;--n:2">
        <div class="card glass"><div class="caps">Income</div><div class="t-title3 amt pos" style="margin-top:6px">${esc(money(ms.income))}</div></div>
        <div class="card glass"><div class="caps">Spent</div><div class="t-title3 amt" style="margin-top:6px">${esc(money(ms.expense))}</div></div>
        <div class="card glass"><div class="caps">Net</div><div class="t-title3 amt ${ms.net < 0 ? 'neg' : 'pos'}" style="margin-top:6px">${esc(money(ms.net, { sign: 'always' }))}</div></div>
        <div class="card glass"><div class="caps">${saveRate == null ? 'Daily avg' : 'Saved'}</div><div class="t-title3 amt" style="margin-top:6px">${saveRate == null ? esc(money(avg, { decimals: 'never' })) : `${saveRate}%`}</div></div>
      </div>

      ${ins.length ? `<div class="section" style="--n:3"><div class="section-h"><h2>Highlights</h2></div><div class="insight-list">${ins.map(([e, t]) => `<div class="insight glass"><span class="e">${esc(e)}</span><p>${t}</p></div>`).join('')}</div></div>` : ''}

      ${ms.expense ? `
      <div class="section" style="--n:4">
        <div class="card glass">
          <div class="card-h"><h3>Spending by category</h3><span class="t3">${cats.length} categories</span></div>
          <div class="donut-wrap">
            ${donut(segs, { center: `<b class="amt">${esc(money(ms.expense, { compact: true, decimals: 'never' }))}</b><small>spent</small>` })}
            <div class="legend">${segs.map(s => `<button data-cat="${esc(s.id || '')}" style="--c:${catRGB({ color: s.color })}"><span class="sw"></span><span class="nm">${esc(s.label || 'Other')}</span><span class="pc">${pct(s.value, ms.expense)}%</span></button>`).join('')}</div>
          </div>
          <div class="catlist">
            ${cats.map(([id, v]) => {
              const c = category(id);
              const b = c?.budget;
              const ratio = b ? v / b : v / cats[0][1];
              const tone = b ? (ratio > 1 ? 'var(--neg-rgb)' : ratio > 0.85 ? 'var(--warn-rgb)' : 'var(--pos-rgb)') : catRGB(c);
              return `<button class="catrow" data-cat="${esc(id)}">
                <span class="ebadge sm" style="--c:${catRGB(c)}">${esc(c?.emoji || '🏷️')}</span>
                <div class="grow"><div class="top"><span class="ellip">${esc(c?.name || 'Other')}</span><span class="num amt">${esc(money(v))}</span></div>
                <div class="bar" style="--c:${tone}"><i style="--v:${Math.min(1, ratio).toFixed(3)}"></i></div>
                <div class="foot"><span>${pct(v, ms.expense)}% of spending</span><span class="amt">${b ? `${ratio > 1 ? 'over by ' + esc(money(v - b)) : esc(money(b - v)) + ' left'}` : ''}</span></div></div>
              </button>`;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="section" style="--n:5">
        <div class="card glass">
          <div class="card-h"><h3>Paid with</h3><span class="t3">${esc(money(ms.expense))}</span></div>
          <div class="stackbar">${['cash', 'upi', 'card'].filter(k => ms.byMethod[k]).map((k, i) => `<i style="--v:${ms.byMethod[k]};--c:${METHOD[k].rgb};--i:${i}"></i>`).join('')}</div>
          <div class="method-rows">
            ${acctRows.map(([id, v]) => {
              const a = account(id);
              return `<div class="method-row"><span class="mglyph" style="--c:${acctRGB(a)}">${icon(METHOD[a?.type]?.icon || 'wallet')}</span><span class="name ellip">${esc(a?.name || '?')}<small>${esc(METHOD[a?.type]?.label || '')}</small></span><span class="v amt">${esc(money(v))}<small>${pct(v, ms.expense)}%</small></span></div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="section" style="--n:6">
        <div class="card glass">
          <div class="card-h"><h3>Daily spending</h3><span class="t3">avg ${esc(money(avg, { decimals: 'never' }))}/day</span></div>
          <div class="chart" id="daily-chart">
            <div class="chart-tip glass-strong" id="daily-tip"></div>
            ${bars(ms.byDay, { w, h: 150, highlight: isNow ? dayN - 1 : ms.byDay.indexOf(Math.max(...ms.byDay)), avg, labels, color: 'var(--accent-rgb)', dim: isNow ? dayN - 1 : null })}
          </div>
        </div>
      </div>` : ''}

      <div class="section" style="--n:7">
        <div class="card glass">
          <div class="card-h"><h3>6-month trend</h3><span class="legend-inline"><span><i style="--c:var(--pos-rgb)"></i>In</span><span><i style="--c:var(--spend-rgb)"></i>Out</span></span></div>
          <div class="chart">${pairBars(tr, { w, h: 160 })}</div>
        </div>
      </div>

      ${top5.length ? `<div class="section" style="--n:8"><div class="section-h"><h2>Biggest expenses</h2></div><div class="glass group tx-list">${top5.map(t => txRow(t, { sub: fmtShortDate(t.date) })).join('')}</div></div>` : ''}
      `}
    </div>
  </div>
  <div class="topbar"><div class="topbar-title">${esc(fmtMonth(mk, { short: true }))}</div></div>`;

  root._ms = ms;
}

export function bindInsights(root, { rerender, showCategory }) {
  root.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'prev') { IS.mk = addMonths(IS.mk, -1); haptic('selection'); return rerender(); }
    if (act === 'next') { if (IS.mk < thisMonth()) { IS.mk = addMonths(IS.mk, 1); haptic('selection'); rerender(); } return; }
    const cat = e.target.closest('[data-cat]');
    if (cat && cat.dataset.cat) return showCategory(cat.dataset.cat, IS.mk);
  });
  // scrub the daily chart: drag across bars → live tooltip + haptic ticks
  let scrub = null;
  const showBar = (svg, clientX) => {
    const box = svg.getBoundingClientRect();
    const n = root._ms?.byDay.length || 30;
    const i = Math.max(0, Math.min(n - 1, Math.floor(((clientX - box.left) / box.width) * n)));
    if (scrub && scrub.i === i) return;
    if (scrub) scrub.i = i;
    const tip = $('#daily-tip', root);
    const v = root._ms?.byDay[i] || 0;
    const [yy, mm] = IS.mk.split('-').map(Number);
    tip.innerHTML = `${esc(weekdayShort(new Date(yy, mm - 1, i + 1).getDay()))} ${i + 1} · <span class="amt">${esc(money(v))}</span>`;
    tip.style.left = `${((i + 0.5) / n) * box.width}px`;
    tip.classList.add('on');
    svg.querySelectorAll('.bar-r').forEach(r => r.classList.toggle('scrub', +r.dataset.i === i));
    haptic('selection');
  };
  root.addEventListener('pointerdown', e => {
    const svg = e.target.closest('#daily-chart')?.querySelector('svg');
    if (!svg) return;
    scrub = { i: -1, svg };
    showBar(svg, e.clientX);
  });
  root.addEventListener('pointermove', e => { if (scrub) showBar(scrub.svg, e.clientX); });
  const endScrub = () => {
    if (!scrub) return;
    const { svg } = scrub;
    scrub = null;
    const tip = $('#daily-tip', root);
    clearTimeout(tip._t);
    tip._t = setTimeout(() => { tip.classList.remove('on'); svg.querySelectorAll('.bar-r.scrub').forEach(r => r.classList.remove('scrub')); }, 1600);
  };
  root.addEventListener('pointerup', endScrub);
  root.addEventListener('pointercancel', endScrub);

  // swipe the month capsule
  let sx = null;
  root.addEventListener('touchstart', e => { if (e.target.closest('.monthnav')) sx = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    sx = null;
    if (Math.abs(dx) < 40) return;
    if (dx > 0) IS.mk = addMonths(IS.mk, -1);
    else if (IS.mk < thisMonth()) IS.mk = addMonths(IS.mk, 1);
    else return;
    haptic('selection');
    rerender();
  });
}

export { activeAccounts };
