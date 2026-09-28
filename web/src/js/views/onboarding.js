import { $, esc } from '../core/util.js';
import { cur, setCurrency, guessCurrency, currencyName, parseAmount, money, CURRENCIES } from '../core/money.js';
import { ordinal } from '../core/dates.js';
import { store, setSettings, updateAccount, addAccount, replaceAll, repricePresets, CARD_THEMES } from '../core/store.js';
import { generateDemo } from '../core/demo.js';
import { requestPersist } from '../core/db.js';
import { haptic } from '../core/native.js';
import { nav } from '../core/nav.js';
import { icon } from '../ui/icons.js';
import { logo } from '../ui/logo.js';
import { mountAurora } from '../ui/aurora.js';
import { openCurrencyPicker } from './manage.js';
import { toast } from '../ui/overlays.js';

const WORD = { INR: 'rupee', PKR: 'rupee', NPR: 'rupee', LKR: 'rupee', USD: 'dollar', CAD: 'dollar', AUD: 'dollar', NZD: 'dollar', SGD: 'dollar', HKD: 'dollar', EUR: 'euro', GBP: 'pound', EGP: 'pound', AED: 'dirham', SAR: 'riyal', QAR: 'riyal', OMR: 'rial', JPY: 'yen', CNY: 'yuan', BDT: 'taka', KRW: 'won' };
const TOP = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'CAD', 'AUD', 'SGD'];

