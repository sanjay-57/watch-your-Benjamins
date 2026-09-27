// Management sheets: account detail/editor, categories, budgets, recurring, currency.
import { $, esc } from '../core/util.js';
import { money, parseAmount, toInput, cur, CURRENCIES, currencyName } from '../core/money.js';
import { fmtDay, ordinal, fmtShortDate, thisMonth, todayKey } from '../core/dates.js';
import {
  store, account, category, activeAccounts, balances, cardInfo, accountLedger, monthStats,
  addAccount, updateAccount, removeAccount, setBalance, addCategory, updateCategory, removeCategory,
  setSettings, updateRecurring, removeRecurring, deleteTx, restoreTx, CARD_THEMES, CARD_NETWORKS, LIGHT_CARDS, DOLLAR_COLORS,
} from '../core/store.js';
import { haptic } from '../core/native.js';
import { openSheet } from '../ui/sheet.js';
import { toast, confirmDialog } from '../ui/overlays.js';
import { icon } from '../ui/icons.js';
import { attachSwipe } from '../ui/swipe.js';
import { acctGlyph, acctSub, groupByDay, catRGB, txRow, emptyState, METHOD } from './common.js';

// lazy import to avoid a cycle (txsheet imports manage)
const tx = () => import('./txsheet.js');

// ---------------------------------------------------------------- credit card visual
export function ccardHTML(a, { big = false } = {}) {
  const ci = cardInfo(a);
  const [g1, g2, g3] = CARD_THEMES[a.theme] || CARD_THEMES.greenback;
  const light = LIGHT_CARDS.has(a.theme);
  const due = ci.daysToDue != null ? (ci.daysToDue === 0 ? 'Due today' : `Due ${fmtShortDate(ci.nextDue)}`) : '';
  return `<button class="ccard tilt press-lg press${light ? ' light' : ''}" data-act="acct" data-id="${esc(a.id)}" style="--g1:${g1};--g2:${g2};--g3:${g3}${light ? ';--cc-ink:#0f1a13' : ''}${big ? ';max-height:none' : ''}">
    <div class="cc-top"><span class="cc-name ellip">${esc(a.name)}</span><span class="cc-net">${esc(CARD_NETWORKS[a.network] || '')}</span></div>
    <div class="cc-chip"></div>
    <div class="cc-bottom">
      <div><div class="cc-k">${ci.due ? 'Outstanding' : 'All paid'}</div><div class="cc-v amt">${esc(money(ci.due))}</div></div>
      <div style="text-align:right"><div class="cc-k">${esc(due)}</div><div class="cc-num">${a.last4 ? '•••• ' + esc(a.last4) : ''}</div></div>
    </div>
    ${a.limit ? `<div class="cc-util"><i style="--v:${Math.min(1, ci.util).toFixed(3)}"></i></div>` : ''}
  </button>`;
}

/** Running balance label: cards show what's owed, other accounts show the balance. */
function runLabel(v, isCard) {
  if (!isCard) return 'Bal ' + money(v);
  if (v < 0) return 'Owe ' + money(-v);
  return v > 0 ? 'Credit ' + money(v) : 'Paid off';
}

