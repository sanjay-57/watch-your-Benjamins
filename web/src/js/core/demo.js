// Deterministic, realistic sample data (≈3 months) for "Explore with sample data".
import { todayKey, addDays, parseKey, addMonths, dateInMonth } from './dates.js';
import { DEFAULT_CATEGORIES } from './store.js';
import { cur, PRICE_SCALE } from './money.js';

// rough local-price scale relative to INR sample amounts

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemo(currency) {
  const k = PRICE_SCALE[currency] ?? 1;
  const f = cur().factor;
  const nice = inr => {
    const v = inr * k;
    const step = v >= 5000 ? 100 : v >= 1000 ? 50 : v >= 100 ? 10 : v >= 20 ? 1 : v >= 5 ? 0.5 : 0.05;
    return Math.max(Math.round(f * step), Math.round((Math.round(v / step) * step) * f));
  };
  const R = rng(1234567);
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const between = (a, b) => a + R() * (b - a);
  const now = Date.now();

  const accounts = [
    { id: 'cash', type: 'cash', name: 'Cash', opening: nice(2600), order: 0, createdAt: now },
    { id: 'gpay', type: 'upi', name: 'GPay', opening: nice(38000), order: 1, createdAt: now },
    { id: 'card_plat', type: 'card', name: 'Platinum Card', opening: -nice(9800), limit: nice(150000), dueDay: 5, last4: '4821', network: 'visa', theme: 'ink', order: 2, createdAt: now },
    { id: 'card_cb', type: 'card', name: 'Cashback Card', opening: 0, limit: nice(80000), dueDay: 18, last4: '0937', network: 'mastercard', theme: 'khaki', order: 3, createdAt: now },
  ];

  const txs = [];
  let n = 0;
  // what each card owes (minor units) so bill payments match real statements
  const owed = { card_plat: -accounts[2].opening, card_cb: 0 };
  const stmt = { card_plat: 0, card_cb: 0 };
  const add = (date, type, amountInr, accountId, extra = {}) => {
    const hh = String(8 + Math.floor(R() * 14)).padStart(2, '0');
    const mm = String(Math.floor(R() * 60)).padStart(2, '0');
    const amount = extra.raw ?? nice(amountInr);
    txs.push({ id: 'demo' + (n++).toString(36), type, amount, accountId, date, time: extra.time || `${hh}:${mm}`, note: extra.note || '', categoryId: extra.cat, toAccountId: extra.to, createdAt: now - n, updatedAt: now });
    if (accountId in owed) owed[accountId] += type === 'expense' ? amount : type === 'income' ? -amount : 0;
    if (type === 'transfer' && extra.to in owed) owed[extra.to] -= amount;
  };

  const today = todayKey();
  const start = addMonths(today.slice(0, 7), -2) + '-01';
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const dt = parseKey(d);
    const dom = dt.getDate();
    const dow = dt.getDay();
    const weekend = dow === 0 || dow === 6;

    if (dom === 1) { stmt.card_plat = owed.card_plat; stmt.card_cb = owed.card_cb; }
    if (dom === 1) add(d, 'income', 85000, 'gpay', { cat: 'salary', note: 'Salary', time: '09:00' });
    if (dom === 5) add(d, 'expense', 22000, 'gpay', { cat: 'rent', note: 'Rent', time: '10:15' });
    if (dom === 8) add(d, 'expense', 799, 'gpay', { cat: 'bills', note: 'Internet' });
    if (dom === 10) add(d, 'expense', between(1500, 2300), 'gpay', { cat: 'bills', note: 'Electricity bill' });
    if (dom === 12) add(d, 'expense', 649, 'card_plat', { cat: 'subscriptions', note: 'Streaming' });
    if (dom === 15) add(d, 'expense', 299, 'gpay', { cat: 'bills', note: 'Mobile recharge' });
    if (dom === 20) add(d, 'expense', 119, 'card_cb', { cat: 'subscriptions', note: 'Music' });
    if (dom === 3) {
      // pay last month's statements in full
      for (const c of ['card_plat', 'card_cb']) if (stmt[c] > 0) add(d, 'transfer', 0, 'gpay', { to: c, raw: stmt[c], time: '10:30' });
    }
    if (dom === 22 && R() > 0.3) add(d, 'income', between(12000, 26000), 'gpay', { cat: 'freelance', note: pick(['Website project', 'Design gig', 'Consulting']) });
    if (dom % 9 === 0) add(d, 'transfer', pick([2000, 3000, 2500]), 'gpay', { to: 'cash', note: '' });

    // daily life
    if (R() < 0.8) add(d, 'expense', between(90, 280), R() < 0.65 ? 'gpay' : 'cash', { cat: 'food', note: pick(['Chai & snacks', 'Coffee', 'Lunch', 'Breakfast', '']) });
    if (R() < (weekend ? 0.6 : 0.3)) {
      add(d, 'expense', between(350, 1400), R() < 0.4 ? 'card_cb' : 'gpay', { cat: 'food', note: pick(['Dinner out', 'Food delivery', 'Pizza night', 'Biryani', 'Brunch']) });
    }
    if (!weekend && R() < 0.75) add(d, 'expense', between(40, 320), R() < 0.55 ? 'gpay' : 'cash', { cat: 'transport', note: pick(['Metro', 'Auto', 'Cab', 'Bus']) });
    if (dow === 6) add(d, 'expense', between(1100, 3400), R() < 0.5 ? 'card_plat' : 'gpay', { cat: 'groceries', note: pick(['Weekly groceries', 'Supermarket', 'Vegetables & fruits']) });
    if (dom % 13 === 2) add(d, 'expense', between(1500, 2400), 'card_plat', { cat: 'fuel', note: 'Fuel' });
    if (R() < 0.08) add(d, 'expense', between(700, 5200), 'card_cb', { cat: 'shopping', note: pick(['Sneakers', 'Clothes', 'Headphones', 'Home decor', 'Books', 'Gadget case']) });
    if (weekend && R() < 0.35) add(d, 'expense', between(300, 1600), R() < 0.5 ? 'card_plat' : 'gpay', { cat: 'entertainment', note: pick(['Movie', 'Bowling', 'Concert', 'Gaming']) });
    if (R() < 0.05) add(d, 'expense', between(150, 1300), 'gpay', { cat: 'health', note: pick(['Pharmacy', 'Doctor visit', 'Vitamins']) });
    if (R() < 0.04) add(d, 'expense', between(200, 900), 'cash', { cat: 'personal', note: pick(['Haircut', 'Salon', 'Skincare']) });
    if (R() < 0.03) add(d, 'income', between(40, 350), 'card_cb', { cat: 'refund', note: 'Cashback' });
    if (R() < 0.02) add(d, 'expense', between(500, 2500), 'gpay', { cat: 'gifts', note: pick(['Birthday gift', 'Donation', 'Wedding gift']) });
  }

  const recurring = [
    { id: 'r_salary', type: 'income', amount: nice(85000), accountId: 'gpay', categoryId: 'salary', note: 'Salary', day: 1, next: nextOn(1, today), active: true, createdAt: now },
    { id: 'r_rent', type: 'expense', amount: nice(22000), accountId: 'gpay', categoryId: 'rent', note: 'Rent', day: 5, next: nextOn(5, today), active: true, createdAt: now },
    { id: 'r_stream', type: 'expense', amount: nice(649), accountId: 'card_plat', categoryId: 'subscriptions', note: 'Streaming', day: 12, next: nextOn(12, today), active: true, createdAt: now },
  ];
  // tag matching generated txs as recurring so the repeat icon shows
  for (const t of txs) {
    if (t.note === 'Salary') t.recurringId = 'r_salary';
    else if (t.note === 'Rent') t.recurringId = 'r_rent';
    else if (t.note === 'Streaming') t.recurringId = 'r_stream';
  }

  return {
    accounts,
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c, budget: c.id === 'food' ? nice(12000) : c.id === 'shopping' ? nice(8000) : 0 })),
    recurring,
    txs,
    budget: nice(85000),
  };
}

function nextOn(day, today) {
  const mk = today.slice(0, 7);
  const d = dateInMonth(mk, day);
  return d > today ? d : dateInMonth(addMonths(mk, 1), day);
}

