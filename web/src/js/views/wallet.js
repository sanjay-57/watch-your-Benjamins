import { esc } from '../core/util.js';
import { money } from '../core/money.js';
import { store, totals, balances, activeAccounts, cardInfo } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { acctGlyph, acctSub } from './common.js';
import { ccardHTML } from './manage.js';

export function renderWallet(root) {
  const T = totals();
  const b = balances();
  const acts = activeAccounts();
  const money_ = acts.filter(a => a.type !== 'card');
  const cards = acts.filter(a => a.type === 'card');
  const archived = store.accounts.filter(a => a.archived);
  let used = 0, limit = 0;
  for (const c of cards) { const ci = cardInfo(c); used += ci.due; limit += c.limit || 0; }
  const util = limit ? used / limit : 0;

  root.innerHTML = `
  <div class="scroller" data-scroller>
    <div class="page enter">
      <header class="lt" style="--n:0">
        <div><span class="eyebrow">${acts.length} account${acts.length === 1 ? '' : 's'}</span><h1>Wallet</h1></div>
        <div class="lt-actions"><button class="icon-btn glass press" data-act="add-acct" aria-label="Add account">${icon('plus')}</button></div>
      </header>

      <section class="networth glass glass-glow tilt" style="--n:1">
        <div class="caps">Balance</div>
        <div class="big amt ${T.balance < 0 ? 'neg' : ''}">${esc(money(T.balance))}</div>
        <div class="cols">
          <div><div class="k">Card dues</div><div class="v amt ${T.cardDue ? 'neg' : ''}">${esc(money(T.cardDue))}</div></div>
          <div><div class="k">Card limit left</div><div class="v amt ${T.cardAvail < 0 ? 'neg' : ''}">${T.limit ? esc(money(T.cardAvail)) : '—'}</div></div>
        </div>
      </section>

      <div class="section" style="--n:2">
        <div class="section-h"><h2>Money</h2><span class="t3 t-foot amt">${esc(money(T.liquid))}</span></div>
        <div class="acct-grid">
          ${money_.map(a => {
            const v = b.get(a.id) || 0;
            return `<button class="acct glass press" data-act="acct" data-id="${esc(a.id)}">
              ${acctGlyph(a)}
              <div><div class="nm ellip">${esc(a.name)}</div><div class="bal amt ${v < 0 ? 'neg' : ''}">${esc(money(v))}</div><div class="t-foot t3" style="margin-top:3px">${esc(acctSub(a))}</div></div>
            </button>`;
          }).join('')}
          <button class="acct add press" data-act="add-acct" data-type="upi">${icon('plus')}Add account</button>
        </div>
      </div>

      <div class="section" style="--n:3">
        <div class="section-h"><h2>Credit cards</h2>${cards.length ? `<span class="t3 t-foot amt">${esc(money(used))} due</span>` : ''}</div>
        ${cards.length ? `
          <div class="cards-stack">${cards.map(c => ccardHTML(c)).join('')}</div>
          ${limit ? `<div class="card glass" style="margin-top:14px">
            <div class="row" style="justify-content:space-between"><span class="caps">Total credit used</span><span class="t-foot ${util > 0.3 ? 'warn' : 't2'}">${Math.round(util * 100)}%</span></div>
            <div class="bar" style="margin-top:10px;--c:${util > 0.75 ? 'var(--neg-rgb)' : util > 0.3 ? 'var(--warn-rgb)' : 'var(--pos-rgb)'}"><i style="--v:${Math.min(1, util).toFixed(3)}"></i></div>
            <div class="row t-foot t2" style="justify-content:space-between;margin-top:8px"><span class="amt">${esc(money(used))} used</span><span class="amt">${esc(money(limit - used))} available</span></div>
          </div>` : ''}
          <button class="btn block btn-plain press" data-act="add-acct" data-type="card" style="margin-top:12px">${icon('plus', 'sm')}Add another card</button>`
        : `<button class="hint-add glass press" data-act="add-acct" data-type="card" style="width:100%;text-align:left">
            <span class="mglyph" style="--c:var(--m-card-rgb)">${icon('card')}</span>
            <div class="grow"><div class="t-headline">Add a credit card</div><div class="t-foot t2">Track what you owe, your limit and due date.</div></div>${icon('chev-r', 'sm')}
          </button>`}
      </div>

      ${archived.length ? `<div class="section" style="--n:4">
        <div class="section-h"><h2>Archived</h2></div>
        <div class="glass group">${archived.map(a => `<button class="cell" data-act="acct" data-id="${esc(a.id)}">${acctGlyph(a)}<span class="label">${esc(a.name)}<small class="amt">${esc(money(b.get(a.id) || 0))}</small></span>${icon('chev-r', 'chev')}</button>`).join('')}</div>
      </div>` : ''}

      <p class="t-foot t3" style="text-align:center;margin:26px 20px 0;line-height:1.5">Card spends only use up the card’s limit — your Cash and GPay balance stays the same. Paying the card bill moves money out of your balance, and it’s never counted as spending twice.</p>
    </div>
  </div>
  <div class="topbar"><div class="topbar-title">Wallet</div></div>`;
}
