import { $, esc, initials } from '../core/util.js';
import { money } from '../core/money.js';
import { thisMonth, addMonths, daysInMonth, todayKey, greeting, fmtMonth, fmtDay } from '../core/dates.js';
import { store, totals, monthStats, balanceSeries, upcoming, account, category, activeAccounts, presetList, resolvePreset } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { sparkArea, ring } from '../ui/charts.js';
import { odometer } from '../ui/odometer.js';
import { txRow, acctGlyph, catRGB, METHOD, emptyState } from './common.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function change(curr, prev) {
  if (!prev) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

export function renderHome(root) {
  const s = store.settings;
  const T = totals();
  const mk = thisMonth();
  const ms = monthStats(mk);
  const pm = monthStats(addMonths(mk, -1));
  const series = balanceSeries(30);
  const ups = upcoming().slice(0, 3);
  const recent = store.txs.slice(0, 6);
  const first = (s.name || '').trim().split(/\s+/)[0];
  const today = todayKey();
  const dim = daysInMonth(mk);
  const dayN = +today.slice(8);
  const upis = activeAccounts().filter(a => a.type === 'upi' || a.type === 'bank');
  const cards = activeAccounts().filter(a => a.type === 'card');
  const upiLabel = upis.length === 1 ? upis[0].name : 'UPI & Bank';
  const priv = document.documentElement.dataset.private === 'true';
  const dateLine = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  // ---- month tiles
  const incCh = change(ms.income, pm.income);
  const expCh = change(ms.expense, pm.expense);
  const avgDay = dayN ? Math.round(ms.expense / dayN) : 0;

  // ---- budget
  let budgetHTML = '';
  if (s.budget > 0) {
    const used = ms.expense / s.budget;
    const expected = dayN / dim;
    const left = s.budget - ms.expense;
    const daysLeft = dim - dayN + 1;
    const tone = used > 1 ? 'var(--neg-rgb)' : used > expected * 1.08 ? 'var(--warn-rgb)' : 'var(--pos-rgb)';
    budgetHTML = `
      <button class="budget glass press-lg press" data-act="budget" style="--n:3;width:100%;text-align:left">
        ${ring(used, { color: tone, label: `${Math.min(999, Math.round(used * 100))}%` })}
        <div class="grow">
          <h3>${left >= 0 ? `<span class="amt">${esc(money(left))}</span> left this month` : `Over budget by <span class="amt">${esc(money(-left))}</span>`}</h3>
          <p>${left >= 0
            ? `You can spend about <b class="amt">${esc(money(Math.floor(left / daysLeft), { decimals: 'never' }))}</b>/day for the next ${daysLeft} day${daysLeft > 1 ? 's' : ''}.`
            : 'Time to slow down — every rupee from here adds to the overshoot.'.replace('rupee', s.currency === 'INR' ? 'rupee' : 'penny')}</p>
        </div>
        ${icon('chev-r', 'sm')}
      </button>`;
  } else if (store.txs.length > 3) {
    budgetHTML = `
      <button class="hint-add glass press-lg press" data-act="budget" style="--n:3;width:100%;text-align:left">
        <span class="mglyph" style="--c:var(--accent-rgb)">${icon('target')}</span>
        <div class="grow"><div class="t-headline">Set a monthly budget</div><div class="t-foot t2">Get a daily safe-to-spend number and pace alerts.</div></div>
        ${icon('chev-r', 'sm')}
      </button>`;
  }

  // ---- upcoming (card dues, recurring)
  const upsHTML = ups.map((u, i) => {
    if (u.kind === 'card') {
      const when = u.days === 0 ? 'due today' : u.days === 1 ? 'due tomorrow' : `due in ${u.days} days`;
      return `<div class="alert glass" style="--n:${4 + i}">
        ${acctGlyph(u.account)}
        <div class="main"><div class="title ellip">${esc(u.account.name)} bill</div><div class="meta"><span class="${u.days <= 2 ? 'neg' : ''}">${when}</span> · <span class="amt">${esc(money(u.amount))}</span></div></div>
        <button class="btn sm glass tint btn-primary press" data-act="pay-card" data-id="${esc(u.account.id)}">Pay</button>
      </div>`;
    }
    const c = category(u.r.categoryId);
    const when = u.days === 0 ? 'today' : u.days === 1 ? 'tomorrow' : `in ${u.days} days`;
    return `<button class="alert glass press-lg press" data-act="recurring" style="--n:${4 + i};width:100%;text-align:left">
      <span class="ebadge sm" style="--c:${catRGB(c)}">${esc(c?.emoji || '🔁')}</span>
      <div class="main"><div class="title ellip">${esc(u.r.note || c?.name || 'Recurring')}</div><div class="meta">Repeats ${when} · <span class="amt">${esc(money(u.amount))}</span></div></div>
      ${icon('repeat', 'sm')}
    </button>`;
  }).join('');

  // ---- spending by method
  const methodsTotal = ms.byMethod.cash + ms.byMethod.upi + ms.byMethod.card;
  const mrows = [
    ['cash', 'Cash', ms.byMethod.cash],
    ['upi', upis.length === 1 ? upis[0].name : 'GPay / UPI', ms.byMethod.upi],
    ['card', cards.length === 1 ? cards[0].name : 'Credit cards', ms.byMethod.card],
  ];
  const methodsHTML = methodsTotal ? `
    <section class="methods glass" style="--n:7">
      <div class="card-h" style="margin-bottom:10px"><h3>How you paid</h3><span class="t3 t-foot">${esc(fmtMonth(mk, { year: false }))}</span></div>
      <div class="stackbar">${mrows.filter(r => r[2] > 0).map(([k, , v], i) => `<i style="--v:${v};--c:${METHOD[k].rgb};--i:${i}"></i>`).join('')}</div>
      <div class="method-rows">
        ${mrows.map(([k, label, v]) => `
          <div class="method-row">
            <span class="mglyph" style="--c:${METHOD[k].rgb}">${icon(METHOD[k].icon)}</span>
            <span class="name ellip">${esc(label)}<small>${pct(v, methodsTotal)}% of spending</small></span>
            <span class="v amt">${esc(money(v))}</span>
          </div>`).join('')}
      </div>
    </section>` : '';

  // ---- quick add: user-defined one-tap buttons (long-press to edit)
  const presets = presetList();
  const quickHTML = `
    <div class="section" style="--n:8">
      <div class="section-h"><h2>Quick add</h2><button class="link" data-act="presets">Edit</button></div>
      <div class="chips quick" id="quick-row">
        ${presets.map(p => {
          const c = category(p.categoryId), r = resolvePreset(p), a = account(r.accountId);
          const glyph = p.type === 'transfer' ? icon('transfer') : esc(c?.emoji || '⚡');
          return `<button class="qchip glass press" data-act="quick" data-id="${esc(p.id)}" aria-label="Log ${esc(p.label)} ${esc(money(p.amount))}">
            <span class="e" style="--c:${p.type === 'transfer' ? 'var(--xfer-rgb)' : catRGB(c)}">${glyph}</span>
            <span><b class="amt">${esc(money(p.amount))}</b><small class="ellip" style="max-width:128px">${esc(p.label)} · ${esc(a?.name || '')}</small></span>
          </button>`;
        }).join('')}
        <button class="qchip qadd press" data-act="preset-new" aria-label="New quick button">${icon('plus')}</button>
      </div>
    </div>`;

  // ---- recent
  const recentHTML = recent.length ? `
    <div class="section" style="--n:9">
      <div class="section-h"><h2>Recent</h2><button class="link" data-act="see-all">See all</button></div>
      <div class="glass group tx-list" id="home-recent">${recent.map(t => txRow(t, { sub: fmtDay(t.date) })).join('')}</div>
    </div>` : `
    <div class="section" style="--n:9">
      <div class="glass" style="border-radius:var(--r-lg)">${emptyState({ emoji: '🪙', title: 'No transactions yet', text: 'Tap the + button to log your first expense — cash, GPay or card. It takes two seconds.', action: 'Add transaction', act: 'add' })}</div>
    </div>`;

  root.innerHTML = `
  <div class="scroller" data-scroller>
    <div class="page enter">
      <header class="lt" style="--n:0">
        <div class="grow"><span class="eyebrow">${esc(dateLine)}</span><h1 class="ellip">${esc(greeting())}${first && first.length < 9 ? ', ' + esc(first) : ''}</h1></div>
        <div class="lt-actions">
          <button class="icon-btn glass press" data-act="privacy" aria-label="${priv ? 'Show' : 'Hide'} amounts">${icon(priv ? 'eye-off' : 'eye')}</button>
          <button class="avatar press" data-act="settings" aria-label="Settings">${esc(initials(s.name)) || icon('user')}</button>
        </div>
      </header>

      <section class="hero glass glass-glow tilt" style="--n:1">
        <div class="hero-top">
          <button class="hero-label" data-act="explain">${icon('wallet', 'sm')}<span>Total balance</span>${icon('info', 'xs')}</button>
          ${s.demo ? '<span class="badge" style="--c:var(--warn-rgb)">Sample data</span>' : ''}
        </div>
        <div class="hero-amount amt num ${T.net < 0 ? 'neg' : ''}" id="hero-amt"></div>
        <div class="hero-delta">
          <span class="badge amt" style="--c:${ms.net >= 0 ? 'var(--pos-rgb)' : 'var(--neg-rgb)'}">${icon(ms.net >= 0 ? 'trend-up' : 'trend-down')}${esc(money(ms.net, { sign: 'always' }))}</span>
          <span class="t-foot t2">net this month</span>
        </div>
        <div class="hero-spark">${sparkArea(series, { color: T.net < 0 ? 'var(--neg)' : 'var(--accent)' })}</div>
        <div class="hero-split">
          <button data-act="acct-type" data-type="cash" style="--c:var(--m-cash-rgb)"><span class="k"><i></i>Cash</span><span class="v amt ellip" style="display:block">${esc(money(T.cash))}</span></button>
          <button data-act="acct-type" data-type="upi" style="--c:var(--m-upi-rgb)"><span class="k ellip"><i></i>${esc(upiLabel)}</span><span class="v amt ellip" style="display:block">${esc(money(T.upi))}</span></button>
          <button data-act="acct-type" data-type="card" style="--c:var(--m-card-rgb)"><span class="k"><i></i>Card dues</span><span class="v amt ellip" style="display:block">${esc(T.cardDue ? money(-T.cardDue) : money(0))}</span></button>
        </div>
      </section>

      <div class="duo" style="--n:2;margin-top:14px">
        <button class="tile glass press" data-act="month-tile" data-type="income" style="text-align:left">
          <div class="tk"><span class="ic" style="--c:var(--pos-rgb)">${icon('in')}</span>Income</div>
          <div class="tv amt">${esc(money(ms.income))}</div>
          <div class="ts">${incCh == null ? (ms.incCount ? `${ms.incCount} this month` : 'Nothing yet') : incCh === 0 ? `Same as ${esc(fmtMonth(addMonths(mk, -1), { short: true, year: false }))}` : `${incCh > 0 ? '▲' : '▼'} ${Math.abs(incCh)}% vs ${esc(fmtMonth(addMonths(mk, -1), { short: true, year: false }))}`}</div>
        </button>
        <button class="tile glass press" data-act="month-tile" data-type="expense" style="text-align:left">
          <div class="tk"><span class="ic" style="--c:var(--spend-rgb)">${icon('out')}</span>Spent</div>
          <div class="tv amt">${esc(money(ms.expense))}</div>
          <div class="ts">${ms.expCount ? `${esc(money(avgDay, { decimals: 'never' }))}/day${expCh ? ` · ${expCh > 0 ? '▲' : '▼'} ${Math.abs(expCh)}%` : ''}` : 'Nothing yet'}</div>
        </button>
      </div>

      ${budgetHTML || upsHTML ? `<div class="stack" style="margin-top:14px">${budgetHTML}${upsHTML}</div>` : ''}
      ${methodsHTML ? `<div style="margin-top:14px">${methodsHTML}</div>` : ''}
      ${quickHTML}
      ${recentHTML}
    </div>
  </div>
  <div class="topbar"><div class="topbar-title">Home</div></div>`;

  odometer($('#hero-amt', root), money(T.net), 'hero');
}
