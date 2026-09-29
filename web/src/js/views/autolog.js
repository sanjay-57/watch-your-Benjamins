// Automatic logging: UPI payments (and, optionally, money received) on ONE Indian Overseas Bank
// account, read from IOB's SMS alerts by the Android shell (SmsReceiver). The shell only queues an
// alert when it is from IOB, is a UPI debit/credit and names the account entered here; this file
// turns the queue into ledger entries (drainAutoLog), optionally after the user approves each one
// ('ask' mode), and hosts the settings sheet.
import { $, esc } from '../core/util.js';
import { cur, money } from '../core/money.js';
import { keyOf } from '../core/dates.js';
import { store, setSettings, activeAccounts, account, importAutoTxs, deleteTx, flush, isReady, budgetCrossing } from '../core/store.js';
import { haptic, smsSupported, smsState, setSmsConfig, requestSmsPermission, pendingSms, ackSms, onNative } from '../core/native.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/overlays.js';
import { icon } from '../ui/icons.js';

export { smsSupported };

const pad = n => String(n).padStart(2, '0');

/** Push the on/off + account digits + credits switch to the shell whenever they change. */
let pushed = '';
export function syncAutoLogConfig() {
  if (!smsSupported || !isReady()) return; // settings may still be the pre-IndexedDB snapshot
  const a = store.settings.autoLog;
  const key = `${a.on}|${a.last4}|${a.credits}`;
  if (key === pushed) return;
  pushed = key;
  setSmsConfig(a.on, a.last4, a.credits);
}

// ---------------------------------------------------------------- review queue ('ask' mode)
let review = []; // items waiting for the user's yes/no; they stay in the shell's queue until decided
const subs = new Set();
export const reviewItems = () => review;
export const onReviewChange = fn => { subs.add(fn); return () => subs.delete(fn); };
const notify = () => { for (const fn of subs) { try { fn(); } catch (e) { console.error(e); } } };

function toItem(q, target) {
  const d = new Date(q.ts);
  const credit = q.dir === 'credit';
  return {
    id: q.id,
    ref: q.ref || q.id,
    credit,
    tx: {
      type: credit ? 'income' : 'expense',
      amount: Math.round(q.paise / 100 * cur().factor),
      accountId: target.id,
      categoryId: credit ? 'other_in' : 'other',
      date: keyOf(d),
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      note: credit ? 'UPI received' : q.to ? `UPI · to a/c ••${q.to}` : 'UPI payment',
    },
  };
}

/** Save items to the ledger, tell the user, and only then release them from the shell's queue. */
function commit(items) {
  const res = importAutoTxs(items);
  if (res.done.length) { flush(); ackSms(res.done); }
  const { created, matched } = res;
  if (!created.length && !matched.length) return res;
  haptic('success');
  if (created.length === 1 && !matched.length) {
    const t = created[0];
    const warn = budgetCrossing(t);
    const inc = t.type === 'income';
    toast(`${inc ? '+' : '−'}${money(t.amount)} ${inc ? 'received' : 'logged'}`, {
      sub: warn || 'From your IOB alert. Tap Undo if it’s wrong',
      icon: warn ? 'alert' : inc ? 'in' : 'upi', tone: warn ? 'warn' : inc ? 'pos' : 'accent',
      action: 'Undo', duration: 6000, onAction: () => deleteTx(t.id),
    });
  } else if (!created.length && matched.length === 1) {
    toast(`Matched your ${money(matched[0].amount)} entry`, { sub: 'The IOB alert confirmed it, so it isn’t added twice', icon: 'check-circle', tone: 'pos' });
  } else {
    const n = created.length + matched.length;
    toast(`${n} UPI payments handled`, { sub: matched.length ? `${created.length} added, ${matched.length} matched to your entries` : 'From your IOB alerts', icon: 'upi' });
  }
  return res;
}