export function showOnboarding({ onDone }) {
  const st = { step: 0, name: store.settings.name || '', currency: store.settings.onboarded ? store.settings.currency : guessCurrency(), cash: '', upi: '', upiName: 'GPay', cards: [] };
  setCurrency(st.currency);
  const el = document.createElement('div');
  el.className = 'onb';
  el.innerHTML = `
    <div class="aurora" aria-hidden="true"><i class="au au1"></i><i class="au au2"></i><i class="au au3"></i><i class="au au4"></i><i class="au-grain"></i></div>
    <div class="onb-track" id="onb-track">
      <section class="onb-step" data-s="0"></section>
      <section class="onb-step" data-s="1"></section>
      <section class="onb-step" data-s="2"></section>
      <section class="onb-step" data-s="3"></section>
    </div>`;
  document.body.appendChild(el);
  const unmountAurora = mountAurora(el.querySelector('.aurora'));
  const steps = [...el.querySelectorAll('.onb-step')];
  let backToken = null;

  const dots = i => `<div class="onb-dots">${[0, 1, 2, 3].map(j => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>`;
  const word = () => WORD[st.currency] || 'penny';

  function s0() {
    return `<div class="onb-inner">
      <div class="onb-hero">
        <div class="onb-logo">
          ${logo(250, 'onb-glyph')}
          <span class="orb glass" style="--r:min(118px,15vh);--d:16s;width:44px;height:46px;left:calc(50% - 23px);top:calc(50% - 23px)"><span class="mglyph" style="--c:var(--m-cash-rgb);width:100%;height:100%;border-radius:50%">${icon('cash')}</span></span>
          <span class="orb glass" style="--r:min(118px,15vh);--d:16s;animation-delay:-5.33s;width:44px;height:46px;left:calc(50% - 23px);top:calc(50% - 23px)"><span class="mglyph" style="--c:var(--m-upi-rgb);width:100%;height:100%;border-radius:50%">${icon('upi')}</span></span>
          <span class="orb glass" style="--r:min(118px,15vh);--d:16s;animation-delay:-10.66s;width:44px;height:46px;left:calc(50% - 23px);top:calc(50% - 23px)"><span class="mglyph" style="--c:var(--m-card-rgb);width:100%;height:100%;border-radius:50%">${icon('card')}</span></span>
        </div>
      </div>
      <h1>Watch your<br><span class="grad">Benjamins.</span></h1>
      <p class="lead">Cash, GPay and credit cards — every ${word()} in one beautiful, private place.</p>
      <div class="onb-feats">
        <div class="onb-feat"><span class="mglyph" style="--c:var(--pos-rgb)">${icon('shield')}</span><div><b>Private by design</b><span>No account, no cloud — it all stays on this phone.</span></div></div>
        <div class="onb-feat"><span class="mglyph" style="--c:var(--accent-rgb)">${icon('zap')}</span><div><b>Two taps to log</b><span>Calculator keypad, smart categories, quick-add.</span></div></div>
        <div class="onb-feat"><span class="mglyph" style="--c:var(--m-card-rgb)">${icon('card')}</span><div><b>Cards done right</b><span>Card spends stay off your balance until you pay the bill.</span></div></div>
      </div>
      <div class="onb-actions">
        <button class="btn block glass tint btn-primary press" data-act="next">Get started</button>
        <button class="btn block btn-plain press" data-act="demo">${icon('sparkles', 'sm')}Explore with sample data</button>
      </div>
      ${dots(0)}
    </div>`;
  }

  function s1() {
    const list = TOP.includes(st.currency) ? TOP : [st.currency, ...TOP.slice(0, 8)];
    return `<div class="onb-inner">
      <button class="icon-btn glass press" data-act="back" aria-label="Back" style="margin-bottom:18px">${icon('chev-l')}</button>
      <h2>Make it yours</h2>
      <p class="lead">We’ll use this to greet you and format your money.</p>
      <div class="form" style="margin-top:22px">
        <div><label class="field-label">Your first name</label><label class="field">${icon('user', 'sm')}<input id="ob-name" maxlength="40" placeholder="Optional" value="${esc(st.name)}" autocomplete="given-name" enterkeyhint="next"></label></div>
        <div><label class="field-label">Currency</label>
          <div class="cur-grid">${list.map(code => {
            const flag = (CURRENCIES.find(c => c[0] === code) || [])[1] || '💱';
            return `<button class="cur press" data-code="${code}" aria-pressed="${code === st.currency}"><span class="f">${flag}</span><b>${code}</b><small class="ellip" style="max-width:100%">${esc(currencyName(code))}</small></button>`;
          }).join('')}</div>
          <button class="btn block btn-plain press" data-act="more-cur" style="margin-top:10px;height:44px">More currencies</button>
        </div>
      </div>
      <div style="flex:1"></div>
      <div class="onb-actions"><button class="btn block glass tint btn-primary press" data-act="next">Continue</button></div>
      ${dots(1)}
    </div>`;
  }

  function s2() {
    const sym = esc(cur().symbol);
    return `<div class="onb-inner">
      <button class="icon-btn glass press" data-act="back" aria-label="Back" style="margin-bottom:18px">${icon('chev-l')}</button>
      <h2>Your money today</h2>
      <p class="lead">A rough number is fine — you can fine-tune everything later in Wallet.</p>
      <div class="form" style="margin-top:22px">
        <div><label class="field-label">${icon('cash', 'xs')} Cash in hand</label><label class="field"><span class="prefix">${sym}</span><input id="ob-cash" inputmode="decimal" placeholder="0" value="${esc(st.cash)}"></label></div>
        <div><label class="field-label">${icon('upi', 'xs')} GPay / bank balance</label><label class="field"><span class="prefix">${sym}</span><input id="ob-upi" inputmode="decimal" placeholder="0" value="${esc(st.upi)}"></label></div>
        <div>
          <label class="field-label">${icon('card', 'xs')} Credit cards</label>
          <div class="onb-cards-list">${st.cards.map((c, i) => `
            <div class="alert glass"><span class="mglyph" style="--c:var(--m-card-rgb)">${icon('card')}</span>
              <div class="main"><div class="title ellip">${esc(c.name)}</div><div class="meta">${parseAmount(c.owed) ? `${esc(money(parseAmount(c.owed)))} owed` : 'Nothing owed'}${parseAmount(c.limit) ? ` · limit ${esc(money(parseAmount(c.limit), { decimals: 'never' }))}` : ''}${c.dueDay ? ` · due ${ordinal(c.dueDay)}` : ''}</div></div>
              <button class="icon-btn sm press" data-rm="${i}" aria-label="Remove">${icon('close', 'sm')}</button></div>`).join('')}</div>
          <div class="card-form glass" id="ob-cardform" hidden>
            <div class="form">
              <div><label class="field-label" for="oc-name">Card name</label><label class="field"><input id="oc-name" maxlength="40" placeholder="e.g. HDFC Millennia" autocomplete="off"></label></div>
              <div class="form-row">
                <div><label class="field-label" for="oc-owed">Owed now</label><label class="field"><span class="prefix">${sym}</span><input id="oc-owed" inputmode="decimal" placeholder="0"></label></div>
                <div><label class="field-label" for="oc-limit">Credit limit</label><label class="field"><span class="prefix">${sym}</span><input id="oc-limit" inputmode="decimal" placeholder="Optional"></label></div>
              </div>
              <div><label class="field-label" for="oc-due">Bill due day</label><label class="field"><select id="oc-due"><option value="0">Not set</option>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${ordinal(i + 1)}</option>`).join('')}</select></label></div>
              <button class="btn block md glass tint btn-primary press" data-act="save-card">Add card</button>
            </div>
          </div>
          <button class="btn block btn-plain press" data-act="add-card" id="ob-addcard" style="margin-top:10px;height:46px">${icon('plus', 'sm')}Add a credit card</button>
        </div>
      </div>
      <div style="flex:1;min-height:20px"></div>
      <div class="onb-actions"><button class="btn block glass tint btn-primary press" data-act="finish">Continue</button></div>
      ${dots(2)}
    </div>`;
  }

  function s3() {
    const first = (st.name || '').trim().split(/\s+/)[0];
    const colors = ['var(--pos-rgb)', 'var(--accent-rgb)', 'var(--m-card-rgb)', 'var(--m-upi-rgb)', 'var(--spend-rgb)', 'var(--warn-rgb)'];
    return `<div class="onb-inner" style="justify-content:center;text-align:center">
      <div style="flex:1"></div>
      <div class="done-burst">
        ${Array.from({ length: 14 }, (_, i) => `<span class="spark" style="--a:${i * (360 / 14)}deg;--c:${colors[i % colors.length]};animation-delay:${0.2 + (i % 3) * 0.05}s"></span>`).join('')}
        <span class="core glass tint">${icon('check')}</span>
      </div>
      <h2 style="margin-top:26px">You’re all set${first ? `, ${esc(first)}` : ''}!</h2>
      <p class="lead">Tap <b>+</b> any time to log a spend. Pick Cash, GPay or a card — your balance updates instantly.</p>
      <div style="flex:1"></div>
      <div class="onb-actions"><button class="btn block glass tint btn-primary press" data-act="done">Start tracking</button></div>
      ${dots(3)}
    </div>`;
  }

  const RENDER = [s0, s1, s2, s3];

  function go(i) {
    readInputs();
    st.step = i;
    steps[i].innerHTML = RENDER[i]();
    $('#onb-track', el).style.transform = `translate3d(${-i * 100}%,0,0)`;
    steps.forEach((s, j) => s.setAttribute('aria-hidden', j === i ? 'false' : 'true'));
    haptic('selection');
    syncBack();
  }

  // system back (Android / browser) steps back through the form
  function syncBack() {
    const need = st.step === 1 || st.step === 2;
    if (need && !backToken) {
      const token = nav.push({
        close: ({ fromBack }) => { backToken = null; nav.remove(token, fromBack); go(st.step - 1); },
      });
      backToken = token;
    } else if (!need && backToken) {
      const t = backToken;
      backToken = null;
      nav.remove(t);
    }
  }

  function readInputs() {
    const v = id => $(id, el)?.value;
    if (v('#ob-name') != null) st.name = v('#ob-name').trim();
    if (v('#ob-cash') != null) st.cash = v('#ob-cash');
    if (v('#ob-upi') != null) st.upi = v('#ob-upi');
  }

  function setCur(code) {
    st.currency = code;
    setCurrency(code);
    readInputs();
    steps[1].innerHTML = s1();
  }

  async function finish(demo) {
    readInputs();
    if (demo) {
      const d = generateDemo(st.currency);
      replaceAll({
        settings: { ...store.settings, name: st.name, currency: st.currency, onboarded: true, demo: true, budget: d.budget, lastAcct: { expense: 'gpay', income: 'gpay' } },
        accounts: d.accounts, categories: d.categories, recurring: d.recurring, txs: d.txs,
      }, { keepSettings: true });
    } else {
      // currency first, so every amount below is parsed with the right number of decimals
      setSettings({ name: st.name, currency: st.currency });
      setCurrency(st.currency);
      repricePresets(st.currency);
      const cash = parseAmount(st.cash) || 0, upi = parseAmount(st.upi) || 0;
      updateAccount('cash', { opening: cash });
      updateAccount('gpay', { opening: upi });
      const themes = Object.keys(CARD_THEMES);
      st.cards.forEach((c, i) => addAccount({ type: 'card', name: c.name, opening: -Math.abs(parseAmount(c.owed) || 0), limit: Math.abs(parseAmount(c.limit) || 0), dueDay: c.dueDay || 0, network: 'other', theme: themes[i % themes.length] }));
      setSettings({ onboarded: true, demo: false });
    }
    requestPersist();
  }

  function close() {
    if (backToken) { nav.remove(backToken); backToken = null; }
    const a = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.08)' }], { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    a.finished.then(() => { unmountAurora(); el.remove(); });
    onDone?.();
  }

  el.addEventListener('click', e => {
    const code = e.target.closest('[data-code]');
    if (code) { setCur(code.dataset.code); haptic('selection'); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) { readInputs(); st.cards.splice(+rm.dataset.rm, 1); steps[2].innerHTML = s2(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'next') go(st.step + 1);
    else if (act === 'back') go(Math.max(0, st.step - 1));
    else if (act === 'more-cur') openCurrencyPicker({ current: st.currency, onPick: setCur });
    else if (act === 'add-card') { $('#ob-cardform', el).hidden = false; $('#ob-addcard', el).hidden = true; setTimeout(() => $('#oc-name', el).focus(), 50); }
    else if (act === 'save-card') {
      const name = $('#oc-name', el).value.trim() || `Card ${st.cards.length + 1}`;
      // keep what was typed; it's parsed with the final currency when onboarding finishes
      st.cards.push({ name, owed: $('#oc-owed', el).value, limit: $('#oc-limit', el).value, dueDay: +$('#oc-due', el).value || 0 });
      readInputs();
      steps[2].innerHTML = s2();
      haptic('success');
    } else if (act === 'finish') { finish(false); go(3); }
    else if (act === 'demo') {
      finish(true);
      haptic('success');
      close();
      setTimeout(() => toast('Sample data loaded', { sub: 'Clear it anytime in Settings → Start fresh', icon: 'sparkles' }), 500);
    } else if (act === 'done') { haptic('success'); close(); }
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'ob-name') { e.preventDefault(); go(2); }
  });

  steps[0].innerHTML = s0();
  return { el };
}
