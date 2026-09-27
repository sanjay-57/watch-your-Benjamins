// Quick buttons manager: one-tap presets shown on Home.
import { esc } from '../core/util.js';
import { money } from '../core/money.js';
import { store, category, account, presetList, resolvePreset, movePreset, addPreset, resetPresets, suggestions } from '../core/store.js';
import { haptic } from '../core/native.js';
import { openSheet } from '../ui/sheet.js';
import { toast, confirmDialog } from '../ui/overlays.js';
import { icon } from '../ui/icons.js';
import { catRGB, emptyState, txTitle } from './common.js';

const tx = () => import('./txsheet.js');

export function presetBadge(p) {
  if (p.type === 'transfer') return `<span class="ebadge sm" style="--c:var(--xfer-rgb)"><svg class="i" style="color:var(--xfer)"><use href="#i-transfer"/></svg></span>`;
  const c = category(p.categoryId);
  return `<span class="ebadge sm" style="--c:${catRGB(c)}">${esc(c?.emoji || '⚡')}</span>`;
}

export function presetSub(p) {
  const r = resolvePreset(p);
  const a = account(r.accountId), b = account(r.toAccountId);
  const where = p.type === 'transfer' ? `${a?.name || '?'} → ${b?.name || '?'}` : a?.name || '';
  return `${money(p.type === 'expense' ? -p.amount : p.amount)} · ${where}`;
}

export function openPresetManager() {
  const body = document.createElement('div');
  const sheet = openSheet({ title: 'Quick buttons', subtitle: 'One tap on Home logs them instantly', content: body, size: 'full', onClose: () => unsub() });
  const unsub = store.subscribe(() => { if (body.isConnected) render(); });

  function render() {
    const list = presetList();
    const have = new Set(list.map(p => `${p.categoryId}|${p.amount}|${(p.note || p.label).toLowerCase()}`));
    const sugg = suggestions().filter(t => !have.has(`${t.categoryId}|${t.amount}|${(t.note || category(t.categoryId)?.name || '').toLowerCase()}`)).slice(0, 5);
    body.innerHTML = `
      ${list.length ? `<div class="glass group" style="--sep-inset:62px">
        ${list.map((p, i) => `<div class="cell">
          ${presetBadge(p)}
          <button class="label" data-edit="${esc(p.id)}" style="text-align:left">${esc(p.label)}<small class="amt">${esc(presetSub(p))}</small></button>
          <button class="icon-btn sm press" data-move="${esc(p.id)}" data-dir="-1" aria-label="Move up" ${i === 0 ? 'disabled style="opacity:.25"' : ''}>${icon('chev-u', 'sm')}</button>
          <button class="icon-btn sm press" data-move="${esc(p.id)}" data-dir="1" aria-label="Move down" ${i === list.length - 1 ? 'disabled style="opacity:.25"' : ''}>${icon('chev-d', 'sm')}</button>
        </div>`).join('')}
      </div>` : `<div class="glass" style="border-radius:var(--r-lg)">${emptyState({ emoji: '⚡', title: 'No quick buttons', text: 'Make one for things you pay often — petrol, a recharge, a subscription.' })}</div>`}
      <button class="btn block glass tint btn-primary press" data-act="new" style="margin-top:16px">${icon('plus', 'sm')}New quick button</button>
      ${sugg.length ? `<div class="caps" style="padding:22px 6px 8px">From your history</div>
        <div class="glass group" style="--sep-inset:62px">${sugg.map((t, i) => {
          const c = category(t.categoryId), a = account(t.accountId);
          return `<div class="cell"><span class="ebadge sm" style="--c:${catRGB(c)}">${esc(c?.emoji || '🏷️')}</span>
            <span class="label">${esc(t.note || c?.name || txTitle(t))}<small class="amt">${esc(money(-t.amount))} · ${esc(a?.name || '')}</small></span>
            <button class="btn sm btn-plain press" data-sugg="${i}">${icon('plus', 'sm')}Add</button></div>`;
        }).join('')}</div>` : ''}
      <button class="btn block btn-plain press" data-act="reset" style="margin-top:16px">Restore default buttons</button>
      <p class="t-foot t3" style="margin:12px 8px 0">Tip: long-press a quick button on Home to edit or delete it.</p>`;
    body._sugg = sugg;
  }

  body.addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { const { openTxSheet } = await tx(); return openTxSheet({ mode: 'button', buttonId: ed.dataset.edit }); }
    const mv = e.target.closest('[data-move]');
    if (mv) { haptic('selection'); return movePreset(mv.dataset.move, +mv.dataset.dir); }
    const sg = e.target.closest('[data-sugg]');
    if (sg) {
      const t = body._sugg?.[+sg.dataset.sugg];
      if (!t) return;
      const label = (t.note || category(t.categoryId)?.name || 'Quick add').slice(0, 28);
      addPreset({ type: t.type, amount: t.amount, accountId: t.accountId, categoryId: t.categoryId, label, note: label });
      haptic('success');
      return toast('Quick button added', { sub: `${label} · ${money(t.amount)}`, icon: 'zap' });
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'new') { const { openTxSheet } = await tx(); openTxSheet({ mode: 'button' }); }
    else if (act === 'reset') {
      const ok = await confirmDialog({ title: 'Restore default buttons?', message: 'Your custom quick buttons are replaced by the defaults (Petrol, recharge, Apple Music…).', confirm: 'Restore', icon: 'zap' });
      if (ok) { resetPresets(); haptic('success'); toast('Default buttons restored', { icon: 'zap' }); }
    }
  });

  render();
  return sheet;
}