/** Move queued alerts into the ledger (or into the review queue). Returns how many were added. */
export function drainAutoLog() {
  const a = store.settings.autoLog;
  if (!smsSupported || !a.on) return 0;
  const target = account(a.accountId);
  if (!target || target.archived || target.type === 'card') return 0; // stays queued until fixed in Settings
  const queued = pendingSms();
  if (!queued.length) return 0;
  const items = queued.map(q => toItem(q, target));

  if (a.mode === 'ask') {
    // anything already in the ledger is settled; the rest waits for a decision
    const have = new Set(store.txs.map(t => t.ref).filter(Boolean));
    const settled = items.filter(i => have.has(i.ref)).map(i => i.id);
    if (settled.length) ackSms(settled);
    const before = new Set(review.map(r => r.id));
    review = items.filter(i => !have.has(i.ref));
    const fresh = review.filter(r => !before.has(r.id));
    if (fresh.length) {
      haptic('warning');
      toast(`${fresh.length} payment${fresh.length > 1 ? 's' : ''} to review`, { sub: 'Open Home to add or skip', icon: 'upi', tone: 'warn', duration: 4200 });
    }
    notify();
    return 0;
  }
  return commit(items).created.length;
}

export function approveReview(ids) {
  const pick = review.filter(r => ids.includes(r.id));
  if (!pick.length) return;
  const res = commit(pick);
  review = review.filter(r => !res.done.includes(r.id));
  notify();
}

export function skipReview(ids) {
  ackSms(ids);
  review = review.filter(r => !ids.includes(r.id));
  haptic('light');
  notify();
}

// ---------------------------------------------------------------- settings sheet
export function autoLogSummary() {
  const a = store.settings.autoLog;
  return a.on ? `On · ••${a.last4}` : 'Off';
}

const WHY = {
  OK: 'logged',
  NOT_UPI: 'ignored (not a UPI payment)',
  CREDIT_OFF: 'ignored (money received is off)',
  OTHER_ACCOUNT: 'ignored (different account)',
  NO_AMOUNT: 'ignored (couldn’t read the amount)',
};

const ago = ts => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

const sw = (name, on) => `<button class="switch" role="switch" aria-checked="${!!on}" data-switch="${name}"></button>`;