// ---------------------------------------------------------------- account detail
export function openAccountDetail(id) {
  const a0 = account(id);
  if (!a0) return;
  const body = document.createElement('div');
  const sheet = openSheet({ title: a0.name, subtitle: acctSub(a0), content: body, size: 'full', onClose: () => unsub() });
  const unsub = store.subscribe(() => { if (account(id)) render(); else sheet.close(); });

  function render() {
    const a = account(id);
    const bal = balances().get(id) || 0;
    const ledger = accountLedger(id);
    const isCard = a.type === 'card';
    const ci = isCard ? cardInfo(a) : null;
    sheet.setTitle(a.name, acctSub(a));
    const top = isCard ? `
      <div style="margin:4px 2px 16px">${ccardHTML(a, { big: true })}</div>
      <div class="quad" style="margin-bottom:16px">
        <div class="card glass"><div class="caps">Outstanding</div><div class="t-title3 amt ${ci.due ? 'neg' : ''}" style="margin-top:6px">${esc(money(ci.due))}</div></div>
        <div class="card glass"><div class="caps">${a.limit ? 'Available' : 'Limit'}</div><div class="t-title3 amt" style="margin-top:6px">${a.limit ? esc(money(ci.available)) : '—'}</div></div>
        ${a.limit ? `<div class="card glass" style="grid-column:1/-1">
          <div class="row" style="justify-content:space-between"><span class="caps">Credit used</span><span class="t-foot ${ci.util > 0.3 ? 'warn' : 't2'}">${Math.round(ci.util * 100)}% of ${esc(money(a.limit, { decimals: 'never' }))}</span></div>
          <div class="bar" style="margin-top:10px;--c:${ci.util > 0.75 ? 'var(--neg-rgb)' : ci.util > 0.3 ? 'var(--warn-rgb)' : 'var(--pos-rgb)'}"><i style="--v:${Math.min(1, ci.util)}"></i></div>
          ${ci.util > 0.3 ? '<div class="t-foot t2" style="margin-top:8px">Tip: keeping usage under 30% helps your credit score.</div>' : ''}
        </div>` : ''}
      </div>` : `
      <div class="acct-hero"><span style="display:inline-block">${acctGlyph(a, 'lg')}</span><div class="t-foot t2" style="margin-top:10px">Current balance</div><div class="big amt ${bal < 0 ? 'neg' : ''}">${esc(money(bal))}</div></div>`;
    const actions = isCard
      ? [['pay', 'Pay bill', 'check-circle', 'var(--pos-rgb)'], ['spend', 'Add spend', 'out', 'var(--spend-rgb)'], ['edit', 'Edit card', 'edit', 'var(--accent-rgb)']]
      : [['spend', 'Spend', 'out', 'var(--spend-rgb)'], ['receive', 'Receive', 'in', 'var(--pos-rgb)'], ['adjust', 'Set balance', 'adjust', 'var(--accent-rgb)']];
    const groups = groupByDay(ledger.map(l => l.t));
    const afterById = new Map(ledger.map(l => [l.t.id, l.after]));
    body.innerHTML = `
      ${top}
      <div class="acct-actions">
        ${actions.map(([k, label, ic, c]) => `<button class="glass press" data-act="${k}"><span class="ic" style="--c:${c}">${icon(ic)}</span>${esc(label)}</button>`).join('')}
      </div>
      ${a.archived ? `<div class="alert glass" style="margin-bottom:14px"><span class="mglyph" style="--c:var(--warn-rgb)">${icon('info')}</span><div class="main"><div class="title">Archived</div><div class="meta">Hidden from pickers. Restore to use it again.</div></div><button class="btn sm btn-plain press" data-act="unarchive">Restore</button></div>` : ''}
      <div class="section-h" style="padding-top:4px"><h2>History</h2><span class="t3 t-foot">${ledger.length} entr${ledger.length === 1 ? 'y' : 'ies'}</span></div>
      <div class="tx-list" id="ledger">
        ${groups.length ? groups.slice(0, 60).map(g => `<div class="tx-day"><div class="tx-day-h"><span>${esc(fmtDay(g.date))}</span></div><div class="glass group">${g.items.map(t => txRow(t, { sub: runLabel(afterById.get(t.id), isCard) })).join('')}</div></div>`).join('')
        : `<div class="glass" style="border-radius:var(--r-lg)">${emptyState({ emoji: isCard ? '💳' : '🪙', title: 'Nothing here yet', text: isCard ? 'Card spends and bill payments will show up here.' : 'Transactions for this account will show up here.' })}</div>`}
      </div>
      <div class="glass group" style="margin-top:22px">
        <button class="cell" data-act="edit"><span class="cell-icon" style="--c:var(--accent-rgb)">${icon('edit')}</span><span class="label">Edit ${isCard ? 'card' : 'account'}</span>${icon('chev-r', 'chev')}</button>
        <button class="cell" data-act="transfer"><span class="cell-icon" style="--c:var(--xfer-rgb)">${icon('transfer')}</span><span class="label">Transfer money</span>${icon('chev-r', 'chev')}</button>
        ${isCard ? `<button class="cell" data-act="adjust"><span class="cell-icon" style="--c:var(--spend-rgb)">${icon('adjust')}</span><span class="label">Correct outstanding</span>${icon('chev-r', 'chev')}</button>` : ''}
        <button class="cell danger" data-act="remove"><span class="cell-icon" style="--c:var(--neg-rgb)">${icon('trash')}</span><span class="label">${ledger.length ? 'Archive' : 'Delete'} ${isCard ? 'card' : 'account'}</span></button>
      </div>`;
  }

  body.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = account(id);
    const act = b.dataset.act;
    const { openTxSheet } = await tx();
    if (act === 'open-tx') {
      const t = store.txs.find(x => x.id === b.dataset.id);
      if (t) openTxSheet({ tx: t });
    } else if (act === 'spend') openTxSheet({ preset: { type: 'expense', accountId: id } });
    else if (act === 'receive') openTxSheet({ preset: { type: 'income', accountId: id } });
    else if (act === 'transfer') openTxSheet({ preset: { type: 'transfer', accountId: a.type === 'card' ? undefined : id, toAccountId: a.type === 'card' ? id : undefined } });
    else if (act === 'pay') {
      const from = activeAccounts().find(x => x.type === 'upi') || activeAccounts().find(x => x.type === 'bank') || activeAccounts().find(x => x.type === 'cash');
      openTxSheet({ preset: { type: 'transfer', accountId: from?.id, toAccountId: id, amount: cardInfo(a).due, note: '' } });
    } else if (act === 'edit') openAccountEditor({ account: a });
    else if (act === 'adjust') openSetBalance(id);
    else if (act === 'unarchive') { updateAccount(id, { archived: false }); toast('Restored', { icon: 'check' }); }
    else if (act === 'remove') {
      const used = accountLedger(id).length > 0;
      const ok = await confirmDialog({
        title: used ? `Archive ${a.name}?` : `Delete ${a.name}?`,
        message: used ? 'It has history, so it will be hidden from pickers but its past transactions stay.' : 'This account has no transactions and will be removed.',
        confirm: used ? 'Archive' : 'Delete', destructive: true, icon: 'trash',
      });
      if (!ok) return;
      const r = removeAccount(id);
      haptic('success');
      toast(r === 'archived' ? 'Account archived' : 'Account deleted', { icon: 'trash', tone: 'neg' });
      if (r === 'deleted') sheet.close();
    }
  });

  attachSwipe(body, id2 => {
    const removed = deleteTx(id2);
    toast('Transaction deleted', { icon: 'trash', tone: 'neg', action: 'Undo', onAction: () => restoreTx(removed) });
  });
  render();
  return sheet;
}

