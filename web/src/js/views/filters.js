// Advanced Activity filters: date range, amount range, account, category, plus named saved searches.
import { $, esc, uid } from '../core/util.js';
import { cur, parseAmount, fromMinor } from '../core/money.js';
import { addDays, todayKey, thisMonth, addMonths, dateInMonth, daysInMonth } from '../core/dates.js';
import { store, setSettings, normFilter, activeAccounts } from '../core/store.js';
import { haptic } from '../core/native.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/overlays.js';
import { icon } from '../ui/icons.js';

export const BLANK = { q: '', type: 'all', method: 'all', month: 'all', cat: null, acct: null, from: '', to: '', min: null, max: null };

/** How many of the advanced filters (range, amount, account) are set. */
export const advancedCount = F => (F.from || F.to ? 1 : 0) + (F.min != null || F.max != null ? 1 : 0) + (F.acct ? 1 : 0);

export const amountLabel = F => {
  const s = v => cur().symbol + fromMinor(v);
  if (F.min != null && F.max != null) return `${s(F.min)} – ${s(F.max)}`;
  return F.min != null ? `≥ ${s(F.min)}` : `≤ ${s(F.max)}`;
};

const PRESETS = () => {
  const t = todayKey(), mk = thisMonth(), pm = addMonths(mk, -1);
  return [
    ['This month', dateInMonth(mk, 1), t],
    ['Last month', dateInMonth(pm, 1), dateInMonth(pm, daysInMonth(pm))],
    ['Last 30 days', addDays(t, -29), t],
    ['This year', `${t.slice(0, 4)}-01-01`, t],
  ];
};

/**
 * openFilterSheet({ current, onApply(patch) }). `current` is the live filter object; the sheet edits
 * a draft and only applies it on "Show results".
 */
export function openFilterSheet({ current, onApply }) {
  const d = { ...BLANK, ...current };
  const body = document.createElement('div');
  const sheet = openSheet({ title: 'Filters', content: body, size: 'full' });
  const accts = () => activeAccounts();

  function draftFromInputs() {
    d.from = $('#fl-from', body).value || '';
    d.to = $('#fl-to', body).value || '';
    const mn = parseAmount($('#fl-min', body).value), mx = parseAmount($('#fl-max', body).value);
    d.min = mn != null && mn >= 0 ? mn : null;
    d.max = mx != null && mx >= 0 ? mx : null;
    d.acct = $('#fl-acct', body).value || null;
    d.cat = $('#fl-cat', body).value || null;
    if (d.from || d.to) d.month = 'all'; // a date range replaces the month picker
  }

  function render() {
    const saved = store.settings.savedFilters;
    const cats = store.categories.filter(c => !c.archived);
    const sym = esc(cur().symbol);
    body.innerHTML = `<div class="form">
      <div><label class="field-label">${icon('calendar', 'xs')}Dates</label>
        <div class="chip-wrap">${PRESETS().map(([l, f, t]) => `<button class="chip" data-range="${f}|${t}" aria-pressed="${d.from === f && d.to === t}">${l}</button>`).join('')}
          <button class="chip" data-range="|" aria-pressed="${!d.from && !d.to}">Any time</button></div>
        <div class="form-row" style="margin-top:10px">
          <label class="field"><span class="prefix">From</span><input id="fl-from" type="date" value="${esc(d.from)}"></label>
          <label class="field"><span class="prefix">To</span><input id="fl-to" type="date" value="${esc(d.to)}"></label>
        </div></div>
      <div><label class="field-label">Amount</label>
        <div class="form-row">
          <label class="field"><span class="prefix">Min ${sym}</span><input id="fl-min" inputmode="decimal" placeholder="Any" value="${d.min != null ? esc(fromMinor(d.min)) : ''}"></label>
          <label class="field"><span class="prefix">Max ${sym}</span><input id="fl-max" inputmode="decimal" placeholder="Any" value="${d.max != null ? esc(fromMinor(d.max)) : ''}"></label>
        </div></div>
      <div class="form-row">
        <div><label class="field-label">Account</label><label class="field"><select id="fl-acct"><option value="">All accounts</option>${accts().map(a => `<option value="${esc(a.id)}" ${d.acct === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label></div>
        <div><label class="field-label">Category</label><label class="field"><select id="fl-cat"><option value="">All categories</option>${['expense', 'income'].map(k => `<optgroup label="${k === 'expense' ? 'Spending' : 'Income'}">${cats.filter(c => c.kind === k).map(c => `<option value="${esc(c.id)}" ${d.cat === c.id ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}</select></label></div>
      </div>
      <div class="row" style="gap:10px;margin-top:6px">
        <button class="btn md btn-plain press" data-act="reset" style="flex:1">Reset</button>
        <button class="btn md glass tint btn-primary press" data-act="apply" style="flex:2">Show results</button>
      </div>

      <div class="caps" style="padding:18px 6px 2px">Saved searches</div>
      <div class="group-foot" style="padding-top:0">Saves everything above plus your search text, type and payment-method chips.</div>
      <div class="glass group">
        ${saved.map(s => `<div class="cell"><span class="cell-icon" style="--c:var(--accent-rgb)">${icon('search')}</span><button class="label" data-act="use" data-id="${esc(s.id)}" style="text-align:left;background:none">${esc(s.name)}</button><button class="icon-btn sm plain press" data-act="del" data-id="${esc(s.id)}" aria-label="Delete ${esc(s.name)}">${icon('trash', 'sm')}</button></div>`).join('')}
        <div class="cell"><label class="field" style="flex:1;min-height:40px"><input id="fl-name" maxlength="30" placeholder="Name this search, e.g. Food last month"></label>
          <button class="btn sm glass tint btn-primary press" data-act="save" style="margin-left:8px">Save</button></div>
      </div>
    </div>`;
  }

  body.addEventListener('click', e => {
    const r = e.target.closest('[data-range]');
    if (r) {
      draftFromInputs();
      const [f, t] = r.dataset.range.split('|');
      d.from = f; d.to = t; if (f || t) d.month = 'all';
      haptic('selection'); render(); return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'reset') { Object.assign(d, { ...BLANK, q: d.q, type: d.type, method: d.method }); haptic('light'); render(); return; }
    if (act.dataset.act === 'apply') { draftFromInputs(); onApply({ ...d }); sheet.close(); return; }
    if (act.dataset.act === 'use') {
      const s = store.settings.savedFilters.find(x => x.id === act.dataset.id);
      if (s) { onApply({ ...BLANK, ...s.f }); sheet.close(); }
      return;
    }
    if (act.dataset.act === 'del') {
      haptic('warning');
      setSettings({ savedFilters: store.settings.savedFilters.filter(x => x.id !== act.dataset.id) });
      render(); return;
    }
    if (act.dataset.act === 'save') {
      draftFromInputs();
      const name = $('#fl-name', body).value.trim();
      if (!name) { toast('Give the search a name', { icon: 'alert', tone: 'warn' }); return; }
      if (store.settings.savedFilters.length >= 12) { toast('You can save up to 12 searches', { icon: 'alert', tone: 'warn' }); return; }
      setSettings({ savedFilters: [...store.settings.savedFilters, { id: 'f_' + uid().slice(0, 8), name, f: normFilter(d) }] });
      haptic('success');
      toast('Search saved', { sub: name, icon: 'check-circle', tone: 'pos' });
      render();
    }
  });
  render();
  return sheet;
}