export function openAutoLogSheet() {
  const body = document.createElement('div');
  // the status line follows new alerts while the sheet is open (main.js has already drained the queue)
  const off = onNative('sms', () => { if (body.isConnected && document.activeElement?.id !== 'al-last4') render(); });
  const sheet = openSheet({ title: 'Auto-log UPI', subtitle: 'From IOB SMS alerts', content: body, size: 'full', onClose: off });

  function render() {
    const a = store.settings.autoLog;
    const st = smsState();
    const accts = activeAccounts().filter(x => x.type === 'upi' || x.type === 'bank');
    const target = account(a.accountId);
    const targetOk = target && !target.archived && target.type !== 'card';
    const last = st.last;
    body.innerHTML = `
      <div class="demo-banner glass" style="--tint:var(--accent-rgb)"><span class="mglyph" style="--c:var(--accent-rgb)">${icon('shield')}</span>
        <div class="grow"><div class="t-headline">Only your IOB account</div>
        <div class="t-foot t2">Reads the bank’s own SMS alert for each UPI payment (GPay, PhonePe…). Alerts from other banks, other IOB accounts, OTPs and every other text are ignored and never stored. Nothing leaves this phone.</div></div></div>

      <div class="caps" style="padding:18px 6px 8px">Account</div>
      <div class="glass group">
        <div class="cell"><span class="cell-icon" style="--c:var(--m-upi-rgb)">${icon('bank')}</span><span class="label">IOB account<small>Last 4 digits, as shown in the SMS</small></span>
          <label class="field" style="width:104px;min-height:38px"><span class="prefix">••</span><input id="al-last4" inputmode="numeric" maxlength="4" placeholder="1234" value="${esc(a.last4)}" aria-label="Last 4 digits of your IOB account"></label></div>
        <div class="cell"><span class="cell-icon" style="--c:var(--pos-rgb)">${icon('upi')}</span><span class="label">Log into<small>The balance these payments change</small></span>
          <label class="field" style="width:150px;min-height:38px"><select id="al-acct" aria-label="Account to log into">${accts.map(x => `<option value="${esc(x.id)}" ${x.id === a.accountId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}${targetOk ? '' : `<option value="" selected disabled>Choose…</option>`}</select></label></div>
        <div class="cell"><span class="cell-icon" style="--c:var(--warn-rgb)">${icon('zap')}</span><span class="label">Auto-log UPI<small>${a.on ? 'Watching for IOB alerts' : 'Off, nothing is read'}</small></span>${sw('on', a.on)}</div>
      </div>
      ${a.on && !st.granted ? `<div class="group-foot" style="color:var(--warn)">SMS access is off. Turn it on in Android: App info → Permissions → SMS. If “Allow” is greyed out, open App info → ⋮ → <b>Allow restricted settings</b> first.</div>` : ''}
      ${a.on && !targetOk ? `<div class="group-foot" style="color:var(--warn)">Choose which account to log into. Payments wait until you do.</div>` : ''}

      <div class="caps" style="padding:22px 6px 8px">How it logs</div>
      <div class="glass group">
        <div class="cell" style="flex-wrap:wrap"><span class="cell-icon" style="--c:var(--accent-rgb)">${icon('check-circle')}</span><span class="label">Approval<small>${a.mode === 'ask' ? 'Each payment waits on Home for Add / Skip' : 'Payments are added as they arrive'}</small></span>
          <div class="chip-wrap" style="margin-left:auto">${[['auto', 'Automatic'], ['ask', 'Ask me first']].map(([k, l]) => `<button class="chip" data-mode="${k}" aria-pressed="${a.mode === k}">${l}</button>`).join('')}</div></div>
        <div class="cell"><span class="cell-icon" style="--c:var(--pos-rgb)">${icon('in')}</span><span class="label">Money received<small>UPI credits are logged as income</small></span>${sw('credits', a.credits)}</div>
      </div>

      <div class="caps" style="padding:22px 6px 8px">Status</div>
      <div class="glass group">
        <div class="cell"><span class="cell-icon" style="--c:var(--xfer-rgb)">${icon('bell')}</span><span class="label">Last IOB alert<small>${last ? `${esc(ago(last.ts))}: ${esc(WHY[last.status] || last.status)}` : 'None seen yet'}</small></span></div>
      </div>
      <div class="group-foot">Payments land in “Other” (income in “Other Income”); tap one in Activity to pick a category. Each is added once, even if the alert arrives twice. If you already logged a payment by hand, the alert is matched to it instead of adding it again. Payments made while the app was closed appear the next time you open it.</div>`;
  }

  const num = () => $('#al-last4', body).value.replace(/\D/g, '').slice(0, 4);

  body.addEventListener('input', e => { if (e.target.id === 'al-last4') e.target.value = num(); });
  body.addEventListener('change', e => {
    const a = store.settings.autoLog;
    if (e.target.id === 'al-last4') {
      const v = num();
      if (v.length === 4 || !v) { setSettings({ autoLog: { ...a, last4: v } }); if (a.on && !v) toast('Auto-log turned off', { sub: 'Enter your 4 account digits', icon: 'alert', tone: 'warn' }); }
      else toast('Enter all 4 digits', { icon: 'alert', tone: 'warn' });
      render();
    } else if (e.target.id === 'al-acct' && e.target.value) {
      setSettings({ autoLog: { ...a, accountId: e.target.value } });
      drainAutoLog();
      render();
    }
  });

  body.addEventListener('click', async e => {
    const a = store.settings.autoLog;
    const mode = e.target.closest('[data-mode]');
    if (mode) {
      haptic('selection');
      setSettings({ autoLog: { ...a, mode: mode.dataset.mode } });
      render();
      return;
    }
    const cr = e.target.closest('[data-switch="credits"]');
    if (cr) {
      haptic('selection');
      setSettings({ autoLog: { ...a, credits: !a.credits } });
      render();
      return;
    }
    if (!e.target.closest('[data-switch="on"]')) return;
    haptic('selection');
    if (a.on) { setSettings({ autoLog: { ...a, on: false } }); render(); return; }
    const last4 = num();
    if (last4.length !== 4) { toast('Enter your IOB account’s last 4 digits first', { icon: 'alert', tone: 'warn' }); $('#al-last4', body).focus(); return; }
    const acctId = $('#al-acct', body).value || (a.accountId && account(a.accountId) ? a.accountId : '');
    if (!acctId) { toast('Choose which account to log into', { icon: 'alert', tone: 'warn' }); return; }
    const granted = smsState().granted || await requestSmsPermission();
    if (!granted) {
      toast('SMS access needed', { sub: 'Allow it in App info → Permissions (or “Allow restricted settings” first)', icon: 'alert', tone: 'warn', duration: 6000 });
      render();
      return;
    }
    setSettings({ autoLog: { ...a, on: true, last4, accountId: acctId } });
    haptic('success');
    toast('Auto-log is on', { sub: `Watching IOB alerts for ••${last4}`, icon: 'check-circle', tone: 'pos' });
    render();
  });

  render();
  return sheet;
}