// ---------------------------------------------------------------- set balance
export function openSetBalance(id) {
  const a = account(id);
  const bal = balances().get(id) || 0;
  const isCard = a.type === 'card';
  const shown = isCard ? Math.max(0, -bal) : bal;
  const sheet = openSheet({
    title: isCard ? 'Correct outstanding' : 'Set balance',
    subtitle: a.name,
    content: `
      <div class="form">
        <p class="t-sub t2">${isCard ? 'Enter what you currently owe on this card (check your card app or statement).' : 'Enter the actual amount you have right now.'} We’ll record the difference as an adjustment — it won’t count as income or spending.</p>
        <div><label class="field-label">${isCard ? 'Outstanding now' : 'Balance now'}</label>
        <label class="field"><span class="prefix">${esc(cur().symbol)}</span><input id="sb-v" inputmode="decimal" value="${esc(toInput(shown))}" placeholder="0"></label></div>
        <button class="btn block glass tint btn-primary press" data-act="save">Save</button>
      </div>`,
  });
  const input = $('#sb-v', sheet.body);
  setTimeout(() => input.focus(), 350);
  sheet.body.addEventListener('click', e => {
    if (!e.target.closest('[data-act="save"]')) return;
    const v = parseAmount(input.value);
    if (v == null) { haptic('error'); input.focus(); return; }
    const target = isCard ? -Math.abs(v) : v;
    const t = setBalance(id, target);
    haptic('success');
    sheet.close();
    toast(t ? 'Balance updated' : 'Already correct', { sub: `${a.name}: ${money(isCard ? Math.abs(target) : target)}${isCard ? ' owed' : ''}` });
  });
}

