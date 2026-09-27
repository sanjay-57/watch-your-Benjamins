// Hand-drawn 24×24 line icons (SF Symbols-ish). Injected once as an SVG sprite;
// use with: <svg class="i"><use href="#i-name"/></svg>
const DOT = 'fill="currentColor" stroke="none"';

const ICONS = {
  home: '<path d="M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.3v-5.6H9.3v5.6H5A1.5 1.5 0 0 1 3.5 19z"/>',
  activity: `<path d="M9.2 6.5h10.8M9.2 12h10.8M9.2 17.5h10.8"/><circle cx="4.9" cy="6.5" r="1.25" ${DOT}/><circle cx="4.9" cy="12" r="1.25" ${DOT}/><circle cx="4.9" cy="17.5" r="1.25" ${DOT}/>`,
  insights: '<path d="M10.8 4.6a7.9 7.9 0 1 0 8.6 8.6h-8.6z"/><path d="M14.2 3.4v6.9h6.9a6.9 6.9 0 0 0-6.9-6.9z"/>',
  wallet: '<rect x="3" y="6.2" width="18" height="14" rx="3.2"/><path d="M5.2 6.2 15.4 3.5a1.6 1.6 0 0 1 2 1.2l.35 1.5"/><path d="M21 11.2h-4.6a2.1 2.1 0 0 0 0 4.2H21"/><circle cx="16.6" cy="13.3" r=".9" ' + DOT + '/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2.6"/><circle cx="12" cy="12" r="2.7"/><path d="M6 9.4v.01M18 14.6v.01"/>',
  upi: '<rect x="6.8" y="2.8" width="10.4" height="18.4" rx="2.8"/><path d="M11 18.1h2"/><path d="m10.8 8.4 2.7 2.8-2.7 2.8"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.8"/><path d="M2.5 9.7h19M6.5 15h3.6"/>',
  bank: '<path d="M3.5 9.4 12 4l8.5 5.4M5 9.5h14M6.6 9.6v7.8M10.2 9.6v7.8M13.8 9.6v7.8M17.4 9.6v7.8M4 20.3h16"/>',
  in: '<path d="M17 7 7 17M7 8.6V17h8.4"/>',
  out: '<path d="M7 17 17 7M8.6 7H17v8.4"/>',
  transfer: '<path d="M4 8h14.5M15 4.5 18.5 8 15 11.5M20 16H5.5M9 12.5 5.5 16 9 19.5"/>',
  adjust: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  search: '<circle cx="11" cy="11" r="6.6"/><path d="m20 20-4.3-4.3"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  'chev-r': '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  'chev-l': '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  'chev-d': '<path d="M5.5 9.2 12 15.7l6.5-6.5"/>',
  'chev-u': '<path d="M5.5 14.8 12 8.3l6.5 6.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  trash: '<path d="M4.5 7h15M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7M6.5 7l.9 11.6a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7M10 11v5.5M14 11v5.5"/>',
  edit: '<path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0 0-3L17.8 5a2.1 2.1 0 0 0-3 0L4 15.8z"/><path d="M13.5 6.5l4 4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  back: '<path d="M8.6 5.5H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8.6a2 2 0 0 1-1.5-.7L2.8 12l4.3-5.8a2 2 0 0 1 1.5-.7z"/><path d="m11.5 9.5 5 5M16.5 9.5l-5 5"/>',
  repeat: '<path d="M17 3.5l3 3-3 3M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5l-3-3 3-3M20 12.5v1a4 4 0 0 1-4 4H4"/>',
  bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.6"/><path d="M8 10.5V7.5a4 4 0 1 1 8 0v3"/>',
  download: '<path d="M12 3.5V15M7 10.5l5 5 5-5M4.5 20.5h15"/>',
  upload: '<path d="M12 15.5V4M7 8.5l5-5 5 5M4.5 20.5h15"/>',
  share: '<path d="M12 3.5v11.5M7.8 7.4 12 3.2l4.2 4.2M8 10.5H6.2a1.7 1.7 0 0 0-1.7 1.7v6.6a1.7 1.7 0 0 0 1.7 1.7h11.6a1.7 1.7 0 0 0 1.7-1.7v-6.6a1.7 1.7 0 0 0-1.7-1.7H16"/>',
  moon: '<path d="M20 14.6A8 8 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" ' + DOT + '/>',
  sparkles: '<path d="M11 3.5c.6 4.2 2.6 6.2 6.8 6.8-4.2.6-6.2 2.6-6.8 6.8-.6-4.2-2.6-6.2-6.8-6.8 4.2-.6 6.2-2.6 6.8-6.8z"/><path d="M18.5 15.5c.25 1.6 1 2.35 2.6 2.6-1.6.25-2.35 1-2.6 2.6-.25-1.6-1-2.35-2.6-2.6 1.6-.25 2.35-1 2.6-2.6z"/>',
  tag: '<path d="M3.5 12.2V5a1.5 1.5 0 0 1 1.5-1.5h7.2c.4 0 .8.2 1.1.4l7.3 7.3a1.5 1.5 0 0 1 0 2.1l-7.2 7.2a1.5 1.5 0 0 1-2.1 0l-7.4-7.2c-.3-.3-.4-.7-.4-1.1z"/><path d="M8 8h.01"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M3.5 3.5l17 17M10 5.7a9 9 0 0 1 2-.2c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.7 3.4M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 5.3-1.7M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1h-.2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  info: '<circle cx="12" cy="12" r="8.8"/><path d="M12 11v5.4M12 7.9v.01"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" ' + DOT + '/>',
  'trend-up': '<path d="M3.5 17 9.5 11l4 4 7-7.5M15 7.5h5.5V13"/>',
  'trend-down': '<path d="M3.5 7 9.5 13l4-4 7 7.5M15 16.5h5.5V11"/>',
  note: '<path d="M5 5.5h14M5 10h14M5 14.5h9M5 19h6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  more: '<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="3.2"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2a1.7 1.7 0 0 1 1.3-2.8h2a3.9 3.9 0 0 0 3.9-3.9C20.5 7 16.7 3.5 12 3.5z"/><path d="M7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01M17 11h.01" stroke-width="2.6"/>',
  droplet: '<path d="M12 3.2s6.5 6.6 6.5 11.1a6.5 6.5 0 0 1-13 0C5.5 9.8 12 3.2 12 3.2z"/><path d="M9 14.5a3 3 0 0 0 3 3"/>',
  zap: '<path d="M13 2.8 4.5 13.5H12l-1 7.7 8.5-10.7H12z"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
  database: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8V6M4.5 12c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8"/>',
  file: '<path d="M14 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3.5V9h5.5M8.5 13h7M8.5 16.5h4.5"/>',
  undo: '<path d="M9 14.5 4 9.5l5-5"/><path d="M4 9.5h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="2.8"/><path d="M3 7v4c0 1.5 2.7 2.8 6 2.8M3 11v4c0 1.5 2.7 2.8 6 2.8"/><ellipse cx="15" cy="13" rx="6" ry="2.8"/><path d="M9 13v4c0 1.5 2.7 2.8 6 2.8s6-1.3 6-2.8v-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5z"/>',
  haptic: '<rect x="8" y="4" width="8" height="16" rx="2.2"/><path d="M4.5 8.5v7M19.5 8.5v7M2 10.5v3M22 10.5v3"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  flame: '<path d="M12 21c4 0 6.5-2.6 6.5-6.3 0-3.4-2.3-5.6-4.2-7.7-.5 2-1.6 3-2.8 3.3.4-3.1-.9-5.6-3-7.3.1 3.6-3.3 5.6-3.3 10.6C5.2 18.2 8 21 12 21z"/>',
  receipt: '<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>',
  'x-circle': '<circle cx="12" cy="12" r="8.8"/><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.8"/><path d="m8.2 12.4 2.6 2.6 5-5.2"/>',
  alert: '<path d="M10.3 4.3 2.9 17.2a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 16.8v.01"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  pie: '<path d="M21 12a9 9 0 1 1-9-9v9z"/>',
  wand: '<path d="m4 20 11-11M15 5V3M19 9h2M17.8 6.2l1.4-1.4M12 6.2l-1.4-1.4M17.8 11.8l1.4 1.4"/>',
  split: '<path d="M4 12h16M12 4v16"/>',
};

export function injectSprite() {
  if (document.getElementById('wyb-sprite')) return;
  const symbols = Object.entries(ICONS)
    .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
    .join('');
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg id="wyb-sprite" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${symbols}</svg>`;
  document.body.prepend(wrap.firstChild);
}

/** Inline icon markup string. */
export const icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
