// Add / edit transaction sheet: calculator keypad, method pickers, category grid.
import { $, $$, esc } from '../core/util.js';
import { cur, money, fromMinor } from '../core/money.js';
import { todayKey, addDays, fmtDay, fmtTime, nowTime, isValidKey, ordinal } from '../core/dates.js';
import {
  store, account, category, activeAccounts, catOrder, balances, cardInfo,
  addTx, updateTx, deleteTx, restoreTx, addRecurring, nextOccurrence, findAutoDuplicate, budgetCrossing,
  preset as getPreset, resolvePreset, addPreset, updatePreset, removePreset,
} from '../core/store.js';
import { haptic } from '../core/native.js';
import { openSheet } from '../ui/sheet.js';
import { toast, confirmDialog, openMenu } from '../ui/overlays.js';
import { icon } from '../ui/icons.js';
import { SPR, animate } from '../ui/spring.js';
import { acctGlyph, acctRGB, catRGB, txTitle, flashTx } from './common.js';
import { openCategoryEditor } from './manage.js';

const TITLES = { expense: 'New expense', income: 'New income', transfer: 'Transfer' };
const EDIT_TITLES = { expense: 'Edit expense', income: 'Edit income', transfer: 'Edit transfer' };

function plain(minor) {
  const v = fromMinor(minor);
  return String(+v.toFixed(cur().decimals));
}

function evalExpr(expr) {
  const toks = expr.match(/[+-]|[^+-]+/g) || [];
  let total = 0, sign = 1;
  for (const t of toks) {
    if (t === '+') sign = 1;
    else if (t === '-') sign = -1;
    else { const v = parseFloat(t); if (!isNaN(v)) total += sign * Math.round(v * cur().factor); }
  }
  return total;
}

const hasOp = e => /\d[+-]\d/.test(e) || /\d[+-]$/.test(e);

function prettyNumber(seg) {
  if (!seg) return '0';
  const [i, f] = seg.split('.');
  const n = new Intl.NumberFormat(cur().locale, { maximumFractionDigits: 0 }).format(Number(i || 0));
  return seg.includes('.') ? `${n}${cur().decimal}${f}` : n;
}
const prettyExpr = e => e.split(/([+-])/).map(x => (x === '+' ? ' + ' : x === '-' ? ' − ' : prettyNumber(x))).join('');

function defaultAccount(type) {
  const acts = activeAccounts();
  const last = store.settings.lastAcct?.[type];
  if (last && acts.some(a => a.id === last)) return last;
  return (acts.find(a => a.type === 'upi') || acts.find(a => a.type !== 'card') || acts[0])?.id;
}

/**
 * openTxSheet({ tx, preset: {type, amount, accountId, toAccountId, categoryId, note, date} })
 * mode 'button' edits a Home quick button instead of a transaction (buttonId = existing one).
 */