// ---------------------------------------------------------------- account editor
const NET_OPTS = [['visa', 'Visa'], ['mastercard', 'Mastercard'], ['rupay', 'RuPay'], ['amex', 'Amex'], ['other', 'Other']];

export function openAccountEditor({ account: a = null, type = 'card', onSave } = {}) {
  const editing = !!a;
  const st = {
    type: a?.type || type,
    name: a?.name || '',
    theme: a?.theme || Object.keys(CARD_THEMES)[Math.floor(Math.random() * 5)],
    network: a?.network || 'visa',
  };
  const body = document.createElement('div');
  const sheet = openSheet({ title: editing ? `Edit ${a.type === 'card' ? 'card' : 'account'}` : 'Add account', content: body });

  function render() {
    const isCard = st.type === 'card';
    const namePh = { card: 'e.g. HDFC Millennia', upi: 'e.g. GPay, PhonePe, Paytm', bank: 'e.g. SBI Savings', cash: 'e.g. Wallet cash' }[st.type];
    body.innerHTML = `<div class="form">
      ${editing ? '' : `<div class="seg" role="group" aria-label="Account type" id="ae-type" style="height:42px">
        <span class="seg-thumb"></span>
        ${[['card', 'Credit card'], ['upi', 'UPI'], ['bank', 'Bank'], ['cash', 'Cash']].map(([k, l]) => `<button data-type="${k}" aria-pressed="${st.type === k}">${l}</button>`).join('')}
      </div>`}
      <div><label class="field-label">Name</label><label class="field"><input id="ae-name" maxlength="40" placeholder="${esc(namePh)}" value="${esc(st.name)}"></label></div>
      ${isCard ? `
        <div class="form-row">
          <div><label class="field-label">Credit limit</label><label class="field"><span class="prefix">${esc(cur().symbol)}</span><input id="ae-limit" inputmode="decimal" placeholder="Optional" value="${esc(toInput(a?.limit))}"></label></div>
          <div><label class="field-label">Bill due day</label><label class="field"><select id="ae-due"><option value="0">Not set</option>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${a?.dueDay === i + 1 ? 'selected' : ''}>${ordinal(i + 1)}</option>`).join('')}</select></label></div>
        </div>
        ${editing ? '' : `<div><label class="field-label">Currently owed on this card</label><label class="field"><span class="prefix">${esc(cur().symbol)}</span><input id="ae-open" inputmode="decimal" placeholder="0"></label></div>`}
        <div><label class="field-label">Last 4 digits</label><label class="field"><span class="prefix">••••</span><input id="ae-last4" inputmode="numeric" maxlength="4" placeholder="Optional" value="${esc(a?.last4 || '')}"></label></div>
        <div><label class="field-label">Network</label><div class="chip-wrap">${NET_OPTS.map(([k, l]) => `<button class="chip" data-net="${k}" aria-pressed="${st.network === k}">${l}</button>`).join('')}</div></div>
        <div><label class="field-label">Card design</label><div class="design-grid">${Object.entries(CARD_THEMES).map(([k, [g1, g2, g3]]) => `<button class="press" data-card-theme="${k}" aria-label="${k} card design" aria-pressed="${st.theme === k}" style="background:radial-gradient(120% 120% at 0 0,${g1},transparent 60%),radial-gradient(120% 120% at 100% 100%,${g2},transparent 60%),radial-gradient(90% 90% at 100% 0,${g3},transparent 70%),#0b1510;box-shadow:${st.theme === k ? '0 0 0 2px var(--bg),0 0 0 4px var(--accent)' : 'inset 0 0 0 .5px rgba(255,255,250,.3)'}"></button>`).join('')}</div></div>
      ` : editing ? '' : `
        <div><label class="field-label">${st.type === 'cash' ? 'Cash in hand now' : 'Current balance'}</label><label class="field"><span class="prefix">${esc(cur().symbol)}</span><input id="ae-open" inputmode="decimal" placeholder="0"></label></div>`}
      <button class="btn block glass tint btn-primary press" data-act="save" style="margin-top:22px">${editing ? 'Save changes' : isCard ? 'Add card' : 'Add account'}</button>
    </div>`;
    const seg = $('#ae-type', body);
    if (seg) {
      const btn = seg.querySelector(`[data-type="${st.type}"]`);
      const th = seg.querySelector('.seg-thumb');
      requestAnimationFrame(() => { th.style.width = btn.offsetWidth + 'px'; th.style.transform = `translate3d(${btn.offsetLeft}px,0,0)`; });
    }
  }

  body.addEventListener('click', e => {
    const t = e.target.closest('[data-type]');
    if (t) { st.name = $('#ae-name', body).value; st.type = t.dataset.type; haptic('selection'); render(); return; }
    const n = e.target.closest('[data-net]');
    if (n) { st.network = n.dataset.net; body.querySelectorAll('[data-net]').forEach(b => b.setAttribute('aria-pressed', b === n)); haptic('selection'); return; }
    const th = e.target.closest('[data-card-theme]');
    if (th) { st.name = $('#ae-name', body).value; st.theme = th.dataset.cardTheme; haptic('selection'); render(); return; }
    if (!e.target.closest('[data-act="save"]')) return;
    const name = $('#ae-name', body).value.trim() || { card: 'Credit card', upi: 'GPay', bank: 'Bank', cash: 'Cash' }[st.type];
    const patch = { name, type: st.type };
    if (st.type === 'card') {
      patch.limit = parseAmount($('#ae-limit', body).value) || 0;
      patch.dueDay = +$('#ae-due', body).value || 0;
      patch.last4 = $('#ae-last4', body).value.replace(/\D/g, '').slice(0, 4);
      patch.network = st.network;
      patch.theme = st.theme;
    }
    const openEl = $('#ae-open', body);
    if (openEl) {
      const v = parseAmount(openEl.value) || 0;
      patch.opening = st.type === 'card' ? -Math.abs(v) : v;
    }
    let saved;
    if (editing) saved = updateAccount(a.id, patch);
    else saved = addAccount(patch);
    haptic('success');
    sheet.close();
    toast(editing ? 'Saved' : `${name} added`, { icon: st.type === 'card' ? 'card' : 'check' });
    onSave?.(saved);
  });
  body.addEventListener('input', e => { if (e.target.id === 'ae-last4') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
  render();
  return sheet;
}

// ---------------------------------------------------------------- categories
const EMOJIS = '🍔 🍕 ☕ 🍺 🍷 🍱 🛒 🥦 🚕 🚌 🚇 ⛽ 🚗 🛵 ✈️ 🏨 🏖️ 🛍️ 👕 👟 💄 💅 💈 💡 📱 💻 🌐 🏠 🔧 🧹 🧺 🎬 🎮 🎵 🎟️ 📚 🎓 🏥 💊 🏋️ ⚽ 🎁 💐 🐶 👶 🍼 💳 🏦 📈 💰 💼 🧾 🪙 🛡️ 🙏 ❤️ 🚬 📦 🏷️'.split(' ');
const COLORS = DOLLAR_COLORS;

export function openCategoryEditor({ category: c = null, kind = 'expense', onSave } = {}) {
  const editing = !!c;
  const st = { emoji: c?.emoji || '🏷️', color: c?.color || COLORS[Math.floor(Math.random() * 10)], kind: c?.kind || kind };
  const body = document.createElement('div');
  const sheet = openSheet({ title: editing ? 'Edit category' : 'New category', content: body });
  const render = () => {
    body.innerHTML = `<div class="form">
      <div style="display:grid;place-items:center;padding:6px 0 2px"><span class="ebadge lg" style="--c:${catRGB({ color: st.color })};width:74px;height:74px;font-size:38px;border-radius:24px" id="ce-prev">${esc(st.emoji)}</span></div>
      ${editing ? '' : `<div class="seg" id="ce-kind" style="height:40px"><span class="seg-thumb"></span><button data-kind="expense" aria-pressed="${st.kind === 'expense'}">Expense</button><button data-kind="income" aria-pressed="${st.kind === 'income'}">Income</button></div>`}
      <div><label class="field-label">Name</label><label class="field"><input id="ce-name" maxlength="32" placeholder="e.g. Coffee" value="${esc(c?.name || '')}"></label></div>
      <div><label class="field-label">Icon</label>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(42px,1fr));gap:6px">${EMOJIS.map(em => `<button class="press" data-emoji="${em}" style="height:42px;border-radius:12px;font-size:21px;background:${em === st.emoji ? 'rgb(var(--accent-rgb) / .25)' : 'var(--fill-3)'};box-shadow:${em === st.emoji ? 'inset 0 0 0 1.5px var(--accent)' : 'none'}">${em}</button>`).join('')}</div>
        <label class="field" style="margin-top:8px"><input id="ce-emoji" maxlength="8" placeholder="…or type any emoji" value=""></label>
      </div>
      <div><label class="field-label">Colour</label><div class="swatches" style="flex-wrap:wrap">${COLORS.map(col => `<button class="swatch" data-color="${col}" aria-pressed="${col === st.color}" style="--c:${catRGB({ color: col })}"></button>`).join('')}</div></div>
      ${st.kind === 'expense' ? `<div><label class="field-label">Monthly budget (optional)</label><label class="field"><span class="prefix">${esc(cur().symbol)}</span><input id="ce-budget" inputmode="decimal" placeholder="No limit" value="${esc(toInput(c?.budget))}"></label></div>` : ''}
      <button class="btn block glass tint btn-primary press" data-act="save">${editing ? 'Save' : 'Create category'}</button>
      ${editing && c.id !== 'other' && c.id !== 'other_in' ? `<button class="btn block btn-plain danger press" data-act="delete">Delete category</button>` : ''}
    </div>`;
    const seg = $('#ce-kind', body);
    if (seg) {
      const btn = seg.querySelector(`[data-kind="${st.kind}"]`);
      requestAnimationFrame(() => { const th = seg.querySelector('.seg-thumb'); th.style.width = btn.offsetWidth + 'px'; th.style.transform = `translate3d(${btn.offsetLeft}px,0,0)`; });
    }
  };
  body.addEventListener('click', async e => {
    const name = $('#ce-name', body)?.value;
    const em = e.target.closest('[data-emoji]');
    if (em) { st.emoji = em.dataset.emoji; haptic('selection'); render(); $('#ce-name', body).value = name; return; }
    const col = e.target.closest('[data-color]');
    if (col) { st.color = col.dataset.color; haptic('selection'); render(); $('#ce-name', body).value = name; return; }
    const k = e.target.closest('[data-kind]');
    if (k) { st.kind = k.dataset.kind; haptic('selection'); render(); $('#ce-name', body).value = name; return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'save') {
      const nm = (name || '').trim();
      if (!nm) { haptic('error'); $('#ce-name', body).focus(); return; }
      const budget = parseAmount($('#ce-budget', body)?.value) || 0;
      const saved = editing ? updateCategory(c.id, { name: nm, emoji: st.emoji, color: st.color, budget }) : addCategory({ name: nm, emoji: st.emoji, color: st.color, kind: st.kind, budget });
      haptic('success');
      sheet.close();
      toast(editing ? 'Category saved' : `${st.emoji} ${nm} created`);
      onSave?.(saved);
    } else if (act === 'delete') {
      const n = store.txs.filter(t => t.categoryId === c.id).length;
      const ok = await confirmDialog({ title: `Delete “${c.name}”?`, message: n ? `${n} transaction${n > 1 ? 's' : ''} will move to “Other”.` : 'This category isn’t used yet.', confirm: 'Delete', destructive: true, icon: 'trash' });
      if (!ok) return;
      removeCategory(c.id);
      sheet.close();
      toast('Category deleted', { icon: 'trash', tone: 'neg' });
    }
  });
  body.addEventListener('input', e => {
    if (e.target.id !== 'ce-emoji') return;
    const txt = e.target.value.trim();
    const parts = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(txt)].map(x => x.segment) : [...txt];
    const last = parts.pop();
    if (last && /\p{Extended_Pictographic}/u.test(last)) { st.emoji = last; $('#ce-prev', body).textContent = last; }
  });
  render();
  return sheet;
}

export function openCategoriesManager() {
  const body = document.createElement('div');
  const sheet = openSheet({ title: 'Categories', content: body, size: 'full', onClose: () => unsub() });
  const unsub = store.subscribe(() => render());
  const ms = () => monthStats(thisMonth());
  function list(kind) {
    const m = ms();
    return store.categories.filter(c => c.kind === kind).sort((a, b) => a.order - b.order).map(c => {
      const spent = (kind === 'expense' ? m.byCat : m.incByCat).get(c.id) || 0;
      return `<button class="cell" data-cat="${esc(c.id)}"><span class="ebadge sm" style="--c:${catRGB(c)}">${esc(c.emoji)}</span><span class="label">${esc(c.name)}<small class="amt">${spent ? `${money(spent)} this month` : 'Not used this month'}${c.budget ? ` · budget ${money(c.budget)}` : ''}</small></span>${icon('chev-r', 'chev')}</button>`;
    }).join('');
  }
  function render() {
    body.innerHTML = `
      <div class="caps" style="padding:4px 6px 8px">Expenses</div>
      <div class="glass group" style="--sep-inset:62px">${list('expense')}</div>
      <div class="caps" style="padding:22px 6px 8px">Income</div>
      <div class="glass group" style="--sep-inset:62px">${list('income')}</div>
      <button class="btn block glass tint btn-primary press" data-act="add" style="margin-top:20px">${icon('plus', 'sm')}New category</button>`;
  }
  body.addEventListener('click', e => {
    const c = e.target.closest('[data-cat]');
    if (c) return openCategoryEditor({ category: category(c.dataset.cat) });
    if (e.target.closest('[data-act="add"]')) openCategoryEditor({});
  });
  render();
}

// ---------------------------------------------------------------- budget
export function openBudgetSheet() {
  const s = store.settings;
  const m = monthStats(thisMonth());
  const body = document.createElement('div');
  const sheet = openSheet({ title: 'Budget', subtitle: 'Resets on the 1st of every month', content: body, size: 'full' });
  const cats = store.categories.filter(c => c.kind === 'expense' && !c.archived).sort((a, b) => (m.byCat.get(b.id) || 0) - (m.byCat.get(a.id) || 0));
  body.innerHTML = `<div class="form">
    <div><label class="field-label">Monthly spending budget</label>
      <label class="field"><span class="prefix">${esc(cur().symbol)}</span><input id="bg-total" inputmode="decimal" placeholder="No budget" value="${esc(toInput(s.budget))}"></label>
      <div class="t-foot t3" style="margin:8px 6px 0">This month so far: <span class="amt">${esc(money(m.expense))}</span>. Card spends count here too.</div>
    </div>
    <div class="caps" style="padding:18px 6px 0">Per-category limits (optional)</div>
    <div class="glass group" style="--sep-inset:62px">
      ${cats.map(c => `<label class="cell"><span class="ebadge sm" style="--c:${catRGB(c)}">${esc(c.emoji)}</span><span class="label">${esc(c.name)}<small class="amt">${esc(money(m.byCat.get(c.id) || 0))} spent</small></span>
        <input data-cb="${esc(c.id)}" inputmode="decimal" placeholder="—" value="${esc(toInput(c.budget))}" style="width:96px;text-align:right;border:0;background:var(--fill-3);border-radius:10px;height:36px;padding:0 10px;outline:0;color:var(--t1);font:500 15px var(--font-text)"></label>`).join('')}
    </div>
    <button class="btn block glass tint btn-primary press" data-act="save" style="margin-top:18px">Save budget</button>
  </div>`;
  body.addEventListener('click', e => {
    if (!e.target.closest('[data-act="save"]')) return;
    const total = parseAmount($('#bg-total', body).value) || 0;
    setSettings({ budget: Math.max(0, total) });
    body.querySelectorAll('[data-cb]').forEach(inp => {
      const v = Math.max(0, parseAmount(inp.value) || 0);
      const c = category(inp.dataset.cb);
      if (c && (c.budget || 0) !== v) updateCategory(c.id, { budget: v });
    });
    haptic('success');
    sheet.close();
    toast(total ? `Budget set: ${money(total)}/month` : 'Budget cleared', { icon: 'target' });
  });
}

// ---------------------------------------------------------------- recurring
export function openRecurringManager() {
  const body = document.createElement('div');
  const sheet = openSheet({ title: 'Recurring', subtitle: 'Logged automatically each month', content: body, size: 'full', onClose: () => unsub() });
  const unsub = store.subscribe(() => render());
  function render() {
    const list = [...store.recurring].sort((a, b) => (a.next < b.next ? -1 : 1));
    body.innerHTML = list.length ? `
      <div class="glass group" style="--sep-inset:62px">
        ${list.map(r => {
          const c = category(r.categoryId);
          const a = account(r.accountId), to = account(r.toAccountId);
          const title = r.note || (r.type === 'transfer' ? `${a?.name} → ${to?.name}` : c?.name) || 'Recurring';
          return `<div class="cell"><span class="ebadge sm" style="--c:${r.type === 'transfer' ? 'var(--xfer-rgb)' : catRGB(c)}">${r.type === 'transfer' ? icon('transfer') : esc(c?.emoji || '🔁')}</span>
            <span class="label">${esc(title)}<small>${esc(money(r.type === 'expense' ? -r.amount : r.amount))} · ${ordinal(r.day)} monthly · ${r.active ? 'next ' + esc(fmtShortDate(r.next)) : 'paused'}</small></span>
            <button class="switch" role="switch" aria-checked="${r.active}" data-toggle="${esc(r.id)}" aria-label="Active"></button>
            <button class="icon-btn sm press" data-del="${esc(r.id)}" aria-label="Delete" style="color:var(--neg)">${icon('trash', 'sm')}</button></div>`;
        }).join('')}
      </div>
      <p class="t-foot t3" style="margin:12px 8px 0">Due items are added when you open the app on or after their date.</p>`
      : `<div class="glass" style="border-radius:var(--r-lg)">${emptyState({ emoji: '🔁', title: 'No recurring payments', text: 'Turn on “Repeat monthly” when adding rent, subscriptions or your salary.' })}</div>`;
    body.innerHTML += `<button class="btn block glass tint btn-primary press" data-act="new" style="margin-top:18px">${icon('plus', 'sm')}New recurring payment</button>`;
  }
  body.addEventListener('click', async e => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      const r = store.recurring.find(x => x.id === tg.dataset.toggle);
      updateRecurring(r.id, { active: !r.active, next: !r.active && r.next < todayKey() ? todayKey() : r.next });
      haptic('selection');
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const ok = await confirmDialog({ title: 'Stop this recurring payment?', message: 'Past transactions stay; no new ones will be added.', confirm: 'Delete', destructive: true, icon: 'repeat' });
      if (ok) { removeRecurring(del.dataset.del); toast('Recurring removed', { icon: 'trash', tone: 'neg' }); }
      return;
    }
    if (e.target.closest('[data-act="new"]')) {
      const { openTxSheet } = await tx();
      openTxSheet({ preset: { type: 'expense', repeat: true } });
    }
  });
  render();
}

// ---------------------------------------------------------------- currency
export function openCurrencyPicker({ current, onPick }) {
  const body = document.createElement('div');
  const sheet = openSheet({ title: 'Currency', content: body, size: 'full' });
  body.innerHTML = `
    <label class="field" style="margin-bottom:14px">${icon('search', 'sm')}<input id="cp-q" placeholder="Search currencies" autocomplete="off"></label>
    <div class="cur-grid" id="cp-grid">
      ${CURRENCIES.map(([code, flag]) => `<button class="cur" data-code="${code}" aria-pressed="${code === current}" data-name="${esc((currencyName(code) || '').toLowerCase())}"><span class="f">${flag}</span><b>${code}</b><small class="ellip" style="max-width:100%">${esc(currencyName(code))}</small></button>`).join('')}
    </div>`;
  body.addEventListener('input', e => {
    if (e.target.id !== 'cp-q') return;
    const q = e.target.value.trim().toLowerCase();
    body.querySelectorAll('.cur').forEach(b => { b.hidden = q && !b.dataset.code.toLowerCase().includes(q) && !b.dataset.name.includes(q); });
  });
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-code]');
    if (!b) return;
    haptic('selection');
    onPick(b.dataset.code);
    sheet.close();
  });
}

export { METHOD };