export function openTxSheet({ tx = null, preset = {}, mode = 'tx', buttonId = null } = {}) {
  if (tx && tx.type === 'adjust') return openAdjustSheet(tx);
  const isBtn = mode === 'button';
  const btn = isBtn && buttonId ? getPreset(buttonId) : null;
  if (btn) {
    const r = resolvePreset(btn);
    preset = { ...btn, accountId: r.accountId, toAccountId: r.toAccountId, note: btn.label };
  }
  const editing = !!tx || !!btn;
  const src = tx || preset;
  const st = {
    type: src.type || 'expense',
    expr: src.amount ? plain(src.amount) : '',
    accountId: src.accountId || null,
    toAccountId: src.toAccountId || null,
    categoryId: src.categoryId || null,
    note: src.note || '',
    date: src.date && isValidKey(src.date) ? src.date : todayKey(),
    repeat: !tx && !!preset.repeat,
  };
  const fixAccounts = () => {
    const acts = activeAccounts();
    const ok = id => acts.some(a => a.id === id) || (editing && account(id));
    if (!ok(st.accountId)) st.accountId = defaultAccount(st.type === 'transfer' ? 'expense' : st.type);
    if (st.type === 'transfer') {
      if (!ok(st.toAccountId) || st.toAccountId === st.accountId) {
        const from = account(st.accountId);
        const pick = from?.type === 'cash' ? acts.find(a => a.type === 'upi') : acts.find(a => a.type === 'card') || acts.find(a => a.type === 'cash');
        st.toAccountId = (pick && pick.id !== st.accountId ? pick : acts.find(a => a.id !== st.accountId))?.id || null;
      }
    }
  };
  fixAccounts();

  const content = document.createElement('div');
  content.className = 'txs';
  const foot = document.createElement('div');
  foot.className = 'keypad-wrap';
  const sheet = openSheet({
    title: isBtn ? (btn ? 'Edit quick button' : 'New quick button') : editing ? EDIT_TITLES[st.type] : TITLES[st.type],
    content,
    foot,
    className: 'tx-sheet',
    headRight: isBtn
      ? (btn ? `<button class="icon-btn sm plain press" data-act="delete" aria-label="Delete button" style="color:var(--neg)">${icon('trash')}</button>` : '')
      : editing ? `<button class="icon-btn sm plain press" data-act="duplicate" aria-label="Duplicate">${icon('copy')}</button><button class="icon-btn sm plain press" data-act="delete" aria-label="Delete" style="color:var(--neg)">${icon('trash')}</button>` : '',
    onClose: () => document.removeEventListener('keydown', onKey),
  });
  const root = sheet.el;

  // two category rows only on tall screens — everything must fit above the keypad
  const compact = innerHeight < 900;

  function accountPicks(role) {
    const acts = activeAccounts().filter(a => a.id !== (role === 'to' ? st.accountId : null));
    const list = st.type === 'income' && role === 'main' ? [...acts.filter(a => a.type !== 'card'), ...acts.filter(a => a.type === 'card')] : acts;
    // include an archived account if editing a tx that uses it
    const selId = role === 'to' ? st.toAccountId : st.accountId;
    if (selId && !list.some(a => a.id === selId) && account(selId)) list.push(account(selId));
    const b = balances();
    return list.map(a => {
      let sub;
      if (a.type === 'card') {
        const ci = cardInfo(a);
        sub = a.limit ? `${money(ci.available, { decimals: 'never' })} avail.` : ci.due ? `${money(ci.due, { decimals: 'never' })} due` : a.last4 ? `•••• ${a.last4}` : 'Card';
      } else sub = money(b.get(a.id) || 0, { decimals: 'never' });
      const on = a.id === selId;
      return `<button class="pick press" data-pick="${role}" data-id="${esc(a.id)}" aria-pressed="${on}" style="--c:${acctRGB(a)}">
        ${acctGlyph(a)}<span><span class="ellip" style="display:block;max-width:130px">${esc(a.name)}</span><small class="amt">${esc(sub)}</small></span>
      </button>`;
    }).join('');
  }

  function catGrid() {
    const cats = catOrder(st.type);
    return cats.map(c => `
      <button class="cat" data-cat="${esc(c.id)}" aria-pressed="${c.id === st.categoryId}" style="--c:${catRGB(c)}">
        <span class="ebadge">${esc(c.emoji)}</span><span class="nm">${esc(c.name.split(' ')[0].replace(/&$/, ''))}</span>
      </button>`).join('') + `
      <button class="cat" data-act="new-cat" style="--c:126 138 128"><span class="ebadge" style="font-size:20px;color:var(--t2)">${icon('plus')}</span><span class="nm">New</span></button>`;
  }

  function dateLabel() {
    return fmtDay(st.date, { weekday: false });
  }

  function render() {
    const isX = st.type === 'transfer';
    const toAcct = account(st.toAccountId);
    const payLabel = st.type === 'expense' ? 'Paid with' : st.type === 'income' ? 'Received in' : 'From';
    content.innerHTML = `
      <div class="seg lg" role="group" aria-label="Type" data-tone="${st.type}" id="tx-seg">
        <span class="seg-thumb"></span>
        <button data-type="expense" aria-pressed="${st.type === 'expense'}">${icon('out', 'sm')}Expense</button>
        <button data-type="income" aria-pressed="${st.type === 'income'}">${icon('in', 'sm')}Income</button>
        <button data-type="transfer" aria-pressed="${st.type === 'transfer'}">${icon('transfer', 'sm')}Transfer</button>
      </div>
      <div class="amount-disp" id="tx-amt" aria-live="polite"></div>
      <div class="tx-sec">
        <div class="caps">${payLabel}</div>
        <div class="hscroll" id="pick-main">${accountPicks('main')}</div>
      </div>
      ${isX ? `
      <div class="xfer-arrow">${icon('chev-d', 'sm')}</div>
      <div class="tx-sec" style="margin-top:0">
        <div class="caps">${toAcct?.type === 'card' ? 'To · pays the card bill' : 'To'}</div>
        <div class="hscroll" id="pick-to">${accountPicks('to')}</div>
      </div>` : `
      <div class="tx-sec">
        <div class="caps">Category</div>
        <div class="hscroll"><div class="cat-grid ${compact ? 'one' : ''}" id="cat-grid">${catGrid()}</div></div>
      </div>`}
      <div class="tx-meta">
        <label class="field">${icon(isBtn ? 'zap' : 'note', 'sm')}<input id="tx-note" type="text" maxlength="${isBtn ? 28 : 140}" placeholder="${isBtn ? 'Button name, e.g. Petrol' : isX ? 'Add a note' : 'What was it for?'}" value="${esc(st.note)}" enterkeyhint="done" autocomplete="off"></label>
        ${isBtn ? '' : `<button class="datechip press" data-act="date" aria-label="Date">${icon('calendar', 'sm')}<span id="tx-date-l">${esc(dateLabel())}</span></button>`}
        ${editing || isBtn ? '' : `<button class="datechip press" data-act="repeat" aria-pressed="${st.repeat}" aria-label="Repeat monthly">${icon('repeat', 'sm')}</button>`}
        <input id="tx-date" class="sr-only" type="date" value="${st.date}" max="${addDays(todayKey(), 366)}" tabindex="-1" aria-hidden="true">
      </div>`;
    foot.innerHTML = `
        <div class="keypad" id="keypad">
          ${['1', '2', '3', 'back', '4', '5', '6', '+', '7', '8', '9', '-', cur().decimals ? '.' : '00', '0', cur().decimals ? '00' : '000', 'go'].map(k => {
            if (k === 'back') return `<button class="key op" data-k="back" aria-label="Delete">${icon('back')}</button>`;
            if (k === 'go') return `<button class="key go ${st.type}" data-k="go" aria-label="Save">${icon('check')}</button>`;
            if (k === '+' || k === '-') return `<button class="key op" data-k="${k}" aria-label="${k === '+' ? 'Plus' : 'Minus'}">${k === '+' ? '+' : '−'}</button>`;
            return `<button class="key" data-k="${k}">${k === '.' ? esc(cur().decimal) : k}</button>`;
          }).join('')}
        </div>`;
    positionThumb(false);
    paintAmount();
    requestAnimationFrame(() => {
      content.querySelectorAll('.hscroll').forEach(h => {
        const s = h.querySelector('[aria-pressed="true"]');
        // only scroll when the selection is out of view
        if (s && s.offsetLeft + s.offsetWidth > h.scrollLeft + h.clientWidth - 12) h.scrollLeft = s.offsetLeft - 24;
      });
    });
  }

  function positionThumb(animateIt = true) {
    const seg = $('#tx-seg', content);
    const btn = seg.querySelector(`[data-type="${st.type}"]`);
    const th = seg.querySelector('.seg-thumb');
    th.style.width = btn.offsetWidth + 'px';
    th.style.transform = `translate3d(${btn.offsetLeft}px,0,0)`;
    if (!animateIt) { th.style.transition = 'none'; requestAnimationFrame(() => { th.style.transition = ''; }); }
  }

  function paintAmount() {
    const box = $('#tx-amt', content);
    const value = evalExpr(st.expr);
    const op = hasOp(st.expr);
    const seg = st.expr.split(/[+-]/).pop();
    const shown = op ? prettyNumber(plain(Math.abs(value))) : prettyNumber(seg);
    const neg = op && value < 0;
    const len = shown.length + (cur().symbol.length > 1 ? 2 : 0);
    const color = st.type === 'income' ? 'var(--pos)' : st.type === 'transfer' ? 'var(--xfer)' : 'var(--t1)';
    const sym = `<span class="sym">${esc(cur().symbol)}</span>`;
    box.innerHTML = `
      <div class="big ${!st.expr ? 'zero' : ''} ${len > 12 ? 'xlong' : len > 9 ? 'long' : ''}" style="color:${value ? color : ''}">
        ${cur().symbolFirst ? sym : ''}<span class="val">${neg ? '−' : ''}${esc(shown)}</span><span class="caret"></span>${cur().symbolFirst ? '' : sym}
      </div>
      <div class="expr">${op ? esc(prettyExpr(st.expr)) + ' =' : st.type === 'transfer' ? esc(transferHint()) : ''}</div>`;
    const go = root.querySelector('.key.go');
    if (go) go.innerHTML = op && /\d$/.test(st.expr) ? '<span style="font:600 30px var(--font-display)">=</span>' : icon('check');
  }

  function transferHint() {
    const a = account(st.accountId), b = account(st.toAccountId);
    if (!a || !b) return '';
    if (b.type === 'card') return `Paying ${b.name} bill — not counted as spending`;
    if (b.type === 'cash' && a.type !== 'cash') return 'Cash withdrawal';
    if (a.type === 'cash') return 'Depositing cash';
    return 'Moving money between your accounts';
  }

  function reject() {
    haptic('error');
    const box = $('#tx-amt', content);
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }

  function press(k) {
    let e = st.expr;
    const seg = e.split(/[+-]/).pop();
    const lastOp = /[+-]$/.test(e);
    const dec = cur().decimals;
    if (k === 'back') {
      if (!e) return reject();
      e = e.slice(0, -1);
    } else if (k === '+' || k === '-') {
      if (!e) return reject();
      if (lastOp || e.endsWith('.')) e = e.slice(0, -1) + k;
      else e += k;
    } else if (k === '.') {
      if (!dec || seg.includes('.')) return reject();
      e += seg === '' ? '0.' : '.';
    } else if (k === 'go') {
      if (hasOp(st.expr) && /\d$/.test(st.expr)) { // "=" collapses the expression first
        const v = evalExpr(st.expr);
        if (v <= 0) return reject();
        st.expr = plain(v);
        haptic('medium');
        return paintAmount();
      }
      return save();
    } else {
      let d = k;
      if (seg.includes('.')) {
        const room = dec - seg.split('.')[1].length;
        if (room <= 0) return reject();
        d = d.slice(0, room);
      } else {
        if (seg === '0') { if (d[0] === '0') return reject(); e = e.slice(0, -1); }
        if (seg === '' && /^0+$/.test(d)) d = '0';
        if ((seg.replace(/^0+/, '') + d).length > 9) return reject();
      }
      e += d;
    }
    st.expr = e;
    haptic('light');
    paintAmount();
  }

  function onKey(e) {
    if (sheet.closing || document.activeElement?.id === 'tx-note' || !content.isConnected) return;
    if (document.querySelector('.lock, .onb, .dialog-wrap, .menu')) return;
    if (sheet.el !== document.querySelector('#sheets .sheet:last-child')) return;
    const map = { Backspace: 'back', Enter: 'go', '+': '+', '-': '-', '.': '.', ',': '.' };
    const k = /^\d$/.test(e.key) ? e.key : map[e.key];
    if (!k) return;
    e.preventDefault();
    const btn = root.querySelector(`[data-k="${k === '.' && !cur().decimals ? '00' : k}"]`);
    if (btn) { btn.classList.add('is-pressed'); setTimeout(() => btn.classList.remove('is-pressed'), 90); }
    press(k);
  }
  document.addEventListener('keydown', onKey);

  function setType(t) {
    if (t === st.type) return;
    st.type = t;
    if (t !== 'transfer') {
      const c = category(st.categoryId);
      if (!c || c.kind !== t) st.categoryId = null;
      const acc = account(st.accountId);
      if (t === 'income' && acc?.type === 'card') st.accountId = defaultAccount('income');
    }
    fixAccounts();
    sheet.setTitle(isBtn ? (btn ? 'Edit quick button' : 'New quick button') : editing ? EDIT_TITLES[t] : TITLES[t]);
    haptic('selection');
    render();
  }

  async function save() {
    const amount = evalExpr(st.expr);
    if (amount <= 0) return reject();
    if (st.type === 'transfer' && (!st.toAccountId || st.toAccountId === st.accountId)) { toast('Pick two different accounts', { icon: 'alert', tone: 'warn' }); return reject(); }
    const data = {
      type: st.type, amount, accountId: st.accountId,
      toAccountId: st.type === 'transfer' ? st.toAccountId : undefined,
      categoryId: st.type === 'transfer' ? undefined : st.categoryId || (st.type === 'income' ? 'other_in' : 'other'),
      note: $('#tx-note', content)?.value.trim() ?? st.note,
      date: st.date,
      time: editing ? tx.time : st.date === todayKey() ? nowTime() : '12:00',
    };
    if (isBtn) {
      const c = category(data.categoryId);
      const label = data.note || (data.type === 'transfer' ? txTitle({ ...data, note: '' }) : c?.name) || 'Quick add';
      const payload = { type: data.type, amount, accountId: data.accountId, toAccountId: data.toAccountId || null, categoryId: data.categoryId || null, label, note: label, method: null };
      if (btn) updatePreset(btn.id, payload); else addPreset(payload);
      haptic('success');
      sheet.close();
      toast(btn ? 'Quick button saved' : 'Quick button added', { sub: `${label} · ${money(amount)} — one tap on Home logs it`, icon: 'zap' });
      return;
    }
    const a = account(data.accountId);
    let warn = null;
    if (st.type === 'expense' && a?.type === 'card' && a.limit) {
      const ci = cardInfo(a);
      const extra = editing && tx.accountId === a.id && tx.type === 'expense' ? tx.amount : 0;
      if (amount - extra > ci.available) warn = `${a.name} is now over its limit`;
    }
    if (editing) {
      const t = updateTx(tx.id, data);
      if (!t) { toast('Couldn’t save', { icon: 'alert', tone: 'neg' }); return; }
      flashTx(t.id);
      haptic('success');
      sheet.close();
      toast('Changes saved', { sub: `${txTitle(t)} · ${money(t.amount)}` });
      return;
    }
    // an IOB alert may already have logged this very payment: ask before doubling it
    const dup = findAutoDuplicate(data);
    if (dup && !(await confirmDialog({
      title: 'Already logged?',
      message: `${money(dup.amount)} on ${account(dup.accountId)?.name || 'this account'} was added automatically at ${fmtTime(dup.time)} from your bank alert. Add this one as well?`,
      confirm: 'Add anyway', cancel: 'Cancel', icon: 'copy', tone: 'warn',
    }))) return;
    const t = addTx(data);
    if (!t) { toast('Couldn’t save — try again', { icon: 'alert', tone: 'neg' }); return; }
    warn = warn || budgetCrossing(t);
    if (st.repeat) {
      const day = +st.date.slice(8);
      addRecurring({ ...data, day, next: nextOccurrence(day, st.date) });
    }
    flashTx(t.id);
    haptic('success');
    sheet.close();
    const c = category(t.categoryId);
    const label = t.type === 'transfer' ? txTitle(t) : `${c?.emoji || ''} ${c?.name || ''}`.trim();
    toast(`${t.type === 'income' ? 'Added' : t.type === 'transfer' ? 'Moved' : 'Spent'} ${money(t.amount)}`, {
      sub: warn || `${label} · ${a?.name || ''}${st.repeat ? ' · repeats monthly' : ''}`,
      icon: warn ? 'alert' : t.type === 'income' ? 'in' : t.type === 'transfer' ? 'transfer' : 'check',
      tone: warn ? 'warn' : t.type === 'income' ? 'pos' : t.type === 'transfer' ? 'xfer' : 'accent',
      action: 'Undo',
      onAction: () => { deleteTx(t.id); toast('Removed', { icon: 'undo', tone: 'accent' }); },
    });
  }

  // ---------------------------------------------------------------- events
  root.addEventListener('pointerdown', e => {
    const k = e.target.closest('.key');
    if (!k) return;
    k.classList.add('is-pressed');
    const up = () => { k.classList.remove('is-pressed'); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });

  // long-press backspace clears
  let holdTimer = null;
  root.addEventListener('pointerdown', e => {
    if (!e.target.closest('[data-k="back"]')) return;
    holdTimer = setTimeout(() => { holdTimer = 'fired'; if (st.expr) { st.expr = ''; haptic('medium'); paintAmount(); } }, 550);
  });
  const clearHold = () => { if (holdTimer && holdTimer !== 'fired') clearTimeout(holdTimer); };
  root.addEventListener('pointerup', clearHold);
  root.addEventListener('pointercancel', clearHold);

  root.addEventListener('click', e => {
    const key = e.target.closest('[data-k]');
    if (key) {
      if (key.dataset.k === 'back' && holdTimer === 'fired') { holdTimer = null; return; }
      holdTimer = null;
      return press(key.dataset.k);
    }
    const typeBtn = e.target.closest('#tx-seg [data-type]');
    if (typeBtn) return setType(typeBtn.dataset.type);
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      if (pick.dataset.pick === 'main') {
        st.accountId = pick.dataset.id;
        if (st.type === 'transfer' && st.toAccountId === st.accountId) st.toAccountId = null;
        fixAccounts();
      } else st.toAccountId = pick.dataset.id;
      haptic('selection');
      const keepNote = $('#tx-note', content)?.value;
      if (keepNote != null) st.note = keepNote;
      const scrolls = [...content.querySelectorAll('.hscroll')].map(h => h.scrollLeft);
      render();
      [...content.querySelectorAll('.hscroll')].forEach((h, i) => { if (scrolls[i] != null) h.scrollLeft = scrolls[i]; });
      return;
    }
    const cat = e.target.closest('[data-cat]');
    if (cat) {
      st.categoryId = cat.dataset.cat;
      content.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-pressed', b === cat ? 'true' : 'false'));
      haptic('selection');
      animate(cat.querySelector('.ebadge'), [{ transform: 'scale(.8)' }, { transform: 'scale(1.06)' }], { duration: 420, easing: SPR.spring.easing });
      return;
    }
    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;
    if (act === 'date') {
      const t = todayKey();
      const setDate = d => { st.date = d; $('#tx-date', content).value = d; $('#tx-date-l', content).textContent = dateLabel(); haptic('selection'); };
      openMenu(actEl, [
        { label: 'Today', icon: st.date === t ? 'check' : '', onSelect: () => setDate(t) },
        { label: 'Yesterday', icon: st.date === addDays(t, -1) ? 'check' : '', onSelect: () => setDate(addDays(t, -1)) },
        { label: fmtDay(addDays(t, -2)), icon: st.date === addDays(t, -2) ? 'check' : '', onSelect: () => setDate(addDays(t, -2)) },
        '-',
        { label: 'Pick a date…', icon: 'calendar', onSelect: () => { const inp = $('#tx-date', content); try { inp.showPicker(); } catch { inp.focus(); inp.click(); } } },
      ]);
      return;
    }
    if (act === 'repeat') {
      st.repeat = !st.repeat;
      actEl.setAttribute('aria-pressed', st.repeat);
      haptic('selection');
      if (st.repeat) toast(`Repeats on the ${ordinal(+st.date.slice(8))} of every month`, { icon: 'repeat', duration: 2200 });
    } else if (act === 'new-cat') {
      openCategoryEditor({ kind: st.type === 'income' ? 'income' : 'expense', onSave: c => { st.categoryId = c.id; st.note = $('#tx-note', content)?.value ?? st.note; render(); } });
    } else if (act === 'duplicate') {
      sheet.close();
      setTimeout(() => openTxSheet({ preset: { ...tx, date: todayKey() } }), 180);
    }
  });

  sheet.el.addEventListener('click', async e => {
    if (!e.target.closest('[data-act="delete"]')) return;
    if (btn) {
      const ok = await confirmDialog({ title: `Delete “${btn.label}”?`, message: 'The quick button is removed. Transactions it already logged stay.', confirm: 'Delete', destructive: true, icon: 'zap' });
      if (!ok) return;
      removePreset(btn.id);
      sheet.close();
      haptic('success');
      toast('Quick button deleted', { icon: 'trash', tone: 'neg' });
      return;
    }
    const ok = await confirmDialog({ title: 'Delete this transaction?', message: `${txTitle(tx)} · ${money(tx.amount)}`, confirm: 'Delete', destructive: true, icon: 'trash' });
    if (!ok) return;
    const removed = deleteTx(tx.id);
    sheet.close();
    haptic('success');
    toast('Transaction deleted', { icon: 'trash', tone: 'neg', action: 'Undo', onAction: () => restoreTx(removed) });
  });

  content.addEventListener('change', e => {
    if (e.target.id === 'tx-date' && isValidKey(e.target.value)) {
      st.date = e.target.value;
      $('#tx-date-l', content).textContent = dateLabel();
      haptic('selection');
    }
  });
  content.addEventListener('focusin', e => { if (e.target.id === 'tx-note') root.classList.add('typing'); });
  content.addEventListener('focusout', e => {
    if (e.target.id === 'tx-note') { st.note = e.target.value; setTimeout(() => root.classList.remove('typing'), 60); }
  });
  content.addEventListener('keydown', e => {
    if (e.target.id === 'tx-note' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });

  render();
  return sheet;
}

/** Minimal sheet for balance adjustments (edit note/date or delete). */
function openAdjustSheet(tx) {
  const a = account(tx.accountId);
  const sheet = openSheet({
    title: 'Balance adjustment',
    subtitle: a?.name || '',
    content: `
      <div class="acct-hero"><div class="t-foot t2">${esc(fmtDay(tx.date))}</div><div class="big amt ${tx.amount < 0 ? 'neg' : 'pos'}">${esc(money(tx.amount, { sign: 'always' }))}</div></div>
      <p class="t-sub t2" style="text-align:center;margin:-6px 12px 18px">Adjustments correct an account’s balance. They don’t count as income or spending.</p>
      <button class="btn block glass tint btn-danger press" data-act="del">${icon('trash', 'sm')}Delete adjustment</button>`,
  });
  sheet.body.addEventListener('click', e => {
    if (!e.target.closest('[data-act="del"]')) return;
    const removed = deleteTx(tx.id);
    sheet.close();
    toast('Adjustment removed', { icon: 'trash', tone: 'neg', action: 'Undo', onAction: () => restoreTx(removed) });
  });
  return sheet;
}
